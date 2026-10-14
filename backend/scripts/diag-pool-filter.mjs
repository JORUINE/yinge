#!/usr/bin/env node
/**
 * 第三十九批（续四）· 对决筛选真机诊断
 * ------------------------------------------------------------------
 * 用户报的两个症状：
 *   ① 华语区 1990-2000 的歌手对战里，错误出现欧美歌手/专辑
 *   ② 连续多轮重复匹配同一批歌手/专辑
 *
 * 诊断方式：**直接调真的 resolvePool 函数**（不是重写一遍逻辑、不是调 HTTP），
 * 同一组参数连跑多次，比较「歌手集合」与「专辑集合」的重叠率。
 *
 * 判据（写在前面，避免事后找理由）：
 *   · 症状②成立 ⇔ 同一参数多次取池，**歌手集合完全相同**（重叠率 100%）
 *     或高度重合（≥80%）—— 说明参与抽样的歌手范围是确定的。
 *   · 症状①成立 ⇔ zone='zh' 的结果里出现语言标签为 western/japanese/korean 的歌手。
 *
 * ⚠️ 语言标签不靠我肉眼认名字，一律用项目自己的 languageTagOf() 判定 ——
 *    否则就是"用错指标"，把"看起来像外国人"当成"语言标签是西方"。
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const { resolvePool } = await import('../src/modules/battles/battle.service.js');
const { languageTagOf, passesLanguageFilter } = await import('../src/data/languageTag.js');
const { Album, Artist } = await import('../src/models/index.js');

await mongoose.connect(process.env.MONGODB_URI);

const RUNS = 5;
const LANG_CN = { mandarin: '国语', cantonese: '粤语', japanese: '日语', korean: '韩语', western: '欧美' };

async function artistInfo(ids) {
  const docs = await Artist.find({ artistId: { $in: ids } })
    .select('artistId name genre region')
    .lean();
  return new Map(docs.map((d) => [Number(d.artistId), d]));
}

/** 取 N 次池，返回 [{artists:Set, albums:Set}]；取不到（如该流派无歌手）返回 null */
async function sample(payload, n = RUNS) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const r = await resolvePool(payload);
    out.push({
      artists: new Set(r.artists.map((a) => Number(a.artistId))),
      albums: new Set(r.albums.map((a) => String(a.albumId))),
      artistList: r.artists.map((a) => ({ id: Number(a.artistId), name: a.name, n: a.albumCount })),
    });
  }
  return out;
}

const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const overlap = (a, b) => {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const x of a) if (b.has(x)) hit += 1;
  return hit / Math.max(a.size, b.size);
};

let bad = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  ✅' : '  ❌'} ${n}${d ? '  — ' + d : ''}`); if (!c) bad += 1; };

// ═════════════════ 症状② 重复匹配 ═════════════════
for (const [label, payload] of [
  ['年代 1990-2000 · 华语区', { scopeType: 'era', startYear: 1990, endYear: 2000, zone: 'zh', albumCount: 32 }],
  ['年代 1990-2000 · 不筛地区', { scopeType: 'era', startYear: 1990, endYear: 2000, albumCount: 32 }],
  ['流派 · 國語流行樂', { scopeType: 'genre', genre: '國語流行樂', albumCount: 32 }],
]) {
  console.log(`\n══ 症状② 重复性：${label}（连取 ${RUNS} 次）══`);
  let runs;
  try {
    runs = await sample(payload);
  } catch (e) {
    console.log(`  ⚠️ 取池失败（跳过这组）：${e.message}`);
    continue;
  }
  const a0 = runs[0].artists;
  const artistSame = runs.every((r) => setEq(r.artists, a0));
  const ovlArtist = runs.map((r) => overlap(r.artists, a0));
  const ovlAlbum = runs.map((r) => overlap(r.albums, a0));
  console.log(`  · 歌手数 ${a0.size}｜专辑数 ${runs[0].albums.size}`);
  console.log(`  · 各次 vs 第 1 次的歌手重叠率：${ovlArtist.map((x) => (x * 100).toFixed(0) + '%').join('  ')}`);
  console.log(`  · 各次 vs 第 1 次的专辑重叠率：${ovlAlbum.map((x) => (x * 100).toFixed(0) + '%').join('  ')}`);
  ok(`${label}：歌手集合每次不同（不是同一批人反复出现）`, !artistSame,
    artistSame ? `❌ ${RUNS} 次歌手集合完全相同（${a0.size} 人）` : `每次有变化`);
  const minAl = Math.min(...ovlAlbum.slice(1));
  ok(`${label}：专辑有换（盲盒手感）`, minAl < 0.95, `最低重叠 ${(minAl * 100).toFixed(0)}%`);
}

