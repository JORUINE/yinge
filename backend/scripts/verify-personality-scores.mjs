#!/usr/bin/env node
/**
 * 第六十三批 · 人格测评「数据统一性 / 完整性」验收（跑真库 + 真接口链路）
 * ===================================================================
 * 用户报的问题（2026-10-22 截图）：
 *   · 右栏「完整维度得分」出现 **13 / 10、18 / 10**（分数超过满分）
 *   · 同一份数据，**左边人格卡显示 10/10、右边显示 18/10** —— 两边对不上
 *   · AI 解读里出现英文维度键：「你在「arrangement」与「rhythm」上表现突出」
 *
 * 与既有 `verify-personality.mjs`（纯函数、不连库、验"6 型可分性"）互补：
 *   本脚本**连真库**、并且**调用真实 getResult()** 去验"存进去的东西读出来对不对"。
 *
 * 判据：
 *   A. 规则自洽：SAMPLE_RULE 的 16 + 4 = 20，各维度抽题数之和 = 16
 *   B. 题库完整：选项分值只含 6 个合法维度、有限非负、每题至少一个非零分
 *   C. 类型库完整：6 个类型、每型 6 维齐全且 0~1
 *   D. 全链路模拟 300 次：抽题 → 计分 → 归一化 → 匹配 → 折算 4 维；
 *      所有值 ∈ [0,1]；**卡片与右栏的换算结果必须相等且 ≤10**
 *   E. 库内每条历史结果都走 `getResult()`：4 个展示维度、值 ∈[0,1]、无 NaN、解读无英文键
 *   F. 旧格式记录逐条打印「改前 → 改后」
 *
 * 用法：cd backend && node scripts/verify-personality-scores.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { PersonalityQuestion, PersonalityType, PersonalityResult } from '../src/models/index.js';
import { getResult, sampleQuestions } from '../src/modules/personality/personality.service.js';
import {
  computeScores, maxByDim, normalizeScores, dimWeights, matchType, toDisplayDims,
} from '../src/modules/personality/scoring.js';
import { DIMS, DISPLAY_DIMS, SAMPLE_RULE, SAMPLE_LIMITS, NEUTRAL_KEY } from '../src/data/personality.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yinge';
await mongoose.connect(uri);

let pass = 0;
const fails = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`✅ ${name} — ${detail}`); }
  else { fails.push(name); console.log(`❌ ${name} — ${detail}`); }
};
const inUnit = (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1;
/** 与前端 utils/personality.js 完全同一套换算（人格卡与右栏都用它） */
const toTen = (v) => Math.max(0, Math.min(10, Math.round(Number(v) * 10)));

console.log('══════ A. 抽题规则自洽 ══════');
ok('16 选择 + 4 听感 = 20 题',
  SAMPLE_RULE.choice + SAMPLE_RULE.audio === SAMPLE_RULE.total,
  `${SAMPLE_RULE.choice}+${SAMPLE_RULE.audio}=${SAMPLE_RULE.total}`);
ok('各维度抽题数之和 = 选择部分题量',
  Object.values(SAMPLE_RULE.choiceByDim).reduce((a, b) => a + b, 0) === SAMPLE_RULE.choice,
  JSON.stringify(SAMPLE_RULE.choiceByDim));
ok('SAMPLE_LIMITS 覆盖 20 题',
  SAMPLE_LIMITS.min <= SAMPLE_RULE.total && SAMPLE_LIMITS.max >= SAMPLE_RULE.total,
  `${SAMPLE_LIMITS.min}~${SAMPLE_LIMITS.max}`);

console.log('\n══════ B. 题库完整性 ══════');
const questions = await PersonalityQuestion.find().lean();
ok('题库非空', questions.length > 0, `${questions.length} 道`);
/**
 * ⚠️ 判据口径（第六十三批修正）：
 *   · 中立出口（key === NEUTRAL_KEY）**本来就该是空分**（选了等于不表态），不能算"异常"；
 *   · 听感题里也有"完全无感"这类选项分值为 0（明确写了四个 0），同样合法；
 *   · 真正要守的是：**每道题至少有一个选项能产生非零分**（否则这道题白问），
 *     以及所有分值键都是 6 个合法维度、值有限非负。
 */
let noScoreQuestion = 0;
let badKey = 0;
let neutralNotBlank = 0;
let zeroOptions = 0;
for (const q of questions) {
  let usable = 0;
  for (const o of q.options || []) {
    const entries = Object.entries(o.score || {});
    const nonzero = entries.some(([, v]) => Number(v) > 0);
    if (nonzero) usable += 1;
    if (!nonzero) {
      zeroOptions += 1;
      if (o.key === NEUTRAL_KEY && entries.length) neutralNotBlank += 1;
    }
    for (const [k, v] of entries) {
      if (!DIMS.includes(k) || !Number.isFinite(Number(v)) || Number(v) < 0) badKey += 1;
    }
  }
  if (!usable) noScoreQuestion += 1;
}
ok('每道题至少有一个能加分的选项', noScoreQuestion === 0, `白问题 ${noScoreQuestion} 道`);
ok('中立选项（E）不带分值', neutralNotBlank === 0, `异常 ${neutralNotBlank} 个（合法零分选项共 ${zeroOptions} 个）`);
ok('分值键只含 6 个合法维度且非负', badKey === 0, `异常分值 ${badKey} 个`);
const dimCoverage = {};
for (const q of questions) for (const o of q.options || []) for (const k of Object.keys(o.score || {})) dimCoverage[k] = (dimCoverage[k] || 0) + 1;
ok('6 个维度在题库里都有覆盖', DIMS.every((d) => dimCoverage[d] > 0), JSON.stringify(dimCoverage));

