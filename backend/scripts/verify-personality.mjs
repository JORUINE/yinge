/**
 * 人格题库 · 纯函数自检（2026-09-22）
 * ------------------------------------------------------------
 * 这个脚本**不需要数据库**：题库、计分、匹配都是纯函数，直接在 Node 里跑，
 * 所以可以用几千次蒙特卡洛把"这套题库到底能不能把 6 个类型分开"验出来。
 *
 * 验四件事：
 *   ① 题库结构：50 道、听感 8 道、每个维度题数够不够抽（每维至少抽 3 道 → 池子 ≥ 3）
 *   ② 抽题配平：抽 2000 次，每次 20 道，**每个维度被抽到的题数必须恒定**（随机只影响抽哪几道）
 *   ③ ⭐ **类型命中分布**：模拟 5000 个随机作答者，看 6 个类型各自被匹配到多少次。
 *      这是"6 个类型是不是真的可分"的硬指标 —— 老版本 4 维时词句收藏家/探索者几乎为 0。
 *   ④ 极端作答（每题都选同一列）与"平均人"（随机均匀）的结果是否落在合理类型上
 *
 * 用法：node scripts/verify-personality.mjs
 */
import {
  QUESTIONS,
  TYPES,
  DIMS,
  DISPLAY_DIMS,
  SAMPLE_RULE,
  SAMPLE_LIMITS,
  AUDIO_TAG_GENRE,
} from '../src/data/personality.js';
import {
  computeScores,
  maxByDim,
  normalizeScores,
  dimWeights,
  matchType,
  toDisplayDims,
} from '../src/modules/personality/scoring.js';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) pass += 1;
  else fail += 1;
  console.log(`  [${cond ? 'OK' : 'FAIL'}] ${name}${extra ? '  ' + extra : ''}`);
};

// ══════════════ ① 题库结构 ══════════════
console.log('\n=== ① 题库结构 ===');
const choice = QUESTIONS.filter((q) => q.type === 'choice');
const audio = QUESTIONS.filter((q) => q.type === 'audio');
ok('题库共 50 道', QUESTIONS.length === 50, `实际 ${QUESTIONS.length}`);
ok('听感题 8 道（可抽 4~6 道）', audio.length >= 6, `实际 ${audio.length}`);
ok('题量区间 18~24 内', SAMPLE_RULE.total >= SAMPLE_LIMITS.min && SAMPLE_RULE.total <= SAMPLE_LIMITS.max,
  `每次抽 ${SAMPLE_RULE.total} 道`);
ok('听感抽取数在 4~6 内', SAMPLE_RULE.audio >= SAMPLE_LIMITS.audioMin && SAMPLE_RULE.audio <= SAMPLE_LIMITS.audioMax,
  `抽 ${SAMPLE_RULE.audio} 道`);

const poolByDim = {};
for (const q of choice) poolByDim[q.primary] = (poolByDim[q.primary] || 0) + 1;
const enoughPool = Object.entries(SAMPLE_RULE.choiceByDim).every(
  ([dim, need]) => (poolByDim[dim] || 0) >= need * 1.6,
);
ok('每个维度的题池是抽取数的 1.6 倍以上（保证随机有意义）',
  enoughPool,
  Object.entries(SAMPLE_RULE.choiceByDim).map(([d, n]) => `${d}:池${poolByDim[d] || 0}/抽${n}`).join(' '));

const sumChoice = Object.values(SAMPLE_RULE.choiceByDim).reduce((a, b) => a + b, 0);
ok('选择题抽取数之和 = 16', sumChoice === SAMPLE_RULE.choice, `${sumChoice}`);
ok('每道题都有 primary 且属于 6 维',
  QUESTIONS.every((q) => DIMS.includes(q.primary)),
  QUESTIONS.filter((q) => !DIMS.includes(q.primary)).map((q) => q.order).join(',') || '全部合规');
ok('每道题的选项都非空且都有 score',
  QUESTIONS.every((q) => (q.options || []).length >= 2 && q.options.every((o) => o.score && Object.keys(o.score).length)),
  '');
ok('听感题的音频标签都登记在 AUDIO_TAG_GENRE 里',
  audio.every((q) => q.audioRef && AUDIO_TAG_GENRE[q.audioRef]),
  [...new Set(audio.map((q) => q.audioRef))].join('/'));

