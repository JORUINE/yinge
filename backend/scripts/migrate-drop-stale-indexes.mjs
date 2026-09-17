/**
 * 迁移：清理 votes 集合上的历史遗留索引
 * ------------------------------------------------------------
 * 背景（2026-09-17 本次修复）：
 *   Vote 早期版本的唯一索引是 **非 partial** 的 (matchId, userId)。
 *   新赛制 v2 引入「小组/复活一次多选 K 张」后，投票改写成 partial 索引
 *   （只对 matchId 为 ObjectId 的淘汰赛投票生效）。
 *   但 MongoDB **不会**因为 Schema 改动而自动删除旧索引 → 小组投票时
 *   一次性插入的多条记录 matchId 均为 null，会撞上旧的非 partial 唯一索引，
 *   报 E11000「记录已存在，请勿重复操作」→ 小组赛第一组就投不进去。
 *
 * 用法：node scripts/migrate-drop-stale-indexes.mjs
 * 幂等：没有遗留索引时安全跳过。
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yinge';

/** 需要删除的历史遗留索引名 */
const STALE_INDEXES = {
  votes: ['matchId_1_userId_1'],
};

await mongoose.connect(uri);
const db = mongoose.connection.db;

let dropped = 0;
for (const [collName, names] of Object.entries(STALE_INDEXES)) {
  const coll = db.collection(collName);
  let existing;
  try {
    existing = new Set((await coll.indexes()).map((i) => i.name));
  } catch {
    console.log('· 跳过 ' + collName + '（集合不存在）');
    continue;
  }
  for (const name of names) {
    if (existing.has(name)) {
      await coll.dropIndex(name);
      console.log('· 已删除遗留索引：' + collName + '.' + name);
      dropped += 1;
    }
  }
}

if (!dropped) {
  console.log('· 没有需要清理的遗留索引。');
} else {
  console.log('· 清理完成，共删除 ' + dropped + ' 个。');
}
console.log('· 当前 votes 索引：' + (await db.collection('votes').indexes()).map((i) => i.name).join(', '));

await mongoose.disconnect();
