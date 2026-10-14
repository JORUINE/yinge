#!/usr/bin/env node
/**
 * 第四十批 ·「专辑标题文字属性」信号的可分性测量（不落库、只读）
 * ------------------------------------------------------------------
 * 背景：用户否决了「白名单补丁」式修法 ——
 *   "按你这样的新规则 岂不是还会有很多不在白名单的歌手出问题 或者外国歌手混入内地"
 * 所以要找一个 **通用信号**（不依赖任何名单）把「华语专辑」和「欧美专辑」分开。
 *
 * 候选信号：**这位歌手名下的专辑标题，是汉字为主还是拉丁字母为主**。
 *   周杰倫 → 范特西 / 七里香 ………… 汉字为主
 *   平克勞斯貝(=Bing Crosby) → Christmas Classics … 拉丁为主
 *
 * 本脚本只做测量，不改任何逻辑。输出：
 *   ① 全库歌手的「汉字标题占比」分布
 *   ② 用**人工标注的对照集**（与 languageTagOf 完全独立）打分：分得开吗？
 *   ③ 「名字含汉字」这一类的明细（这才是漏筛的高危区）
 *
 * ⚠️ 自检纪律：对照集的标签必须是**独立于被测规则**的证据。
 *    本脚本的标签来自「白名单册归属 + 人工常识」，不用 languageTagOf 自判。
 *
 * 用法：node scripts/diag-album-script.mjs
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const { Artist, Album } = await import('../src/models/index.js');
await mongoose.connect(process.env.MONGODB_URI);

const HAN = /[\u4e00-\u9fff]/;
const KANA = /[\u3040-\u30ff]/;
const HANGUL = /[\uac00-\ud7af]/;
const LATIN = /[A-Za-z]/;

function score(str) {
  let han = 0;
  let lat = 0;
  let kana = 0;
  for (const ch of String(str || '')) {
    if (HAN.test(ch)) han += 1;
    else if (KANA.test(ch)) kana += 1;
    else if (LATIN.test(ch)) lat += 1;
  }
  return { han, lat, kana };
}

/** 标题是否"汉字为主"（含假名一律不算华语标题） */
function isHanTitle(title) {
  const s = score(title);
  if (s.kana > 0) return false;
  return s.han > 0 && s.han > s.lat;
}

const artists = await Artist.find({}).select('artistId name genre region aliases').lean();
const albums = await Album.find({ isEligible: true }).select('artistExternalId name').lean();

const titlesByArtist = new Map();
for (const al of albums) {
  const k = Number(al.artistExternalId);
  if (!titlesByArtist.has(k)) titlesByArtist.set(k, []);
  titlesByArtist.get(k).push(String(al.name || ''));
}

const rows = artists.map((a) => {
  const titles = titlesByArtist.get(Number(a.artistId)) || [];
  const hanN = titles.filter(isHanTitle).length;
  return {
    id: Number(a.artistId),
    name: a.name,
    genre: a.genre || '',
    region: a.region || '',
    n: titles.length,
    hanN,
    ratio: titles.length ? hanN / titles.length : null,
    titles,
  };
});

const withAlbums = rows.filter((r) => r.n >= 2);

console.log(`\n全库歌手 ${artists.length} 位 · 合格专辑 ${albums.length} 张 · 有≥2张专辑的歌手 ${withAlbums.length} 位\n`);

// ── ① 分布 ──────────────────────────────────────────────────────────
const buckets = [
  ['ratio = 0（全拉丁标题）', (r) => r.ratio === 0],
  ['0 < ratio < 0.5', (r) => r.ratio > 0 && r.ratio < 0.5],
  ['0.5 ≤ ratio < 1', (r) => r.ratio >= 0.5 && r.ratio < 1],
  ['ratio = 1（全汉字标题）', (r) => r.ratio === 1],
];
console.log('① 「汉字标题占比」分布（只有专辑数≥2 的歌手）：');
for (const [label, fn] of buckets) {
  const n = withAlbums.filter(fn).length;
  console.log(`   ${label.padEnd(24, ' ')} ${String(n).padStart(5)} 位  (${((n / withAlbums.length) * 100).toFixed(1)}%)`);
}

// ── ② 对照集打分 ────────────────────────────────────────────────────
/**
 * 人工对照集（标签来自常识/名单册归属，与被测规则无关）：
 *   zh  = 确属华语（中国大陆/港台，唱中文）
 *   west= 确属欧美
 * 这些是「名字含汉字」里最容易出错的样本，专门挑出来。
 */
