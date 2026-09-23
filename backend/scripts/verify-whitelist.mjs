/**
 * 流派白名单自检（2026-09-23）
 * ============================================================
 * 两段：
 *   A. 纯函数段（不连库）：名单结构、归一化 key、合并规则、知名歌手判定
 *   B. 连库段：流派/年代池里"白名单歌手"真的排到前面了吗
 *
 * 用法：node scripts/verify-whitelist.mjs   （需本地 mongod 在 27017）
 */
import assert from 'node:assert/strict';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { Artist } from '../src/models/index.js';
import * as battleService from '../src/modules/battles/battle.service.js';
import {
  GENRE_WHITELIST,
  EXTRA_LISTS,
  EXTRA_MERGE,
  WHITELIST_NAME_SET,
  isWhitelistedArtist,
  whitelistNamesFor,
  normArtistName,
  curatedListOf,
  canonicalGenreKey,
} from '../src/data/genreWhitelist.js';
import * as musicService from '../src/modules/music/music.service.js';
import {
  languageTagOf,
  passesLanguageFilter,
  interleaveByLang,
  zoneOfLang,
} from '../src/data/languageTag.js';
import { normalizeGenre } from '../src/modules/music/genreExpand.js';

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

console.log('\n=== A. 纯函数段（名单结构 + 判定）===');

ok('每个流派键都是 normalizeGenre 之后的形式（否则永远匹配不上）', () => {
  for (const k of Object.keys(GENRE_WHITELIST)) {
    assert.equal(k, normalizeGenre(k), `键「${k}」不是归一化形式`);
  }
});

ok('每一册至少 10 位歌手', () => {
  for (const [k, v] of Object.entries(GENRE_WHITELIST)) {
    assert.ok(v.length >= 10, `「${k}」只有 ${v.length} 位`);
  }
  for (const [k, v] of Object.entries(EXTRA_LISTS)) {
    assert.ok(v.length >= 10, `附加册「${k}」只有 ${v.length} 位`);
  }
});

ok('同一册内无重复名字', () => {
  for (const [k, v] of Object.entries({ ...GENRE_WHITELIST, ...EXTRA_LISTS })) {
    const s = new Set(v.map(normArtistName));
    assert.equal(s.size, v.length, `「${k}」有重复：${v.length - s.size} 个`);
  }
});

ok('EXTRA_MERGE 只引用真实存在的附加册', () => {
  for (const [k, arr] of Object.entries(EXTRA_MERGE)) {
    for (const n of arr) {
      assert.ok(EXTRA_LISTS[n], `并入了不存在的册「${n}」`);
    }
    assert.ok(GENRE_WHITELIST[k], `并到了不存在的流派「${k}」`);
  }
});

ok('Hip-Hop/Rap → 名字里含 Drake / Eminem（治"没有大牌"）', () => {
  const n = whitelistNamesFor('Hip-Hop/Rap', normalizeGenre);
  assert.ok(n.includes('Drake'), '缺 Drake');
  assert.ok(n.includes('Eminem'), '缺 Eminem');
});

ok('韓國流行樂（中文标签）→ 含 BTS', () => {
  const n = whitelistNamesFor('韓國流行樂', normalizeGenre);
  assert.ok(n.includes('BTS'), '缺 BTS');
});

ok('廣東歌/香港流行樂 → 含 陳奕迅 + 港澳乐队，但**不含国语乐队**', () => {
  const n = whitelistNamesFor('廣東歌/香港流行樂', normalizeGenre);
  assert.ok(n.includes('陳奕迅'), '缺 陳奕迅');
  assert.ok(n.includes('Dear Jane'), '缺港澳乐队');
  assert.ok(!n.includes('五月天'), '混进了国语乐队（用户报的"出来一堆其他类型的"）');
});

