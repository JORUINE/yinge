/**
 * verify-v2.mjs — 新赛制（tournamentVersion = 2）端到端接线验证
 * ------------------------------------------------------------------
 * 真实连库（独立测试库 yinge_test，跑完即删），不污染业务库。
 * 覆盖：① 创建（规模规划 + BattleGroup 生成）② 小组多选投票 ③ 遗珠复活
 *      ④ 1v1 淘汰逐轮推进 ⑤ 冠军决出 ⑥ 步数一致性（已投 = 总步数）。
 *
 * 运行：node scripts/verify-v2.mjs
 */
import mongoose from 'mongoose';

// 必须在加载 config 之前设置（config 模块加载即读取 process.env）
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/yinge_test';
process.env.JWT_SECRET = 'verify-v2-secret';
process.env.NODE_ENV = 'test';

const { config } = await import('../src/config/index.js');
// 关闭限流，避免集成测试被 300ms 间隔 / 每分钟上限拦截
config.vote.minIntervalMs = 0;
config.vote.perMinuteLimit = 1000000;
config.vote.perDayLimit = 1000000;

const { Battle, BattleMatch, BattleGroup, Album, Artist, Vote } = await import('../src/models/index.js');
const battleService = await import('../src/modules/battles/battle.service.js');
const voteService = await import('../src/modules/battles/vote.service.js');
const bracket = await import('../src/modules/battles/bracket.js');

const USER_ID = new mongoose.Types.ObjectId();
const LOG = [];
let passed = 0;
function ok(cond, msg) {
  if (!cond) throw new Error('✗ FAIL: ' + msg);
  passed += 1;
  LOG.push('  ✓ ' + msg);
}

const LONG_AGO = new Date(Date.now() - 86400000 * 365);

async function seedArtist(artistId, name) {
  const doc = await Artist.findOneAndUpdate(
    { artistId },
    { artistId, name, albumCount: 0, cachedAt: new Date() },
    { upsert: true, new: true },
  );
  return doc._id;
}

async function seedAlbums(artistObjId, artistExternalId, n, baseAlbumId) {
  const docs = [];
  for (let i = 1; i <= n; i += 1) {
    docs.push({
      albumId: baseAlbumId + i,
      artistId: artistObjId,
      artistExternalId,
      name: `专辑 ${baseAlbumId + i}`,
      artworkUrl: 'http://example.com/art.jpg',
      trackCount: 10,
      releaseDate: new Date(2000 + i, 0, 1),
      isEligible: true,
      cachedAt: new Date(),
    });
  }
  await Album.insertMany(docs);
}

/** 选择某场淘汰赛的胜者（按 matchOrder 奇偶轮换，避免触发"连续 15 场同侧"风控） */
function pickWinner(match) {
  const leftExt = match.leftAlbum?.albumId;
  const rightExt = match.rightAlbum?.albumId;
  if (match.matchOrder % 2 === 0) return leftExt ?? rightExt;
  return rightExt ?? leftExt;
}