// ═════════════════ 症状① 华语区混入欧美 ═════════════════
console.log('\n══ 症状① 地区准确性：华语区 1990-2000 里有没有非华语歌手 ══');
{
  const payload = { scopeType: 'era', startYear: 1990, endYear: 2000, zone: 'zh', albumCount: 48 };
  const r = await resolvePool(payload);
  const info = await artistInfo(r.artists.map((a) => Number(a.artistId)));
  const tags = [];
  for (const a of r.artists) {
    const doc = info.get(Number(a.artistId));
    const lang = languageTagOf(doc || {});
    tags.push({ id: Number(a.artistId), name: a.name, lang, genre: doc?.genre || '', region: doc?.region || '' });
    r.artists.find((x) => Number(x.artistId) === Number(a.artistId)).lang = lang;
  }
  const byLang = {};
  for (const t of tags) byLang[t.lang] = (byLang[t.lang] || 0) + 1;
  console.log(`  · 池内歌手 ${tags.length} 位，语言分布：` + Object.entries(byLang).map(([k, v]) => `${LANG_CN[k] || k} ${v}`).join('｜'));
  const leaks = tags.filter((t) => t.lang === 'western' || t.lang === 'japanese' || t.lang === 'korean');
  if (leaks.length) {
    console.log('  · 非华语歌手（这就是用户看到的"混进来的"）：');
    leaks.forEach((t) => console.log(`      ${t.name.padEnd(14)} 语言=${LANG_CN[t.lang]}｜流派=${t.genre}｜地区=${t.region || '(空)'}`));
  }
  ok('华语区结果里没有非华语歌手', leaks.length === 0, leaks.length ? `${leaks.length} 位漏筛` : '全部是华语');

  // 反向：外语区里有没有华语歌手
  const r2 = await resolvePool({ scopeType: 'era', startYear: 1990, endYear: 2000, zone: 'foreign', albumCount: 48 });
  const info2 = await artistInfo(r2.artists.map((a) => Number(a.artistId)));
  const cnInForeign = r2.artists
    .map((a) => ({ name: a.name, lang: languageTagOf(info2.get(Number(a.artistId)) || {}) }))
    .filter((x) => x.lang === 'mandarin' || x.lang === 'cantonese');
  console.log(`  · 外语区池内 ${r2.artists.length} 位，其中华语歌手 ${cnInForeign.length} 位`);
  if (cnInForeign.length) cnInForeign.slice(0, 5).forEach((x) => console.log(`      ${x.name}（${LANG_CN[x.lang]}）`));
  ok('外语区结果里没有华语歌手', cnInForeign.length === 0, cnInForeign.length ? `${cnInForeign.length} 位漏筛` : '全部是外语');
}

// ═════════════════ 补充：判定规则本身的风险点 ═════════════════
console.log('\n══ 判定规则体检：languageTagOf 对"拉丁名 + 华语地区"的歌手怎么判 ══');
{
  const latinCn = await Artist.find({
    name: { $regex: '^[A-Za-z]' },
    artistId: { $exists: true },
  }).select('artistId name genre region').lean();
  const misjudged = latinCn
    .map((d) => ({ ...d, lang: languageTagOf(d) }))
    .filter((d) => d.lang === 'western')
    .slice(0, 12);
  console.log(`  · 库里共 ${latinCn.length} 位"拉丁名"歌手，其中被判为「欧美」的 ${(await Artist.find({ name: { $regex: '^[A-Za-z]' } }).select('artistId name genre region').lean()).map((d) => languageTagOf(d)).filter((x) => x === 'western').length} 位`);
  console.log('  · 抽样看它们的 region 字段（若 region 是 hk/tw/cn 却被判欧美，就是规则漏判）：');
  misjudged.forEach((d) => console.log(`      ${String(d.name).padEnd(22)} region=${(d.region || '(空)').padEnd(6)} genre=${d.genre || '(空)'}`));
  const wrong = misjudged.filter((d) => ['hk', 'tw', 'cn', 'mo', 'china', 'taiwan', 'hong kong'].includes(String(d.region || '').toLowerCase()));
  ok('没有"华语地区 + 拉丁名"被误判为欧美', wrong.length === 0,
    wrong.length ? `${wrong.length} 位可能误判（如 ${wrong[0].name}）` : '抽样的都没误判');
}

console.log(`\n${bad ? `❌ ${bad} 项不通过 —— 用户报的问题被复现` : '✅ 全部通过 —— 没复现用户报的问题'}`);
await mongoose.disconnect();
process.exit(bad ? 1 : 0);