ok('国语流行乐 → 主名单 + 新生代 都在（周杰倫、周興哲）', () => {
  const n = whitelistNamesFor('国语流行乐', normalizeGenre);
  assert.ok(n.includes('周杰倫'), '缺 周杰倫');
  assert.ok(n.includes('周興哲'), '没并入华语新生代');
});

ok('搖滾 → 并入华语乐队（五月天 / 告五人）', () => {
  const n = whitelistNamesFor('搖滾', normalizeGenre);
  assert.ok(n.includes('The Beatles'), '缺 The Beatles');
  assert.ok(n.includes('五月天'), '没并入华语乐队');
  assert.ok(n.includes('告五人'), '没并入华语乐队');
});

ok('表外流派 → 返回空数组（调用方退回关键词源，行为与改动前一致）', () => {
  assert.deepEqual(whitelistNamesFor('某个不存在的流派XYZ', normalizeGenre), []);
});

ok('isWhitelistedArtist：大牌 true / 冷门 false / 带后缀 true', () => {
  assert.equal(isWhitelistedArtist('Drake'), true);
  assert.equal(isWhitelistedArtist('周杰倫'), true);
  assert.equal(isWhitelistedArtist('Upchurch'), false);
  assert.equal(isWhitelistedArtist('Novel Fergus'), false);
  assert.equal(isWhitelistedArtist('周杰倫 (Jay Chou)'), true, '前缀匹配没生效');
});

ok('白名单全量集合规模合理（>200 位）', () => {
  assert.ok(WHITELIST_NAME_SET.size > 200, `只有 ${WHITELIST_NAME_SET.size}`);
});

/**
 * ⚠️ 这条是"防白名单静默失效"的守门断言 —— 用户报的
 * 「你白名单里写的好好的流行乐 pop 这里也没有」就是它抓出来的：
 * 库里标签是繁体「流行樂」而白名单键是简体「流行乐」，CANON 恰好漏了一个 →
 * whitelistNamesFor 返回空 → 白名单静默失效 → 退回 Apple 榜单（出来一堆冷门）。
 * 所以这里把**曲库里真实存在的标签**逐个过一遍，任何一个解析为空都算错。
 */
ok('每个真实流派标签都能命中白名单（繁简都认，防静默失效）', () => {
  const REAL = [
    ['流行樂', 'Taylor Swift'],
    ['流行乐', 'Taylor Swift'],
    ['國語流行樂', '周杰倫'],
    ['國語流行樂', '周興哲'],
    ['廣東歌/香港流行樂', '陳奕迅'],
    ['Hip-Hop/Rap', 'Drake'],
    ['Hip-Hop', 'Drake'],
    ['搖滾', 'The Beatles'],
    ['硬搖滾', 'AC/DC'],
    ['另類音樂', 'Radiohead'],
    ['舞曲', 'Calvin Harris'],
    ['電子音樂', 'Daft Punk'],
    ['R&B/騷靈樂', 'SZA'],
    ['當代 R&B', 'SZA'],
    ['爵士', 'Miles Davis'],
    ['古典樂', 'Beethoven'],
    ['器樂', 'Max Richter'],
    ['民謠', 'Bob Dylan'],
    ['鄉村', 'Johnny Cash'],
    ['節慶', 'Mariah Carey'],
    ['原聲配樂', 'Hans Zimmer'],
    ['韓國流行樂', 'BTS'],
    ['日本流行樂', '米津玄師'],
    ['華語 Hip-Hop', 'MC HotDog 熱狗'],
    // 2026-09-23 实跑白名单预灌脚本后，库里新冒出来的这些标签也要能命中
    ['饒舌', 'Drake'],
    ['獨立搖滾', 'Radiohead'],
    ['前衛搖滾/藝術搖滾', 'Radiohead'],
    ['搖滾樂', 'The Beatles'],
    ['成人當代', 'Taylor Swift'],
    ['另類民謠', 'Bob Dylan'],
    ['電視原聲帶', 'Hans Zimmer'],
    ['流行樂/搖滾', 'Taylor Swift'],
    ['華語音樂', '周杰倫'],
  ];
  for (const [g, name] of REAL) {
    const list = whitelistNamesFor(g, normalizeGenre);
    assert.ok(list.length > 0, `「${g}」白名单为空（静默失效）`);
    assert.ok(list.includes(name), `「${g}」里缺 ${name}`);
  }
});

