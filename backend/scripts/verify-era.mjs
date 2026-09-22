/**
 * A5「按年代」模式修复验证（2026-09-17）
 * ------------------------------------------------------------
 * 修复前：resolvePool('era') 返回 artists: []，跨歌手分组拿到"歌手数 = 0"
 *         → 组容量退化成 1 → 一场对阵都排不出 → 必然抛
 *         "这些专辑无法组成跨歌手对局" —— 等于该模式完全不可用。
 * 修复后：歌手由命中的专辑反推得到；参赛池按"各歌手轮转取一张"封顶 32 张。
 * 运行：cd backend && node scripts/verify-era.mjs
 */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import * as battleService from '../src/modules/battles/battle.service.js';
import * as eraExpand from '../src/modules/music/eraExpand.js';

let pass = 0;
const ok = (name, fn) => {
  fn();
  pass += 1;
  console.log(`  [OK] ${name}`);
};
const okAsync = async (name, fn) => {
  await fn();
  pass += 1;
  console.log(`  [OK] ${name}`);
};

async function main() {
  await connectDb();
  const userId = new mongoose.Types.ObjectId();

  console.log('\n=== ① 宽区间：应正常解析出专辑与歌手（修复前这里 artists = 0）===');
  const wide = await battleService.resolvePool({ scopeType: 'era', startYear: 1990, endYear: 2026 });
  console.log(`    解析结果：参赛专辑 ${wide.albums.length} 张 · 歌手 ${wide.artists.length} 位`);
  ok('专辑数在 4 ~ 32 之间（封顶生效）', () =>
    assert.ok(wide.albums.length >= 4 && wide.albums.length <= 32, `实际 ${wide.albums.length}`));
  ok('歌手数 >= 2（跨歌手对阵才有得打）', () =>
    assert.ok(wide.artists.length >= 2, `实际 ${wide.artists.length}`));
  ok('各歌手 albumCount 之和 = 参赛专辑数（口径自洽）', () =>
    assert.equal(wide.artists.reduce((n, a) => n + a.albumCount, 0), wide.albums.length));
  ok('歌手不重复', () => {
    const ids = wide.artists.map((a) => a.artistId);
    assert.equal(new Set(ids).size, ids.length);
  });

  console.log('\n=== ② 指定 albumCount 应被尊重 ===');
  const small = await battleService.resolvePool({
    scopeType: 'era',
    startYear: 1990,
    endYear: 2026,
    albumCount: 8,
  });
  console.log(`    albumCount=8 → 实际 ${small.albums.length} 张`);
  ok('专辑数 <= 8', () => assert.ok(small.albums.length <= 8, `实际 ${small.albums.length}`));

  console.log('\n=== ③ 空区间应给可读错误，而不是崩 ===');
  await okAsync('1850 ~ 1851 无数据 → 抛「没有合格的专辑」', async () => {
    await assert.rejects(
      () => battleService.resolvePool({ scopeType: 'era', startYear: 1850, endYear: 1851 }),
      /没有合格的专辑/,
    );
  });

  console.log('\n=== ④ 端到端：真的能创建出一场「按年代」对决 ===');
  const battle = await battleService.createBattle(userId, {
    scopeType: 'era',
    startYear: 1990,
    endYear: 2026,
    albumCount: 12,
  });
  console.log(`    创建成功：组数 ${battle.groupCount} · 总场次 ${battle.matchTotal} · 参赛 ${battle.albumIds.length} 张`);
  ok('总场次 > 0（修复前这里是抛错）', () => assert.ok(battle.matchTotal > 0, `实际 ${battle.matchTotal}`));
  ok('参赛专辑数 <= 32', () => assert.ok(battle.albumIds.length <= 32));
  ok('状态为 playing', () => assert.equal(battle.status, 'playing'));
  await okAsync('清理本次测试数据（不留垃圾）', async () => {
    await battleService.deleteBattle(String(battle._id), userId);
  });

  console.log('\n=== ⑤ #84 年代池自动补足（离线也能验证不变量）===');
  const ep = await eraExpand.ensureEraPool(1990, 2026, 32);
  console.log(`    区间内合格专辑 before=${ep.before} · after=${ep.after} · triggered=${ep.triggered}`);
  ok('补足不会让池子变少（after >= before）', () => assert.ok(ep.after >= ep.before));
  ok('本地已够时 triggered=false（不白打 iTunes）', () =>
    assert.equal(ep.triggered, ep.before < 32));

  const bf = await battleService.resolvePool({
    scopeType: 'era',
    startYear: 1990,
    endYear: 2026,
    albumCount: 32,
  });
  console.log(`    补足后实际解析：参赛专辑 ${bf.albums.length} 张 · 歌手 ${bf.artists.length} 位`);
  // 不变量：补足不会让池子变少；albumCount=32 时封顶生效（<=32）；且至少 4 张能成局
  ok('参赛专辑数 >= 4（能成局）', () => assert.ok(bf.albums.length >= 4, `实际 ${bf.albums.length}`));
  ok('参赛专辑数 <= 32（封顶生效）', () => assert.ok(bf.albums.length <= 32, `实际 ${bf.albums.length}`));
  ok('歌手数 >= 2（跨歌手对阵才有得打）', () =>
    assert.ok(bf.artists.length >= 2, `实际 ${bf.artists.length}`));

  console.log(`\n===== A5 + #84 验证结果：${pass}/${pass} 全部通过 =====\n`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
