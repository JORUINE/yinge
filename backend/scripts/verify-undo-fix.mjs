/**
 * verify-undo-fix.mjs — 「本轮已投完」卡死 bug 的回归验证
 * ------------------------------------------------------------------
 * 背景（2026-09-18 用户在 /battle/6aad508a... 截图报的）：
 *   旧版 undoLastStep 按 `matchOrder > 本场` 删除"更晚的场次"，
 *   但**同一轮内的兄弟场次 matchOrder 也是递增的** → 撤销一场半决赛时
 *   把另一场半决赛也删了 → 剩下"半决赛只有 1 场"的残缺轮次 →
 *   推进逻辑误判该轮已投完 → 用 1 个胜者生成**轮空决赛**（无法投票）→
 *   对局永久停在「本轮已投完，正在生成下一轮对阵…」。
 *
 * 这里真实连库（独立测试库 yinge_test，跑完即删），断言：
 *   ① 在半决赛撤销 → 两场半决赛都还在、决赛还没生成（旧代码会剩 1 场）
 *   ② 重新投完两场半决赛 → 决赛是**真打的一场**，不是轮空场
 *   ③ 造出"残缺轮次 + 轮空决赛"的坏局面 → getNextStep 能自愈推进，不再永远 await
 *   ④ 小组赛阶段撤销 → 复活 / 淘汰赛场次一并清掉（老行为不能坏）
 *
 * 运行：node scripts/verify-undo-fix.mjs
 */
import mongoose from 'mongoose';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/yinge_test';
process.env.JWT_SECRET = 'verify-undo-secret';
process.env.NODE_ENV = 'test';

const { config } = await import('../src/config/index.js');
config.vote.minIntervalMs = 0;
config.vote.perMinuteLimit = 1000000;
config.vote.perDayLimit = 1000000;

const { Battle, BattleMatch, BattleGroup, Album, Artist, Vote } = await import('../src/models/index.js');
const battleService = await import('../src/modules/battles/battle.service.js');
const voteService = await import('../src/modules/battles/vote.service.js');

const USER_ID = new mongoose.Types.ObjectId();
const LONG_AGO = new Date(Date.now() - 86400000 * 365);
let passed = 0;
const LOG = [];
function ok(cond, msg) {
  if (!cond) throw new Error('✗ FAIL: ' + msg);
  passed += 1;
  LOG.push('  ✓ ' + msg);
}

const KO = battleService.KO_NAMES;

async function seedArtist(artistId, name) {
  return Artist.findOneAndUpdate(
    { artistId },
    { artistId, name, albumCount: 0, cachedAt: new Date() },
    { upsert: true, new: true },
  );
}
async function seedAlbums(artistObjId, artistExternalId, n, base) {
  const docs = [];
  for (let i = 1; i <= n; i += 1) {
    docs.push({
      albumId: base + i,
      artistId: artistObjId,
      artistExternalId,
      artistName: `歌手${artistExternalId}`,
      name: `专辑 ${base + i}`,
      artworkUrl: 'http://example.com/art.jpg',
      trackCount: 10,
      releaseDate: new Date(2000 + i, 0, 1),
      isEligible: true,
      cachedAt: new Date(),
    });
  }
  await Album.insertMany(docs);
}

const step = () => battleService.getNextStep(battleId, USER_ID.toString());

let battleId = null;

/** 走完小组 + 复活 */
async function finishGroups() {
  for (;;) {
    const s = await step();
    if (s.phase !== 'group' && s.phase !== 'revival') return;
    const g = s.group;
    const albums = await Album.find({ _id: { $in: g.albums.map((a) => a.id) } });
    const byExt = new Map(albums.map((a) => [String(a.albumId), a]));
    const picked = g.albums.slice(0, g.advanceCount).map((a) => a.albumId);
    ok(picked.length === g.advanceCount, `${g.roundName} 第${g.groupNo ?? ''}组勾选 ${picked.length} 张`);
    await battleService.castGroupVote(battleId, g.groupId, picked, USER_ID.toString());
    void byExt;
  }
}

/** 投一场淘汰赛 */
async function voteOne(s) {
  const m = s.match;
  const winner = m.leftAlbum ? m.leftAlbum.albumId : m.rightAlbum.albumId;
  await voteService.castVote({
    battleId,
    matchId: m.matchId,
    albumId: winner,
    user: { _id: USER_ID.toString(), createdAt: LONG_AGO },
    meta: {},
  });
}