ok('粤语流派不再混入国语乐队（用户报"出来一堆其他类型的"）', () => {
  const cant = whitelistNamesFor('廣東歌/香港流行樂', normalizeGenre);
  for (const bad of ['五月天', '告五人', '萬能青年旅店', '蘇打綠', '草東沒有派對']) {
    assert.ok(!cant.includes(bad), `粤语流派里混进了 ${bad}`);
  }
  const rock = whitelistNamesFor('搖滾', normalizeGenre);
  assert.ok(rock.includes('五月天'), '摇滚流派应该并进华语乐队');
});

ok('Hip-Hop/Rap 与 Hip-Hop 解析到同一份名单（避免重复 chip）', () => {
  const a = whitelistNamesFor('Hip-Hop/Rap', normalizeGenre);
  const b = whitelistNamesFor('Hip-Hop', normalizeGenre);
  assert.deepEqual(a, b);
});

console.log('\n=== B. 连库段（池子里大牌真的排前面了吗）===');
await connectDb();

await okAsync('年代池（1990–2026, 选 12 张）：大牌靠前、但**不独占**（留名额给其他歌手）', async () => {
  const r = await battleService.resolvePool({
    scopeType: 'era',
    startYear: 1990,
    endYear: 2026,
    albumCount: 12,
  });
  const famous = (r.artists || []).filter((a) => isWhitelistedArtist(a.name)).map((a) => a.name);
  const others = (r.artists || []).filter((a) => !isWhitelistedArtist(a.name)).map((a) => a.name);
  console.log(`     池子：${r.albums.length} 张 / ${r.artists.length} 位歌手`);
  console.log(`     白名单大牌 ${famous.length} 位：${famous.join('、') || '（无）'}`);
  console.log(`     其余歌手 ${others.length} 位：${others.join('、') || '（无）'}`);
  assert.ok(famous.length > 0, '一个大牌都没排进来，知名歌手优先没生效');
  assert.ok(
    others.length > 0,
    `大牌独占整池（${famous.length}/${r.artists.length}）—— 多样性没保住，2:1 交错失效`,
  );
  assert.ok(r.albums.length <= 32, `超过封顶：${r.albums.length}`);
});

await okAsync('流派池（Hip-Hop/Rap, 选 12 张）能成局且不超封顶', async () => {
  const r = await battleService.resolvePool({
    scopeType: 'genre',
    genre: 'Hip-Hop/Rap',
    albumCount: 12,
  });
  const famous = (r.artists || []).filter((a) => isWhitelistedArtist(a.name)).map((a) => a.name);
  console.log(`     池子：${r.albums.length} 张 / ${r.artists.length} 位歌手`);
  console.log(`     其中白名单大牌 ${famous.length} 位：${famous.join('、') || '（无）'}`);
  assert.ok(r.albums.length >= 4, `池子太小：${r.albums.length}`);
  assert.ok(r.albums.length <= 32, `超过封顶：${r.albums.length}`);
});

await okAsync('策展流派「華語新生代」能组池（库里没有就给可读提示，不崩）', async () => {
  try {
    const r = await battleService.resolvePool({
      scopeType: 'genre',
      genre: '華語新生代',
      albumCount: 8,
    });
    console.log(
      `     华语新生代池：${r.albums.length} 张 / ${r.artists.length} 位 → ${r.artists.map((a) => a.name).join('、')}`,
    );
    assert.ok(r.albums.length >= 1, '池子空');
  } catch (e) {
    console.log(`     预期内的提示：${e.message}`);
    assert.ok(/策展名单|一键补知名歌手/.test(e.message), `错误信息不可读：${e.message}`);
  }
});