// ══════════════ ② 类型向量：每型必须有独占峰 ══════════════
console.log('\n=== ② 六个类型是否彼此可分 ===');
const peakOwner = {};
for (const dim of DIMS) {
  const best = TYPES.map((t) => ({ code: t.code, v: Number(t.dims[dim] ?? 0) })).sort((a, b) => b.v - a.v);
  peakOwner[dim] = { top: best[0], second: best[1] };
}
const eachHasPeak = TYPES.every((t) => {
  const dim = DIMS.find((d) => Number(t.dims[d]) === 1);
  if (!dim) return false;
  return peakOwner[dim].top.code === t.code;
});
ok('每个类型都有一个"独占峰"维度（=1 且别人比不过）', eachHasPeak,
  peakOwner[Object.keys(peakOwner)[0]] ? '' : '');
for (const dim of DIMS) {
  const { top, second } = peakOwner[dim];
  console.log(`    ${dim.padEnd(9)} 最高 ${top.code}=${top.v}  次高 ${second.code}=${second.v}`);
}
const gaps = Object.values(peakOwner).map(({ top, second }) => top.v - second.v);
ok('每个独占峰的领先幅度 ≥ 0.25（不是"勉强第一"）', gaps.every((g) => g >= 0.25),
  gaps.map((g) => g.toFixed(2)).join(' '));

// ══════════════ ③ 抽题配平（2000 次） ══════════════
console.log('\n=== ③ 抽题配平 ===');
function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function sampleOnce() {
  const audioPool = audio;
  const pools = new Map(DIMS.map((d) => [d, choice.filter((q) => q.primary === d)]));
  const picked = shuffle(audioPool).slice(0, SAMPLE_RULE.audio);
  for (const [dim, need] of Object.entries(SAMPLE_RULE.choiceByDim)) {
    picked.push(...shuffle(pools.get(dim)).slice(0, need));
  }
  return shuffle(picked);
}
const sizeSeen = new Set();
let dimCountOk = true;
const distinctSets = new Set();
for (let i = 0; i < 2000; i += 1) {
  const set = sampleOnce();
  sizeSeen.add(set.length);
  distinctSets.add(set.map((q) => q.order).sort((a, b) => a - b).join(','));
  for (const dim of DIMS) {
    const n = set.filter((q) => q.type === 'choice' && q.primary === dim).length;
    if (n !== (SAMPLE_RULE.choiceByDim[dim] || 0)) dimCountOk = false;
  }
}
ok('每次抽到的题量恒定 = 20', sizeSeen.size === 1 && sizeSeen.has(SAMPLE_RULE.total), [...sizeSeen].join('/'));
ok('每个维度被抽到的题数恒定（不受随机影响）', dimCountOk, '');
ok('2000 次抽样几乎没有重复组合（随机真的有变化）',
  distinctSets.size > 1900, `${distinctSets.size}/2000 个不同组合`);

// ══════════════ ④ ⭐ 类型命中分布（5000 个随机作答者） ══════════════
console.log('\n=== ④ 类型命中分布（核心指标）===');
const weights = dimWeights(TYPES);
console.log('    维度权重（按区分度自动算）：' +
  DIMS.map((d) => `${d}=${weights[d].toFixed(2)}`).join(' '));

const hit = Object.fromEntries(TYPES.map((t) => [t.code, 0]));
const N = 5000;
for (let i = 0; i < N; i += 1) {
  const set = sampleOnce();
  const answers = set.map((q) => ({
    questionId: String(q.order),
    order: q.order,
    optionKey: q.options[Math.floor(Math.random() * q.options.length)].key,
  }));
  const raw = computeScores(set, answers);
  const norm = normalizeScores(raw, maxByDim(set));
  const m = matchType(norm, TYPES, weights);
  if (m?.type) hit[m.type.code] += 1;
}
const dist = Object.entries(hit).map(([code, n]) => ({ code, n, pct: (n / N) * 100 }));
console.log('    ' + dist.map((d) => `${d.code} ${d.pct.toFixed(1)}%`).join('  '));
const minPct = Math.min(...dist.map((d) => d.pct));
const maxPct = Math.max(...dist.map((d) => d.pct));
ok('6 个类型全部能被匹配到（老版本 4 维时有类型几乎为 0）',
  dist.every((d) => d.n > 0), dist.map((d) => `${d.code}:${d.n}`).join(' '));