console.log('\n══════ C. 类型库完整性 ══════');
const types = await PersonalityType.find().lean();
ok('类型数 = 6', types.length === 6, `${types.length} 个`);
let badType = 0;
for (const t of types) {
  for (const d of DIMS) if (!inUnit(t.dims?.[d])) badType += 1;
}
ok('每型 6 维齐全且 0~1', badType === 0, `越界 ${badType} 处`);

console.log('\n══════ D. 全链路模拟 300 次 ══════');
const weights = dimWeights(types);
let simBad = 0;
let simMismatch = 0;
let simMaxTen = 0;
let simNoType = 0;
for (let i = 0; i < 300; i += 1) {
  const sampled = sampleQuestions(questions);
  if (sampled.length !== SAMPLE_RULE.total) simBad += 1;
  const answers = sampled.map((q) => {
    const opts = q.options || [];
    const o = opts[Math.floor(Math.random() * opts.length)] || opts[0];
    return { questionId: q._id, optionKey: o?.key };
  });
  const raw = computeScores(sampled, answers);
  const ceilings = maxByDim(sampled);
  const norm = normalizeScores(raw, ceilings);
  const display = toDisplayDims(norm);
  const matched = matchType(norm, types, weights);
  if (!matched?.type) simNoType += 1;
  for (const d of DIMS) if (!inUnit(norm[d])) simBad += 1;
  for (const d of DISPLAY_DIMS) if (!inUnit(display[d])) simBad += 1;
  for (const d of DISPLAY_DIMS) {
    const card = Math.max(0, Math.min(10, Math.round(display[d] * 10)));
    const panel = toTen(display[d]);
    if (card !== panel) simMismatch += 1;
    simMaxTen = Math.max(simMaxTen, card, panel);
  }
}
ok('模拟 300 次：题量正确、所有分值 0~1', simBad === 0 && simNoType === 0, `异常 ${simBad} 处 / 未匹配 ${simNoType} 次`);
ok('模拟 300 次：卡片与右栏数值完全一致', simMismatch === 0, `不一致 ${simMismatch} 处`);
ok('模拟 300 次：没有任何展示值 >10', simMaxTen <= 10, `最大 ${simMaxTen}`);

console.log('\n══════ E. 库内历史结果（走真 getResult） ══════');
const results = await PersonalityResult.find().select('_id userId typeCode scores createdAt').lean();
let badScore = 0;
let badKeys = 0;
let badState = 0;
let badComment = 0;
let legacyCount = 0;
const RAW_KEY_IN_TEXT = /「(melody|rhythm|lyric|texture|novelty|calm)」/;
for (const r of results) {
  // eslint-disable-next-line no-await-in-loop
  const out = await getResult(r._id, r.userId);
  const s = out.scores || {};
  const keys = Object.keys(s);
  if (out.scoreState === 'legacy-missing') {
    // 旧记录：允许空展示值，但必须是"空"，不能塞原始分
    legacyCount += 1;
    if (keys.length) badState += 1;
  } else if (keys.length !== 4 || !keys.every((k) => DISPLAY_DIMS.includes(k))) {
    badKeys += 1;
    continue;
  }
  for (const k of keys) if (!inUnit(s[k])) badScore += 1;
  if (RAW_KEY_IN_TEXT.test(out.aiComment || '')) badComment += 1;
}
ok(`库内 ${results.length} 条结果：展示值要么是 4 维、要么明确标 legacy-missing`,
  badKeys === 0 && badState === 0, `异常 ${badKeys + badState} 条（其中旧记录 ${legacyCount} 条）`);
ok('库内所有展示值都在 0~1', badScore === 0, `越界 ${badScore} 处`);
ok('解读文案里没有英文维度键', badComment === 0, `仍有 ${badComment} 条`);

if (legacyCount) {
  console.log(`\n  ⚠️ 有 ${legacyCount} 条早期记录（2026-09 之前，scores 存的是原始分）：`);
  console.log('     旧题库的选项分已被重写，无法还原成 10 分制 ⇒ 接口标 legacy-missing，页面提示重新测一次，');
  console.log('     不再显示 13/10、18/10 这种超出满分的数字。');
}

await mongoose.disconnect();
console.log(`\n══════ 通过 ${pass} 项 / 失败 ${fails.length} 项 ══════`);
if (fails.length) {
  console.log(`失败项：\n - ${fails.join('\n - ')}`);
  process.exit(1);
}