await okAsync('流派列表只保留白名单覆盖的流派 + 按规范键聚合（用户："不需要这么多流派"）', async () => {
  const genres = await musicService.listGenres();
  const names = genres.map((g) => g.genre);
  console.log(`     共 ${genres.length} 个 chip：${names.join('、')}`);
  assert.ok(names.includes('華語新生代') && names.includes('華語樂隊'), '缺策展流派');
  for (const bad of ['電視原聲帶', '成人當代', '華語音樂', '流行樂/搖滾', '饒舌', '獨立搖滾', 'Hip-Hop']) {
    assert.ok(!names.includes(bad), `边角/别名流派不该单独出现：${bad}`);
  }
  const pop = genres.find((g) => g.genre === '流行樂');
  assert.ok(pop, '缺 流行樂 chip');
  assert.ok(pop.artists < 40, `流行樂 歌手数 ${pop.artists} —— 像是把粤语/国语流派也吃进来了`);
});

await okAsync('流派池「流行樂」里没有粤语/国语歌手（用户报的核心 bug）', async () => {
  const r = await battleService.resolvePool({ scopeType: 'genre', genre: '流行樂', albumCount: 16 });
  const docs = await Artist.find({ artistId: { $in: r.artists.map((a) => a.artistId) } })
    .select('name genre region')
    .lean();
  console.log(`     流行樂池 ${r.artists.length} 位：${docs.map((d) => `${d.name}[${d.genre}]`).join('、')}`);
  for (const d of docs) {
    assert.equal(
      canonicalGenreKey(d.genre),
      '流行乐',
      `${d.name} 的标签是「${d.genre}」→ 规范键 ${canonicalGenreKey(d.genre)}，不该出现在流行樂池里`,
    );
  }
});

console.log('\n=== D. 语种/地区筛选（2026-09-23 两级：华语区/外语区 → 语种）===');

ok('languageTagOf：genre 语种词优先（最准）', () => {
  assert.equal(languageTagOf({ genre: '國語流行樂', name: 'x' }), 'mandarin');
  assert.equal(languageTagOf({ genre: '廣東歌/香港流行樂', name: 'x' }), 'cantonese');
  assert.equal(languageTagOf({ genre: '韓國流行樂', name: 'x' }), 'korean');
  assert.equal(languageTagOf({ genre: '日本流行樂', name: 'x' }), 'japanese');
});

ok('languageTagOf：白名单册归属（华语新生代 → 国语）', () => {
  assert.equal(languageTagOf({ name: '周興哲' }), 'mandarin');
  assert.equal(languageTagOf({ name: '陳奕迅' }), 'cantonese');
  assert.equal(languageTagOf({ name: 'IU' }), 'korean');
});

ok('languageTagOf：region 兜底 + 字符兜底', () => {
  assert.equal(languageTagOf({ region: 'kr', name: 'Whatever' }), 'korean');
  assert.equal(languageTagOf({ region: 'us', name: 'Drake' }), 'western');
  // 米津玄師 在白名单的日文册里 → 判日语（比"纯汉字回落国语"更准）
  assert.equal(languageTagOf({ name: '米津玄師' }), 'japanese');
  assert.equal(languageTagOf({ name: 'ヨルシカ' }), 'japanese'); // 含假名
  /**
   * ⚠️ 自检抓出来的真坑：`region` 是 **iTunes 取数地区**（本项目很多欧美歌手是经 hk 区同步的），
   *    如果让 region 优先，Pink Floyd 会被判成粤语、外语区池子会被清空（实测只剩 1 位歌手）。
   */
  assert.equal(languageTagOf({ region: 'hk', name: 'Pink Floyd' }), 'western', '拉丁名 + hk 区不能判成粤语');
  assert.equal(languageTagOf({ region: 'hk', name: '張國榮' }), 'cantonese', '汉字名 + hk 区 → 粤语');
  assert.equal(languageTagOf({ region: 'us', name: '某位不存在的汉字歌手' }), 'mandarin', '汉字名 + us 区 → 国语');
});