const koCounts = async () => {
  const ms = await BattleMatch.find({ battleId, roundName: { $in: KO } });
  const out = {};
  for (const n of KO) out[n] = ms.filter((m) => m.roundName === n).length;
  return out;
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  LOG.push('已连接 yinge_test（隔离测试库）');

  // —— 造一局：3 位歌手 × 8 张 = 24 张 → 6 组 + 复活 + 16 强淘汰（22 步）——
  const a1 = await seedArtist(1001, '歌手A');
  const a2 = await seedArtist(1002, '歌手B');
  const a3 = await seedArtist(1003, '歌手C');
  await seedAlbums(a1, 1001, 8, 100000);
  await seedAlbums(a2, 1002, 8, 200000);
  await seedAlbums(a3, 1003, 8, 300000);

  const battle = await battleService.createBattle(USER_ID.toString(), {
    scopeType: 'multi-artist',
    artists: [
      { artistId: 1001, albumCount: 8 },
      { artistId: 1002, albumCount: 8 },
      { artistId: 1003, albumCount: 8 },
    ],
    tournamentVersion: 2,
  });
  battleId = battle._id.toString();
  ok(battle.stepTotal === 22, `赛程规划 22 步（实得 ${battle.stepTotal}）`);

  await finishGroups();
  ok((await koCounts()).r16 === 8, '小组+复活走完 → 16 强生成 8 场');
  LOG.push('\n—— ① 半决赛阶段撤销：同轮兄弟场次必须留着 ——');

  // 打到半决赛前停：投完 r16 + qf
  for (;;) {
    const s = await step();
    if (s.phase !== 'knockout') break;
    if (s.match.roundName === 'semi') break;
    await voteOne(s);
  }
  const before = await koCounts();
  ok(before.semi === 2, `半决赛已生成 2 场（实得 ${before.semi}）`);
  ok(before.final === 0, '此时还没有决赛');
  const semiIdsBefore = (
    await BattleMatch.find({ battleId, roundName: 'semi' }).select('_id').lean()
  )
    .map((m) => String(m._id))
    .sort();

  // 投第一场半决赛，然后撤销
  let s = await step();
  ok(s.match.roundName === 'semi', '当前待投确实是半决赛');
  await voteOne(s);
  const undone = await battleService.undoLastStep(battleId, USER_ID.toString());
  ok(Boolean(undone?.undone), '撤销成功：' + undone.undone);

  const after = await koCounts();
  ok(after.semi === 2, `撤销后两场半决赛**都还在**（旧 bug 会只剩 1 场，实得 ${after.semi}）`);
  ok(after.final === 0, `撤销后没有多出决赛（旧 bug 会生成轮空决赛，实得 ${after.final}）`);

  const semiList = await BattleMatch.find({ battleId, roundName: 'semi' }).sort({ matchOrder: 1 });
  const semiIdsAfter = semiList.map((m) => String(m._id)).sort();
  ok(
    semiIdsAfter.length === 2 && semiIdsAfter.join() === semiIdsBefore.join(),
    '两场半决赛就是原来那两场（兄弟场次没被误删）',
  );
  ok(
    semiList.every((m) => !m.winnerAlbumId),
    '被撤销的那场回到"未决出"（此时两场都还没打，符合预期）',
  );

  // 反证：撤销必须只影响"本场 + 更晚阶段"，同轮兄弟的票不能被清掉
  const votesLeft = await Vote.countDocuments({ battleId, matchId: { $in: semiList.map((m) => m._id) } });
  ok(votesLeft === 0, `半决赛上不留残票（实得 ${votesLeft}）`);

  s = await step();
  ok(s.phase === 'knockout' && !s.finished, '撤销后仍可继续投票（不是 await 卡死态）');

  LOG.push('\n—— ② 重投两场半决赛：决赛必须是真打，不是轮空 ——');
  for (let i = 0; i < 2; i += 1) {
    const cur = await step();
    ok(cur.phase === 'knockout' && cur.match.roundName === 'semi', `第 ${i + 1} 场半决赛待投`);
    await voteOne(cur);
  }
  const fin = await BattleMatch.find({ battleId, roundName: 'final' });
  ok(fin.length === 1, `决赛生成 1 场（实得 ${fin.length}）`);
  ok(fin[0].isBye === false, '决赛是**真打的一场**，不是轮空（旧 bug 是 isBye=true）');
  ok(Boolean(fin[0].leftAlbumId && fin[0].rightAlbumId), '决赛两侧都有对手');

  // 打完决赛
  for (let g = 0; g < 6; g += 1) {
    const cur = await step();
    if (cur.finished) break;
    await voteOne(cur);
  }
  const done = await Battle.findById(battleId);
  ok(done.status === 'finished', '对局正常结束');
  ok(Boolean(done.championAlbumId), '冠军已决出');
  const c = await koCounts();
  ok(c.final === 1 && c.semi === 2, `轮次结构完好：[semi=${c.semi} final=${c.final}]`);

  LOG.push('\n—— ③ 自愈：手工造出"残缺轮次 + 轮空决赛"，getNextStep 不能再永远 await ——');
  // 造坏局面：删掉一场半决赛，并把决赛换成轮空场（复刻历史 bug 的最终形态）
  const semi = await BattleMatch.find({ battleId, roundName: 'semi' }).sort({ matchOrder: 1 });
  await BattleMatch.deleteOne({ _id: semi[1]._id });
  await BattleMatch.deleteMany({ battleId, roundName: 'final' });
  const survivor = await BattleMatch.findById(semi[0]._id);
  await BattleMatch.create({
    battleId,
    roundName: 'final',
    roundIndex: 1,
    matchOrder: 999,
    leftAlbumId: survivor.winnerAlbumId,
    rightAlbumId: null,
    isBye: true,
    isRevival: false,
  });
  await Battle.updateOne({ _id: battleId }, { $set: { status: 'playing', championAlbumId: null } });

  const healed = await step();
  ok(healed.phase !== 'await', `自愈生效：不再停在「本轮已投完」（phase=${healed.phase}）`);
  const healedBattle = await Battle.findById(battleId);
  ok(healedBattle.status === 'finished', '自愈后对局已判定结束（轮空决赛也能收尾）');
  ok(Boolean(healedBattle.championAlbumId), '自愈后冠军有值');

  LOG.push('\n—— ④ 撤销"最后一组小组投票"：随之生成的淘汰赛场次要一并清掉（老行为不回退） ——');
  const b1 = await seedArtist(2001, '歌手D');
  await seedAlbums(b1, 2001, 16, 400000);
  const b2 = await battleService.createBattle(USER_ID.toString(), {
    scopeType: 'artist',
    artistId: 2001,
    albumCount: 16,
    tournamentVersion: 2,
  });
  battleId = b2._id.toString();
  const groups = await BattleGroup.find({ battleId, roundName: 'group' }).sort({ groupNo: 1 });
  ok(groups.length === 4, `单歌手 16 张 → 4 个小组（实得 ${groups.length}）`);

  // 先投前 3 组：此时还没有任何淘汰赛场次
  for (const g of groups.slice(0, 3)) {
    const albums = await Album.find({ _id: { $in: g.albumIds } });
    // eslint-disable-next-line no-await-in-loop
    await battleService.castGroupVote(
      battleId,
      g._id.toString(),
      albums.slice(0, g.advanceCount).map((a) => a.albumId),
      USER_ID.toString(),
    );
  }
  ok((await BattleMatch.countDocuments({ battleId })) === 0, '投完 3 组时还没有淘汰赛场次');

  // 投第 4 组 → 触发 8 强生成（4 场）
  const g4 = groups[3];
  const alb4 = await Album.find({ _id: { $in: g4.albumIds } });
  await battleService.castGroupVote(
    battleId,
    g4._id.toString(),
    alb4.slice(0, g4.advanceCount).map((a) => a.albumId),
    USER_ID.toString(),
  );
  ok((await BattleMatch.countDocuments({ battleId })) === 4, '投完第 4 组 → 8 强 4 场已生成');

  await battleService.undoLastStep(battleId, USER_ID.toString());
  ok((await BattleMatch.countDocuments({ battleId })) === 0, '撤销第 4 组 → 淘汰赛场次被一并清掉');
  const pickedAfter = await BattleGroup.countDocuments({ battleId, pickedAt: { $ne: null } });
  ok(pickedAfter === 3, `小组投票回到 3 组已投（实得 ${pickedAfter}）`);
  const g4After = await BattleGroup.findById(g4._id);
  ok(g4After.pickedAlbumIds.length === 0, '被撤销的那组回到未选状态');

  LOG.push(`\n全部通过：${passed} 项断言 ✅`);
  console.log(LOG.join('\n'));
}

main()
  .then(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\n验证失败：\n' + LOG.join('\n'));
    console.error(err);
    try {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });
