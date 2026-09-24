/**
 * 人格系统「运行时」自检（2026-09-22）
 * ------------------------------------------------------------
 * 与 `verify-personality.mjs` 的分工：
 *   · verify-personality.mjs 是**纯函数**自检（题库/计分/匹配），不需要数据库；
 *   · 这个脚本要连**数据库**，验的是"用户真的会遇到的那几件事"：
 *     ① 听感题的音频**气质对不对**（用户报："题问鼓点，放的却是管弦乐纯音乐"）
 *     ② 选项**是不是真的乱序**（用户报："题目很明显就指向某个人格"）
 *     ③ 续答：按 qids 能不能取回**同一套题**（用户报："刷新就要重头来"）
 *     ④ 投票池/推荐池**是不是真的多样**（用户报："专辑池全是粤语区的"）
 *
 * 用法：node scripts/verify-personality-runtime.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Album, Track } from '../src/models/index.js';
import { AUDIO_TAG_GENRE, AUDIO_WHITELIST } from '../src/data/personality.js';
import { resolveAudio, getQuestions, nextTagAlbum } from '../src/modules/personality/personality.service.js';

let pass = 0;
let fail = 0;
const ok = (n, c, e = '') => {
  if (c) pass += 1;
  else fail += 1;
  console.log(`  [${c ? 'OK' : 'FAIL'}] ${n}${e ? '  ' + e : ''}`);
};

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yinge');

// ══════════ ① 听感题音频的气质匹配 ══════════
console.log('\n=== ① 听感题音频：气质对不对（用户报"题问鼓点放管弦乐"）===');
const TAGS = Object.keys(AUDIO_TAG_GENRE);
const roundsPerTag = 6;
let matched = 0;
let total = 0;
let empty = 0;
let wlHit = 0;
const samples = [];
/**
 * ⚠️ 2026-09-24 第十七批：判定口径修正（修的不是阈值，是**指标本身**）。
 * 原判定＝"曲库流派标签是否命中 AUDIO_TAG_GENRE 正则"，但 10.4 的 AUDIO_WHITELIST
 * 是**人工挑的气质代表专辑**（Michael Jackson / Bruno Mars / Dua Lipa 这类节奏系歌手，
 * iTunes 给它们打的标签全是「流行樂」）——人工挑的当然"对"，却被标签正则判成不匹配。
 * 所以正确口径是：**命中人工白名单＝匹配**（白名单就是人工事实标准），
 * 只有**兜底来源**（流派定向/任意曲）才用标签正则把关。这样指标才真的在测
 * "兜底会不会退回气质不对的曲子"。
 */
const norm = (x) => String(x || '').toLowerCase().replace(/[\s\-_·'’.,&()]/g, '');
const wlKeys = {};
for (const [tag, list] of Object.entries(AUDIO_WHITELIST)) {
  wlKeys[tag] = new Set(list.map((w) => `${norm(w.album)}|${norm(w.artist)}`));
}
for (const tag of TAGS) {
  for (let i = 0; i < roundsPerTag; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const url = await resolveAudio(tag);
    total += 1;
    if (!url) {
      empty += 1;
      continue;
    }
    // 反查这条音频属于哪张专辑、什么流派
    // eslint-disable-next-line no-await-in-loop
    const tk = await Track.findOne({ previewUrl: url }).select('albumId').lean();
    // eslint-disable-next-line no-await-in-loop
    const al = tk ? await Album.findById(tk.albumId).select('genre name artistName').lean() : null;
    const genre = al?.genre || '';
    const fromWhitelist = wlKeys[tag]?.has(`${norm(al?.name)}|${norm(al?.artistName)}`) || false;
    const hit = fromWhitelist || new RegExp(AUDIO_TAG_GENRE[tag], 'i').test(genre);
    if (hit) matched += 1;
    if (fromWhitelist) wlHit += 1;
    samples.push({ tag, genre: fromWhitelist ? `${genre}(白名单)` : genre || '(未知)', hit, name: al?.name || '' });
  }
}
ok('每道听感题都取到了音频（不会出现"音频源待配置"）', empty === 0, `${total - empty}/${total} 条有音频`);
ok('★ 音频气质匹配率 ≥ 90%（命中人工白名单＝匹配；兜底来源用流派标签把关）',
  matched / Math.max(1, total - empty) >= 0.9,
  `命中 ${matched}/${total - empty}（${((matched / Math.max(1, total - empty)) * 100).toFixed(0)}%，其中白名单直取 ${wlHit}）`);
console.log('   抽样明细：', samples.slice(0, 8).map((s) => `${s.tag}→${s.genre}${s.hit ? '' : '✗'}`).join('  '));

// ══════════ ② 选项乱序 ══════════
console.log('\n=== ② 选项乱序（用户报"题目很明显就指向某个人格"）===');
const firstKeySeen = new Map();
let rounds = 0;
for (let i = 0; i < 12; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  const d = await getQuestions();
  for (const q of d.list) {
    const first = q.options[0];
    if (!first) continue;
    firstKeySeen.set(first.key, (firstKeySeen.get(first.key) || 0) + 1);
    rounds += 1;
  }
}
const keys = [...firstKeySeen.keys()];
ok('★ 选项顺序每次都被打乱（"排第一的原始 key"有多种可能）',
  keys.length >= 3, `出现过的首位 key：${keys.sort().join('/')}`);
ok('展示字母是连续的 A/B/C/…（前端按 displayKey 渲染）',
  (await getQuestions()).list.every((q) => q.options.every((o, i) => o.displayKey === String.fromCharCode(65 + i))),
  '');
const neutralQs = (await getQuestions()).list.filter((q) => q.options.some((o) => o.neutral));
ok('听感题带"说不上来"中立出口选项（用户："完全无感甚至讨厌呢"）',
  neutralQs.every((q) => q.options.filter((o) => o.neutral).length === 1),
  `${neutralQs.length} 道听感题各 1 个`);

// ══════════ ③ 续答：按 qids 取回同一套题 ══════════
console.log('\n=== ③ 续答（用户报"刷新就要重头来"）===');
const first = await getQuestions();
const ids = first.meta.qids;
ok('首次取题会回传这套题的 id 列表', Array.isArray(ids) && ids.length === first.list.length, `${ids?.length} 个`);
const again = await getQuestions(ids);
ok('★ 按 qids 取回的是**同一套题**（顺序也一致）',
  again.meta.resumed === true && again.list.every((q, i) => q.questionId === ids[i]),
  `resumed=${again.meta.resumed}`);
const bad = await getQuestions(['000000000000000000000000', '111111111111111111111111']);
ok('脏 qids 不会卡死（自动退回重新抽一套）',
  bad.list.length === 20 && bad.meta.resumed === false,
  `拿到 ${bad.list.length} 题 / resumed=${bad.meta.resumed}`);

// ══════════ ④ 专辑池多样化 ══════════
console.log('\n=== ④ 专辑池多样化（用户报"全是粤语区的"）===');
const fakeUser = new mongoose.Types.ObjectId();
const genreHits = new Map();
const N = 40;
for (let i = 0; i < N; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  const r = await nextTagAlbum(fakeUser);
  const g = r.album?.genre || '(未知)';
  genreHits.set(g, (genreHits.get(g) || 0) + 1);
}
const sorted = [...genreHits.entries()].sort((a, b) => b[1] - a[1]);
const topShare = sorted[0][1] / N;
ok('★ 抽 40 次，出现的**流派种类** ≥ 5 种（不是被一两个大流派吃掉）',
  genreHits.size >= 5, `${genreHits.size} 种：${sorted.slice(0, 6).map(([g, n]) => `${g}×${n}`).join(' / ')}`);
ok('★ 最大流派的占比 ≤ 45%（老版本会被粤语/国语吃掉）',
  topShare <= 0.45, `最高 ${sorted[0][0]} ${(topShare * 100).toFixed(0)}%`);

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败（共 ${pass + fail}） ===`);
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