ok('zoneOfLang：华语区 = 国语 + 粤语；外语区 = 日/韩/欧美', () => {
  assert.equal(zoneOfLang('mandarin'), 'zh');
  assert.equal(zoneOfLang('cantonese'), 'zh');
  assert.equal(zoneOfLang('japanese'), 'foreign');
  assert.equal(zoneOfLang('korean'), 'foreign');
  assert.equal(zoneOfLang('western'), 'foreign');
});

ok('passesLanguageFilter：不勾＝全通过（与改动前行为一致）', () => {
  for (const l of ['mandarin', 'cantonese', 'japanese', 'korean', 'western']) {
    assert.equal(passesLanguageFilter(l, {}), true, `${l} 应通过`);
  }
});

ok('passesLanguageFilter：华语区 / 外语区互斥', () => {
  assert.equal(passesLanguageFilter('mandarin', { zone: 'zh' }), true);
  assert.equal(passesLanguageFilter('cantonese', { zone: 'zh' }), true);
  assert.equal(passesLanguageFilter('western', { zone: 'zh' }), false);
  assert.equal(passesLanguageFilter('japanese', { zone: 'foreign' }), true);
  assert.equal(passesLanguageFilter('korean', { zone: 'foreign' }), true);
  assert.equal(passesLanguageFilter('cantonese', { zone: 'foreign' }), false);
});

ok('passesLanguageFilter：选了子语种就只留该语种', () => {
  assert.equal(passesLanguageFilter('cantonese', { lang: 'cantonese' }), true);
  assert.equal(passesLanguageFilter('mandarin', { lang: 'cantonese' }), false);
  assert.equal(passesLanguageFilter('japanese', { zone: 'foreign', lang: 'japanese' }), true);
});

ok('interleaveByLang：两个语种交替（治粤语独占）', () => {
  const src = [
    { lang: 'cantonese', n: 1 },
    { lang: 'cantonese', n: 2 },
    { lang: 'cantonese', n: 3 },
    { lang: 'mandarin', n: 4 },
    { lang: 'mandarin', n: 5 },
  ];
  const out = interleaveByLang(src);
  assert.deepEqual(
    out.map((x) => x.lang),
    ['cantonese', 'mandarin', 'cantonese', 'mandarin', 'cantonese'],
  );
  assert.equal(out.length, src.length);
});

ok('curatedListOf：新生代 / 华语乐队 能当流派用（简繁都认）', () => {
  assert.equal(curatedListOf('華語新生代', normalizeGenre), '华语新生代');
  assert.equal(curatedListOf('华语新生代', normalizeGenre), '华语新生代');
  assert.equal(curatedListOf('華語樂隊', normalizeGenre), '华语乐队');
  assert.equal(curatedListOf('摇滚', normalizeGenre), null);
});

ok('策展流派的名字清单 = 该册本身（不是别的流派）', () => {
  const n = whitelistNamesFor('華語新生代', normalizeGenre);
  assert.ok(n.includes('周興哲'), '缺 周興哲');
  assert.ok(!n.includes('Drake'), '混进了说唱名单');
});

/** 结果里的歌手 → 用库里真实的 genre/region 派生语种（不能用裸名字，会失真） */
async function langsOf(result) {
  const ids = (result.artists || []).map((a) => a.artistId);
  const docs = await Artist.find({ artistId: { $in: ids } })
    .select('artistId name genre region')
    .lean();
  return docs.map((d) => languageTagOf(d));
}

await okAsync('年代池 + 华语区（zone=zh）：池里**全是华语歌手**', async () => {
  const r = await battleService.resolvePool({
    scopeType: 'era',
    startYear: 1990,
    endYear: 2026,
    albumCount: 16,
    zone: 'zh',
  });
  const langs = await langsOf(r);
  const set = [...new Set(langs)];
  console.log(`     华语区池：${r.albums.length} 张 / ${r.artists.length} 位 → 语种：${set.join('、')}`);
  for (const l of set) assert.equal(zoneOfLang(l), 'zh', `混进了非华语歌手：${l}`);
  assert.ok(set.length >= 2, `只有 ${set.join('、')} —— 交错均衡没生效（应同时有国语与粤语）`);
});

