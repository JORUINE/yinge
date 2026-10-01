/**
 * 把六型展示文案（description / listeningProfile）应用到库里已有的 PersonalityType（2026-10-02）
 * ------------------------------------------------------------
 * 背景：改 `src/data/personality.js` 的 TYPES **不会**自动更新库里已 seed 的文档
 *   （库里已有 6 条 PersonalityType），所以需要这个幂等脚本把新文案写回去。
 * 幂等：按 code 更新，可反复跑；只动展示文案字段，**不碰 dims / 计分**。
 * 用法：node scripts/apply-type-copy.mjs [--dry]
 */
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { PersonalityType } from '../src/models/index.js';
import { TYPES } from '../src/data/personality.js';

const dry = process.argv.includes('--dry');
await connectDb();

let changed = 0;
for (const t of TYPES) {
  const doc = await PersonalityType.findOne({ code: t.code });
  if (!doc) {
    console.log(`  [skip] ${t.code} 库里没有这条类型`);
    continue;
  }
  const before = doc.description || '';
  const need = before !== t.description;
  if (need) {
    if (!dry) {
      doc.description = t.description;
      // listeningProfile 若数据文件有、库里没有，一并补上（不覆盖库里已有的人工内容）
      if (t.listeningProfile && !doc.listeningProfile) doc.listeningProfile = t.listeningProfile;
      await doc.save();
    }
    changed += 1;
    console.log(`  [${dry ? 'dry' : 'ok'}] ${t.code} ${t.name}`);
    console.log(`        旧: ${before}`);
    console.log(`        新: ${t.description}`);
  } else {
    console.log(`  [=] ${t.code} ${t.name} 文案已是最新`);
  }
}
console.log(`\n===== 类型文案应用：${changed} 条${dry ? '（dry-run，未写库）' : '已更新'} =====`);
await disconnectDb();
process.exit(0);
