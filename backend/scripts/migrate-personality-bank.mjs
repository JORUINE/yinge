/**
 * 迁移：人格题库扩到 50 道 + 6 维计分 + 类型补理论字段（2026-09-22）
 * ------------------------------------------------------------
 * 做什么：
 *   ① 按 `order` upsert 新题库（50 道：选择 42 + 听感 8）
 *   ② 删掉题库里"不在新题库 order 列表"的残留题目（旧版是 12 道，后台也可能加过别的）
 *   ③ upsert 6 个类型（dims 换成 6 维 + theory / listeningProfile / albumHints）
 *   ④ 清掉已废弃的旧人格 code（EN/NT/EX/SO/CL/BL）
 *
 * ⚠️ **不删测评结果**（与上一版 migrate-personality-taxonomy.mjs 不同）：
 *    这一版只是"题量变多 + 内部维度变细"，`PersonalityResult.scores` 用 Mixed 存，
 *    getResult 对新旧两种格式都做了兼容（旧记录直接是 4 维展示值，新记录取 _display），
 *    所以历史结果仍然打得开。删结果对用户是纯粹的损失。
 *
 * 幂等：可反复执行。
 * 用法：node scripts/migrate-personality-bank.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { PersonalityQuestion, PersonalityType, PersonalityResult } from '../src/models/index.js';
import { QUESTIONS, TYPES, DEPRECATED_TYPE_CODES, SAMPLE_RULE } from '../src/data/personality.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yinge';
await mongoose.connect(uri);

// ── ① upsert 题目 ──
for (const q of QUESTIONS) {
  await PersonalityQuestion.updateOne({ order: q.order }, { $set: q }, { upsert: true });
}
console.log(`· 题目已写入：${QUESTIONS.length} 道（选择 ${QUESTIONS.filter((q) => q.type === 'choice').length} / 听感 ${QUESTIONS.filter((q) => q.type === 'audio').length}）`);

// ── ② 清残留题 ──
const keepOrders = QUESTIONS.map((q) => q.order);
const stale = await PersonalityQuestion.deleteMany({ order: { $nin: keepOrders } });
if (stale.deletedCount) console.log(`· 清掉不在新题库里的残留题：${stale.deletedCount} 道`);
console.log(`· 库中题目总数：${await PersonalityQuestion.countDocuments({})}`);

// ── ③ upsert 类型 ──
for (const t of TYPES) {
  await PersonalityType.updateOne({ code: t.code }, { $set: t }, { upsert: true });
}
console.log(`· 人格类型已写入：${TYPES.length} 个（${TYPES.map((t) => t.code).join('/')}）`);

// ── ④ 清废弃 code ──
const removed = await PersonalityType.deleteMany({ code: { $in: DEPRECATED_TYPE_CODES } });
if (removed.deletedCount) {
  console.log(`· 清掉废弃人格类型：${removed.deletedCount} 个（${DEPRECATED_TYPE_CODES.join('/')}）`);
}

const typeList = await PersonalityType.find({}).select('code name dims').sort({ code: 1 });
console.log('· 当前类型库：');
for (const t of typeList) {
  const dims = Object.entries(t.dims || {})
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  console.log(`    ${t.code} ${t.name}  ${dims}`);
}

// ── 抽题规则自检（不连库，纯算） ──
const byDim = {};
for (const q of QUESTIONS) {
  if (q.type === 'audio') continue;
  byDim[q.primary] = (byDim[q.primary] || 0) + 1;
}
console.log('· 选择题按主维度分布：' + Object.entries(byDim).map(([k, v]) => `${k}=${v}`).join(' '));
console.log(
  `· 每次抽题：${SAMPLE_RULE.total} 道（听感 ${SAMPLE_RULE.audio} + 选择 ${SAMPLE_RULE.choice}；` +
    Object.entries(SAMPLE_RULE.choiceByDim).map(([k, v]) => `${k}×${v}`).join(' ') +
    '）',
);
console.log(`· 保留历史测评结果：${await PersonalityResult.countDocuments({})} 条（本脚本不删）`);

await mongoose.disconnect();
console.log('\n✅ 迁移完成');