async function runScenario(label, payload, expect) {
  LOG.push(`\n— 场景：${label} —`);
  const battle = await battleService.createBattle(USER_ID.toString(), payload);
  const b = battle.toObject();

  ok(b.tournamentVersion === 2, 'tournamentVersion === 2');
  ok(b.poolTarget === expect.pool, `poolTarget=${b.poolTarget}（期望 ${expect.pool}）`);
  ok(b.groupCount === expect.groups, `groupCount=${b.groupCount}（期望 ${expect.groups}）`);
  ok(b.revivalNeed === expect.revival, `revivalNeed=${b.revivalNeed}（期望 ${expect.revival}）`);
  ok(b.knockoutSize === expect.koSize, `knockoutSize=${b.knockoutSize}（期望 ${expect.koSize}）`);
  ok(b.stepTotal === expect.steps, `stepTotal=${b.stepTotal}（期望 ${expect.steps}）`);

  const groupDocs = await BattleGroup.find({ battleId: battle._id, roundName: 'group' });
  ok(groupDocs.length === expect.groups, `生成 ${groupDocs.length} 个小组（期望 ${expect.groups}）`);
  ok(
    groupDocs.every((g) => g.albumIds.length >= 1 && g.albumIds.length <= 4),
    '每个小组张数在 1~4 之间',
  );

  // ① 小组多选投票：每组勾选前 advanceCount 张
  for (const g of groupDocs) {
    const albums = await Album.find({ _id: { $in: g.albumIds } });
    const picked = albums.slice(0, g.advanceCount).map((a) => a.albumId);
    const r = await battleService.castGroupVote(battle._id.toString(), g._id.toString(), picked, USER_ID.toString());
    ok(r.invalid === false, `小组 ${g.groupNo} 投票成功`);
  }

  // ② 遗珠复活（若有）
  if (expect.revival > 0) {
    const step = await battleService.getNextStep(battle._id.toString(), USER_ID.toString());
    ok(step.phase === 'revival', '小组全投完后进入遗珠复活阶段');
    const revival = await BattleGroup.findOne({ battleId: battle._id, roundName: 'revival' });
    ok(!!revival, '生成 1 个复活分组');
    ok(revival.advanceCount === expect.revival, `复活需捞回 ${revival.advanceCount} 张（期望 ${expect.revival}）`);
    const revAlbums = await Album.find({ _id: { $in: revival.albumIds } });
    const revPicked = revAlbums.slice(0, revival.advanceCount).map((a) => a.albumId);
    await battleService.castGroupVote(battle._id.toString(), revival._id.toString(), revPicked, USER_ID.toString());
  }

  // ③ 淘汰赛逐场投票直到冠军
  let guard = 0;
  for (;;) {
    const step = await battleService.getNextStep(battle._id.toString(), USER_ID.toString());
    if (step.finished) break;
    ok(step.phase === 'knockout', `进入淘汰赛阶段（当前 ${step.phase}）`);
    const winnerExt = pickWinner(step.match);
    await voteService.castVote({
      battleId: battle._id.toString(),
      matchId: step.match.matchId,
      albumId: winnerExt,
      user: { _id: USER_ID.toString(), createdAt: LONG_AGO },
      meta: {},
    });
    guard += 1;
    if (guard > 100) throw new Error('✗ 淘汰赛投票陷入死循环');
  }

  const finished = await Battle.findById(battle._id);
  ok(finished.status === 'finished', '对决状态 = finished');
  ok(!!finished.championAlbumId, '冠军已决出');

  // ④ 步数一致性：已投 = 总步数
  const koMatches = await BattleMatch.find({ battleId: battle._id, roundName: { $in: battleService.KO_NAMES } });
  ok(koMatches.length === expect.koSize - 1, `淘汰赛场次=${koMatches.length}（期望 ${expect.koSize - 1}）`);
  const decidedGroups = await BattleGroup.countDocuments({ battleId: battle._id, pickedAt: { $ne: null } });
  const decidedKo = koMatches.filter((m) => m.isBye || m.winnerAlbumId).length;
  const decidedSteps = decidedGroups + decidedKo;
  ok(decidedSteps === expect.steps, `已投步数=${decidedSteps} == 总步数=${expect.steps}`);

  LOG.push(`  → 场景通过：${label}（${expect.steps} 步 → 冠军已决出）`);
  return battle._id;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  LOG.push('已连接 yinge_test');

  // 准备：清掉旧测试数据，保证可重复运行
  await mongoose.connection.dropDatabase();

  // --- 场景 A：多歌手混战 3 位 × 每位 8 张 = 24 张（有遗珠复活）---
  const a1 = await seedArtist(1001, '歌手A');
  const a2 = await seedArtist(1002, '歌手B');
  const a3 = await seedArtist(1003, '歌手C');
  await seedAlbums(a1, 1001, 8, 100000);
  await seedAlbums(a2, 1002, 8, 200000);
  await seedAlbums(a3, 1003, 8, 300000);
  await runScenario(
    '多歌手混战 3×8=24（有复活）',
    {
      scopeType: 'multi-artist',
      artists: [
        { artistId: 1001, albumCount: 8 },
        { artistId: 1002, albumCount: 8 },
        { artistId: 1003, albumCount: 8 },
      ],
      tournamentVersion: 2,
    },
    { pool: 24, groups: 6, revival: 4, koSize: 16, steps: 22 },
  );

  // --- 场景 B：单歌手 16 张（无复活）---
  const s1 = await seedArtist(2001, '单人歌手');
  await seedAlbums(s1, 2001, 16, 400000);
  await runScenario(
    '单歌手 16 张（无复活）',
    { scopeType: 'artist', artistId: 2001, albumCount: 16, tournamentVersion: 2 },
    { pool: 16, groups: 4, revival: 0, koSize: 8, steps: 11 },
  );

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