await okAsync('年代池 + 外语区（zone=foreign）：池里**没有华语歌手**', async () => {
  const r = await battleService.resolvePool({
    scopeType: 'era',
    startYear: 1990,
    endYear: 2026,
    albumCount: 16,
    zone: 'foreign',
  });
  const langs = await langsOf(r);
  const set = [...new Set(langs)];
  console.log(`     外语区池：${r.albums.length} 张 / ${r.artists.length} 位 → 语种：${set.join('、')}`);
  for (const l of set) assert.equal(zoneOfLang(l), 'foreign', `混进了华语歌手：${l}`);
});

await okAsync('年代池 + 指定粤语（lang=cantonese）：池里全是粤语歌手', async () => {
  const r = await battleService.resolvePool({
    scopeType: 'era',
    startYear: 1990,
    endYear: 2026,
    albumCount: 12,
    lang: 'cantonese',
  });
  const langs = await langsOf(r);
  const set = [...new Set(langs)];
  console.log(`     粤语池：${r.albums.length} 张 / ${r.artists.length} 位 → 语种：${set.join('、')}`);
  assert.deepEqual(set, ['cantonese'], `实际语种：${set.join('、')}`);
});

await okAsync('年代池默认（不传 zone/lang）：语种是混的（向后兼容）', async () => {
  const r = await battleService.resolvePool({
    scopeType: 'era',
    startYear: 1990,
    endYear: 2026,
    albumCount: 16,
  });
  const langs = [...new Set(await langsOf(r))];
  console.log(`     默认池：${r.albums.length} 张 / ${r.artists.length} 位 → 语种：${langs.join('、')}`);
  assert.ok(langs.length >= 2, '默认池应该混着打');
});

console.log('\n=== C. 发现顺序：白名单是不是真的排在最前（需要外网）===');
{
  const { discoverGenreArtists } = await import('../src/modules/music/genreExpand.js');
  let d = null;
  try {
    d = await discoverGenreArtists('Hip-Hop/Rap', { limit: 30 });
  } catch (e) {
    console.log(`  ⚠️ 调用失败：${e.message}`);
  }
  if (!d || !d.total) {
    console.log('  ⚠️ 拿不到任何歌手（沙箱通常连不上 itunes.apple.com）→ 跳过顺序断言');
    console.log('     （这不是代码错：榜单/白名单/关键词三层都失败时返回空，前端会提示"没搜到"）');
  } else {
    console.log(`  source=${d.source} · total=${d.total} · loose=${d.loose}`);
    console.log(
      `  名单：${d.artists
        .slice(0, 12)
        .map((a) => `${a.name}[${a.from}]`)
        .join('、')}`,
    );
    ok('前 5 位都来自 whitelist（白名单是主来源，不是榜单）', () => {
      const head = d.artists.slice(0, 5);
      assert.ok(
        head.length > 0 && head.every((a) => a.from === 'whitelist'),
        `实际：${head.map((a) => `${a.name}(${a.from})`).join('、')}`,
      );
    });
    ok('榜单只出现在白名单之后（做补足用）', () => {
      const idx = d.artists.findIndex((a) => a.from === 'chart');
      const lastWl = d.artists.map((a) => a.from).lastIndexOf('whitelist');
      assert.ok(idx === -1 || idx > lastWl, `榜单出现在白名单之前（chart@${idx}, lastWhitelist@${lastWl}）`);
    });
  }
}

await disconnectDb();
console.log(`\n===== 白名单自检结果：${pass}/${pass + fail} 通过 =====\n`);
process.exit(fail ? 1 : 0);
