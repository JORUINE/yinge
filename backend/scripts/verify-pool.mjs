/**
 * verify-pool.mjs — 多歌手混战「每人抽张数」回归验证
 * ------------------------------------------------------------------
 * 背景（2026-09-19 用户报的严重 bug）：
 *   5 位歌手 × 每位 8 张的混战，结果只出 5 张、5 场就"比完了"。
 *   根因：旧逻辑"取所有歌手合格专辑数的最小值"再统一截断 —— 只要有一位歌手
 *   只有 1 张合格专辑（例如某位歌手在店里只有一张正式专辑），其他歌手也被拖到 1 张。
 *   用户原话："这种严重Bug马上修复吸取经验 以后绝对不能再有"。
 *
 * 修复后的口径：**各歌手按所选张数抽，合格专辑不够就出几张**，总数 = 各歌手出战数之和
 * （全局封顶 32，轮转取张保证不会有歌手被挤掉）。
 *
 * 运行：node scripts/verify-pool.mjs（独立测试库 yinge_test，跑完即删）
 */
import mongoose from 'mongoose';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/yinge_test';
process.env.JWT_SECRET = 'verify-pool-secret';
process.env.NODE_ENV = 'test';

const { Battle, Album, Artist } = await import('../src/models/index.js');
const battleService = await import('../src/modules/battles/battle.service.js');

const USER_ID = new mongoose.Types.ObjectId();
let passed = 0;
const LOG = [];
function ok(cond, msg) {
  if (!cond) throw new Error('✗ FAIL: ' + msg);
  passed += 1;
  LOG.push('  ✓ ' + msg);
}

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
      artistName: name0(artistExternalId),
      name: `专辑 ${base + i}`,
      artworkUrl: 'http://example.com/art.jpg',
      trackCount: 10,
      releaseDate: new Date(2000 + i, (i % 12), 1 + (i % 27)),
      isEligible: true,
      cachedAt: new Date(),
    });
  }
  await Album.insertMany(docs);
}
function name0(id) {
  return `歌手${id}`;
}

async function makePool(artists) {
  const resolved = await battleService.resolvePool({
    scopeType: 'multi-artist',
    pick: 'random',
    artists,
  });
  return resolved;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  LOG.push('已连接 yinge_test（隔离测试库）');

  // —— 场景 ①：三位歌手合格专辑数 8 / 6 / 1，各要 8 张 ——
  const a1 = await seedArtist(1001, '多专辑歌手');
  const a2 = await seedArtist(1002, '中专辑歌手');
  const a3 = await seedArtist(1003, '只有一张专辑的歌手');
  await seedAlbums(a1._id, 1001, 8, 100000);
  await seedAlbums(a2._id, 1002, 6, 200000);
  await seedAlbums(a3._id, 1003, 1, 300000);

  const r1 = await makePool([
    { artistId: 1001, albumCount: 8 },
    { artistId: 1002, albumCount: 8 },
    { artistId: 1003, albumCount: 8 },
  ]);
  const byArtist1 = new Map(r1.artists.map((a) => [a.artistId, a.albumCount]));
  ok(r1.albums.length === 15, `总出战 = 8+6+1 = 15（实得 ${r1.albums.length}，旧逻辑会只有 3 张）`);
  ok(byArtist1.get(1001) === 8, `多专辑歌手出 8 张（实得 ${byArtist1.get(1001)}）`);
  ok(byArtist1.get(1002) === 6, `中专辑歌手出 6 张（实得 ${byArtist1.get(1002)}）`);
  ok(byArtist1.get(1003) === 1, `只有 1 张的歌手出 1 张（实得 ${byArtist1.get(1003)}，不再拖累别人）`);
  const uniq = new Set(r1.albums.map((a) => String(a._id)));
  ok(uniq.size === r1.albums.length, '没有重复专辑');

  // —— 场景 ②：四位歌手各 8 张合格专辑，各要 10 张 → 8 张封顶（受合格数限制）——
  const b1 = await seedArtist(2001, '甲');
  const b2 = await seedArtist(2002, '乙');
  const b3 = await seedArtist(2003, '丙');
  const b4 = await seedArtist(2004, '丁');
  await seedAlbums(b1._id, 2001, 8, 400000);
  await seedAlbums(b2._id, 2002, 8, 410000);
  await seedAlbums(b3._id, 2003, 8, 420000);
  await seedAlbums(b4._id, 2004, 8, 430000);
  const r2 = await makePool([
    { artistId: 2001, albumCount: 10 },
    { artistId: 2002, albumCount: 10 },
    { artistId: 2003, albumCount: 10 },
    { artistId: 2004, albumCount: 10 },
  ]);
  ok(r2.albums.length === 32, `4 位 × 10 张 → 32 张封顶（实得 ${r2.albums.length}）`);
  ok(r2.artists.every((a) => a.albumCount === 8), '每位歌手都出到自己的上限 8 张（轮转取张，不挤掉人）');

  // —— 场景 ③：改成 4 张 / 6 张，池子必须跟着变（用户点名的"改张数赛程不变"）——
  const r3 = await makePool([
    { artistId: 1001, albumCount: 4 },
    { artistId: 1002, albumCount: 4 },
    { artistId: 1003, albumCount: 4 },
  ]);
  ok(r3.albums.length === 9, `每位 4 张 → 4+4+1 = 9（实得 ${r3.albums.length}，随所选张数变化）`);

  // —— 场景 ④：赛程规划随池子变化（5 张 → 5 场；15 张 → 更多场）——
  const plan5 = battleService.bracket ? null : null;
  void plan5;
  const { planTournament } = await import('../src/modules/battles/bracket.js');
  const p5 = planTournament(5);
  const p15 = planTournament(15);
  ok(p5.totalSteps === 5, `5 张 → 5 场（实得 ${p5.totalSteps}，与用户截图一致）`);
  ok(p15.totalSteps > p5.totalSteps, `15 张 → ${p15.totalSteps} 场 > 5 场（赛程随池子变化）`);

  // —— 场景 ⑤：某位歌手一张合格专辑都没有 → 明确报错，不静默 ——
  const c1 = await seedArtist(3001, '零专辑歌手');
  let threw = null;
  try {
    await makePool([
      { artistId: 1001, albumCount: 8 },
      { artistId: 3001, albumCount: 8 },
    ]);
  } catch (e) {
    threw = e;
  }
  ok(Boolean(threw), `零专辑歌手 → 明确报错（${threw?.message || '没抛'}）`);

  // —— 场景 ⑥：真开局 —— 用场景 ① 的池子真建一局，赛程应与池子一致
  const battle = await battleService.createBattle(USER_ID.toString(), {
    scopeType: 'multi-artist',
    pick: 'random',
    artists: [
      { artistId: 1001, albumCount: 8 },
      { artistId: 1002, albumCount: 8 },
      { artistId: 1003, albumCount: 8 },
    ],
    tournamentVersion: 2,
  });
  ok(battle.albumIds.length === 15, `真开局出战 15 张（实得 ${battle.albumIds.length}）`);
  ok(battle.stepTotal === p15.totalSteps, `总步数 = 15 张的规划值 ${p15.totalSteps}（实得 ${battle.stepTotal}）`);

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
