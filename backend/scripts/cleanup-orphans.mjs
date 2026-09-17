/**
 * 清理孤儿数据（一次性 / 可重复跑）
 * ------------------------------------------------------------
 * 背景：deleteBattle 早期只删 Battle 与 BattleMatch，没删 Vote / BattleGroup，
 * 于是删掉的对决仍会以「孤儿票」形式算进榜单与人格分布。
 * 2026-09-17 已修 deleteBattle 做级联删除；本脚本清掉此前遗留的孤儿数据。
 *
 * 用法：node scripts/cleanup-orphans.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Battle, BattleMatch, BattleGroup, Vote } from '../src/models/index.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yinge';
await mongoose.connect(uri);

const battleIds = new Set((await Battle.find({}).select('_id')).map((b) => String(b._id)));
console.log('· 现存对决：' + battleIds.size + ' 场');

async function clean(model, name) {
  const docs = await model.find({}).select('battleId');
  const orphanIds = docs.filter((d) => !battleIds.has(String(d.battleId))).map((d) => d._id);
  if (orphanIds.length) {
    await model.deleteMany({ _id: { $in: orphanIds } });
    console.log(`· ${name}：清理孤儿 ${orphanIds.length} 条`);
  } else {
    console.log(`· ${name}：无孤儿`);
  }
}

await clean(Vote, 'votes（孤儿票）');
await clean(BattleGroup, 'battlegroups');
await clean(BattleMatch, 'battlematches');

console.log('· 清理后 votes 总数：' + (await Vote.countDocuments({})));

// 榜单口径复查：有效票数 Top5
const top = await Vote.aggregate([
  { $match: { isInvalid: false } },
  { $group: { _id: '$albumId', votes: { $sum: 1 } } },
  { $sort: { votes: -1 } },
  { $limit: 5 },
]);
console.log('· 有效票 Top5（albumId: votes）：' + top.map((t) => `${t._id}:${t.votes}`).join(' '));

await mongoose.disconnect();