ok('最冷门的类型占比 ≥ 8%（不是"陪跑类型"）', minPct >= 8, `最低 ${minPct.toFixed(1)}%`);
ok('最热门的类型占比 ≤ 30%（不出现"一言不合就是这个型"）', maxPct <= 30, `最高 ${maxPct.toFixed(1)}%`);
ok('分布不塌陷（最热/最冷 ≤ 3 倍）', maxPct / minPct <= 3, `比值 ${(maxPct / minPct).toFixed(2)}`);

// ══════════════ ⑤ 极端与典型作答 ══════════════
console.log('\n=== ⑤ 极端/典型作答 ===');
function answerWith(set, picker) {
  const answers = set.map((q) => ({ questionId: String(q.order), order: q.order, optionKey: picker(q).key }));
  const raw = computeScores(set, answers);
  const norm = normalizeScores(raw, maxByDim(set));
  const m = matchType(norm, TYPES, weights);
  return { type: m?.type?.code, norm, display: toDisplayDims(norm) };
}
// 每题都选第一个选项（"总选 A"的人）
const alwaysA = answerWith(sampleOnce(), (q) => q.options[0]);
const alwaysB = answerWith(sampleOnce(), (q) => q.options[1]);
const alwaysC = answerWith(sampleOnce(), (q) => q.options[2]);
const alwaysD = answerWith(sampleOnce(), (q) => q.options[3]);
console.log(`    全选 A → ${alwaysA.type}　全选 B → ${alwaysB.type}　全选 C → ${alwaysC.type}　全选 D → ${alwaysD.type}`);
ok('固定作答不会全部落到同一个类型（题目选项没有系统性偏斜）',
  new Set([alwaysA.type, alwaysB.type, alwaysC.type, alwaysD.type]).size >= 3,
  new Set([alwaysA.type, alwaysB.type, alwaysC.type, alwaysD.type]).size + ' 个不同结果');

// 展示维度：必须是 4 个键、值在 0~1
const show = alwaysA.display;
ok('展示维度仍是 4 个键（人格卡 4 根条不变，前端零改动）',
  Object.keys(show).length === 4 && DISPLAY_DIMS.every((d) => d in show),
  Object.keys(show).join(','));
ok('展示维度取值都在 0~1', Object.values(show).every((v) => v >= 0 && v <= 1),
  JSON.stringify(show));

// 专项：把"词句收藏家"该选的那种答案喂进去，应该匹配到 LYR
const lyricSet = sampleOnce();
const lyrPick = answerWith(lyricSet, (q) => {
  // 每次挑"该题里 lyric 分最高"的选项 —— 模拟一个只认歌词的人
  return q.options.reduce((best, o) => ((o.score.lyric || 0) > (best.score.lyric || 0) ? o : best), q.options[0]);
});
const melPick = answerWith(lyricSet, (q) =>
  q.options.reduce((best, o) => ((o.score.melody || 0) > (best.score.melody || 0) ? o : best), q.options[0]),
);
const rhyPick = answerWith(lyricSet, (q) =>
  q.options.reduce((best, o) => ((o.score.rhythm || 0) > (best.score.rhythm || 0) ? o : best), q.options[0]),
);
const texPick = answerWith(lyricSet, (q) =>
  q.options.reduce((best, o) => ((o.score.texture || 0) > (best.score.texture || 0) ? o : best), q.options[0]),
);
const novPick = answerWith(lyricSet, (q) =>
  q.options.reduce((best, o) => ((o.score.novelty || 0) > (best.score.novelty || 0) ? o : best), q.options[0]),
);
const clmPick = answerWith(lyricSet, (q) =>
  q.options.reduce((best, o) => ((o.score.calm || 0) > (best.score.calm || 0) ? o : best), q.options[0]),
);
console.log(`    只认歌词→${lyrPick.type}　只认旋律→${melPick.type}　只认节奏→${rhyPick.type}` +
  `　只认音色→${texPick.type}　只认新鲜→${novPick.type}　只认安静→${clmPick.type}`);
ok('★ "只认某一维"的作答能一一对应到那个人格类型',
  lyrPick.type === 'LYR' && melPick.type === 'MEL' && rhyPick.type === 'RHY' &&
    texPick.type === 'TMB' && novPick.type === 'EXP' && clmPick.type === 'CLM',
  `LYR/MEL/RHY/TMB/EXP/CLM 实得 ${lyrPick.type}/${melPick.type}/${rhyPick.type}/${texPick.type}/${novPick.type}/${clmPick.type}`);

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败（共 ${pass + fail}） ===`);
process.exit(fail ? 1 : 0);
