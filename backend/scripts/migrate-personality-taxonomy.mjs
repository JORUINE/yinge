/**
 * 迁移：把人格分类法换成「设计稿那套」
 * ------------------------------------------------------------
 * 背景（2026-09-17）：
 *   库里原本是另一套 6 类型（电音狂热者 / 深夜循环者 … EN/NT/EX/SO/CL/BL，
 *   维度 energy/social/curiosity/nostalgia），与设计稿（旋律捕手 / 节拍动物 /
 *   词句收藏家 / 音色控 / 安静聆听者 / 探索者，维度 melody/rhythm/arrangement/calm）
 *   完全不通。用户确认：**以设计稿为准**。
 *
 * 本脚本：清废弃类型 + 覆盖写 12 题与 6 类型 + 清掉旧维度的测评结果（旧结果已不可比）。
 * 幂等：可反复执行。
 * 用法：node scripts/migrate-personality-taxonomy.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import {
  PersonalityQuestion,
  PersonalityType,
  PersonalityResult,
} from '../src/models/index.js';
import { QUESTIONS, TYPES, DEPRECATED_TYPE_CODES } from '../src/data/personality.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yinge';
await mongoose.connect(uri);

// 1) 清废弃类型
const removed = await PersonalityType.deleteMany({ code: { $in: DEPRECATED_TYPE_CODES } });
console.log(`· 清掉废弃人格类型：${removed.deletedCount} 个（${DEPRECATED_TYPE_CODES.join('/')}）`);

// 2) 覆盖写题目
for (const q of QUESTIONS) {
  await PersonalityQuestion.updateOne({ order: q.order }, { $set: q }, { upsert: true });
}
console.log(`· 题目已写入：${QUESTIONS.length} 道`);

// 3) 覆盖写类型
for (const t of TYPES) {
  await PersonalityType.updateOne({ code: t.code }, { $set: t }, { upsert: true });
}
console.log(`· 人格类型已写入：${TYPES.length} 个（${TYPES.map((t) => t.code).join('/')}）`);

// 4) 清掉旧维度下的测评结果（分数口径变了，旧结果不可比）
const wiped = await PersonalityResult.deleteMany({});
console.log(`· 清掉旧测评结果：${wiped.deletedCount} 条（维度口径已变，旧结果不可比）`);

const typeList = await PersonalityType.find({}).select('code name').sort({ code: 1 });
console.log('· 当前类型库：' + typeList.map((t) => `${t.code}=${t.name}`).join(' '));
console.log('· 当前题目数：' + (await PersonalityQuestion.countDocuments({})));

await mongoose.disconnect();