const GOLD = [
  // —— 确属欧美，但名字被 iTunes 翻成汉字/混合 ——
  ['平克勞斯貝', 'west'],
  ['麥可布雷', 'west'],
  ['吉爾史考特海隆', 'west'],
  ['法蘭克辛納屈', 'west'],
  ['艾維斯普里斯萊', 'west'],
  ['巴布狄倫', 'west'],
  ['約翰藍儂', 'west'],
  ['保羅麥卡尼', 'west'],
  ['惠妮休斯頓', 'west'],
  ['瑪丹娜', 'west'],
  ['泰勒絲', 'west'],
  ['艾德希蘭', 'west'],
  ['山姆史密斯', 'west'],
  ['布鲁诺马斯', 'west'],
  // —— 确属华语 ——
  ['周杰倫', 'zh'],
  ['陳奕迅', 'zh'],
  ['五月天', 'zh'],
  ['蔡依林', 'zh'],
  ['林俊傑', 'zh'],
  ['張學友', 'zh'],
  ['王力宏', 'zh'],
  ['鄧紫棋', 'zh'],
  ['告五人', 'zh'],
  ['落日飛車', 'zh'],
  ['布瑞吉', 'zh'],
  ['趙馨玥', 'zh'],
  ['劉夫陽', 'zh'],
  ['房东的猫', 'zh'],
  ['毛不易', 'zh'],
  ['薛之謙', 'zh'],
];

const byNorm = new Map(rows.map((r) => [r.name.replace(/\s/g, ''), r]));
const hit = [];
const miss = [];
for (const [nm, want] of GOLD) {
  const r = byNorm.get(nm) || rows.find((x) => x.name.replace(/\s/g, '').includes(nm));
  if (!r) {
    miss.push([nm, want]);
    continue;
  }
  hit.push({ nm, want, r });
}

console.log(`\n② 人工对照集（${GOLD.length} 条，库里命中 ${hit.length} 条）：`);
console.log('   标签  汉字占比  专辑数  歌手名');
const wrong = [];
for (const h of hit) {
  const ratio = h.r.ratio === null ? null : h.r.ratio;
  const guess = ratio === null ? '?' : ratio >= 0.5 ? 'zh' : 'west';
  const ok = guess === h.want;
  if (!ok) wrong.push(h);
  console.log(
    `   ${ok ? '√' : '×'} ${h.want.padEnd(4)} ${String(ratio === null ? '-' : ratio.toFixed(2)).padStart(6)}  ${String(h.r.n).padStart(5)}   ${h.r.name}${ok ? '' : `   ← 判成 ${guess}`}`,
  );
}
if (miss.length) console.log(`   （库里没有：${miss.map((m) => m[0]).join('、')}）`);
console.log(
  `\n   阈值 0.5 下的正确率：${hit.length - wrong.length}/${hit.length} = ${(((hit.length - wrong.length) / hit.length) * 100).toFixed(1)}%`,
);

// ── ③ 名字含汉字者的明细（高危区） ──────────────────────────────────
console.log('\n③ 「名字含汉字 且 专辑≥2 张」的歌手，按汉字占比升序（前 45 行 = 最容易混进华语区的）：');
const hanNames = withAlbums
  .filter((r) => HAN.test(r.name))
  .sort((a, b) => a.ratio - b.ratio || b.n - a.n)
  .slice(0, 45);
console.log('   汉字占比  专辑数  流派                  地区  歌手名  ｜ 例：前 2 张专辑标题');
for (const r of hanNames) {
  console.log(
    `   ${r.ratio.toFixed(2).padStart(6)}  ${String(r.n).padStart(5)}  ${(r.genre || '-').slice(0, 20).padEnd(22)} ${String(r.region || '-').padEnd(4)} ${r.name.slice(0, 26).padEnd(28)}｜ ${r.titles.slice(0, 2).join(' / ').slice(0, 52)}`,
  );
}

// ── ④ 纯汉字名但标题全拉丁的歌手（本次要抓的漏筛源） ────────────────
console.log('\n④ 「名字含汉字 且 汉字标题占比 < 0.5」的歌手 —— 现行规则会把他们全判成华语：');
const leak = withAlbums.filter((r) => HAN.test(r.name) && r.ratio < 0.5);
for (const r of leak) {
  console.log(
    `   ${r.ratio.toFixed(2)}  ${String(r.n).padStart(3)}张  ${(r.genre || '-').slice(0, 18).padEnd(20)} ${r.name.slice(0, 30).padEnd(32)}｜ ${r.titles.slice(0, 3).join(' / ').slice(0, 60)}`,
  );
}
console.log(`\n   共 ${leak.length} 位`);

await mongoose.disconnect();
