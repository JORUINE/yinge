/**
 * 第十二批后端自检（2026-09-23/24）
 * ============================================================
 * 覆盖本轮改动的"纯逻辑 + 连库"两类断言：
 *   A. 参赛张数上限 32 → 48（ERA_MAX_POOL）+ 赛程公式在 48 张下仍然自洽
 *   B. 白名单名字别名组（当地译名/罗马字差异，BTS ↔ 防彈少年團 等）+ 反例（不能误合并）
 *   C. K-Pop / J-Pop 白名单在本库的覆盖率（真调 whitelistOfGenre，不是只看代码）
 *
 * 用法：node scripts/verify-batch12.mjs   （需本地 mongod 在 27017）
 */
import assert from 'node:assert/strict';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { ERA_MAX_POOL, resolvePool } from '../src/modules/battles/battle.service.js';
import { planTournament } from '../src/modules/battles/bracket.js';
import {
  sameArtistName,
  sameAliasGroup,
  isWhitelistedArtist,
  whitelistNamesFor,
} from '../src/data/genreWhitelist.js';
import { whitelistOfGenre, normalizeGenre } from '../src/modules/music/genreExpand.js';

let pass = 0;
let fail = 0;
function ok(label, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ✅ ${label}`);
  } catch (e) {
    fail += 1;
    console.log(`  ❌ ${label}\n     ${e.message}`);
  }
}
async function okAsync(label, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`  ✅ ${label}`);
  } catch (e) {
    fail += 1;
    console.log(`  ❌ ${label}\n     ${e.message}`);
  }
}

console.log('\n=== A. 参赛张数上限 32 → 48（十二批）===');
ok('ERA_MAX_POOL === 48', () => assert.equal(ERA_MAX_POOL, 48));

ok('48 张的赛程公式自洽（12 组 ×4 / 晋级 24 → 淘汰轮 32 → 复活补 8）', () => {
  const p = planTournament(48);
  assert.equal(p.groupCount, 12, `组数 ${p.groupCount}`);
  assert.equal(p.qualified, 24, `晋级 ${p.qualified}`);
  assert.equal(p.knockoutSize, 32, `淘汰轮 ${p.knockoutSize}`);
  assert.equal(p.revivalNeed, 8, `复活补 ${p.revivalNeed}`);
  assert.equal(p.revivalSteps, 1, `复活步数 ${p.revivalSteps}`);
  assert.equal(p.totalSteps, 12 + 1 + 31, `总步数 ${p.totalSteps}`);
  assert.ok(p.knockoutSize <= 32, '淘汰轮不得超过 r32（KO_NAMES 上限）');
});

ok('48 张不会把淘汰轮推过 r32（qualified 上限 = 2·ceil(48/4) = 24）', () => {
  for (const t of [40, 44, 45, 47, 48]) {
    const p = planTournament(t);
    assert.ok(p.knockoutSize <= 32, `t=${t} → knockoutSize=${p.knockoutSize}`);
  }
});

console.log('\n=== B. 白名单名字别名组（当地译名 / 罗马字）===');
ok('BTS ↔ 防彈少年團 / 방탄소년단 判为同一歌手', () => {
  assert.ok(sameArtistName('BTS', '防彈少年團'));
  assert.ok(sameArtistName('防彈少年團', 'BTS'));
  assert.ok(sameAliasGroup('BTS', '방탄소년단'));
});
ok('ヨルシカ ↔ Yorushika', () => {
  assert.ok(sameArtistName('ヨルシカ', 'Yorushika'));
});
ok('宇多田ヒカル ↔ 宇多田光', () => {
  assert.ok(sameArtistName('宇多田ヒカル', '宇多田光'));
});
ok('Official髭男dism ↔ Official鬍子男dism', () => {
  assert.ok(sameArtistName('Official髭男dism', 'Official鬍子男dism'));
});
ok('反例：不该被合并的不能合并（防张冠李戴）', () => {
  assert.ok(!sameArtistName('BTS', 'BTX'), 'BTS 不该等于 BTX');
  assert.ok(!sameArtistName('宇多田ヒカル', '宇多田ヒカリ'), '仅差一字的假名不该合并');
  assert.ok(!sameArtistName('IVE', 'AIMER'), 'IVE 不该等于 AIMER');
});
ok('别名写法也算"白名单里的知名歌手"（排序不再当路人）', () => {
  assert.ok(isWhitelistedArtist('防彈少年團'));
  assert.ok(isWhitelistedArtist('Yorushika'));
});

console.log('\n=== C. K-Pop / J-Pop 白名单在本库的覆盖率（真调接口服务层）===');
await connectDb();

for (const g of ['韩国流行乐', '日本流行乐']) {
  await okAsync(`${g}：白名单歌手全部已入库（cached === total）`, async () => {
    const r = await whitelistOfGenre(g);
    assert.ok(r.total > 0, `total=${r.total}（白名单没取到）`);
    const miss = r.artists.filter((a) => !a.cached).map((a) => a.name);
    assert.equal(r.cached, r.total, `还缺 ${miss.join('、')}`);
  });
}

await okAsync('流派/年代池：不传 albumCount 时按 ERA_MAX_POOL(48) 封顶（真调 resolvePool）', async () => {
  const g = await resolvePool({ scopeType: 'genre', genre: '流行樂', tournamentVersion: 2 });
  assert.ok(g.albums.length <= ERA_MAX_POOL, `流派池 ${g.albums.length} > ${ERA_MAX_POOL}`);
  assert.ok(g.albums.length >= 4, `流派池只有 ${g.albums.length} 张`);
});

await okAsync('流派池：显式 albumCount=48 必须被尊重（不再被 32 截断）', async () => {
  const g = await resolvePool({ scopeType: 'genre', genre: '流行樂', albumCount: 48, tournamentVersion: 2 });
  assert.ok(g.albums.length > 32, `实际只有 ${g.albums.length} 张 —— 说明还在按 32 截断`);
});

console.log(`\n===== 第十二批后端自检：${pass} 通过 / ${fail} 失败 =====`);
await disconnectDb();
process.exit(fail ? 1 : 0);
