/**
 * 把六型展示文案五件套应用到库里已有的 PersonalityType
 * ------------------------------------------------------------
 * 字段：description / listeningProfile / traits / albumHints / theory
 *
 * 背景（2026-10-10 第三十四批补）：
 *   改 `src/data/personality.js` 的 TYPES **不会**自动更新库里已 seed 的文档。
 *   第三十二批给详情页加了「这类人是谁 / 他们的特征 / 他们常听 / 依据」四块，
 *   前端自检全部走 mock API（接口数据是自己造的）→ 十份脚本全绿，
 *   但**真实库里 traits 一直是 0 条**，「他们的特征」整块被 v-if 吃掉没渲染。
 *   这个缺漏只有连真库才查得出来，所以把审计脚本固化成 tools/pw/probe-r34-db-copy.mjs。
 *
 * ⚠️ 与「后台可编辑文案」的冲突（重要）：
 *   第三十二批起管理员可以在后台改这四块文案。若本脚本每次都无脑覆盖，
 *   会把管理员的人工编辑冲掉。所以分两种模式：
 *     · 默认（只填空）：库里没有 / 为空才写；已有内容一律保留 —— 可放心反复跑。
 *     · --force：按静态文件全量覆盖（本轮用它一次性把旧文案同步到定稿值）。
 *
 * 幂等：按 code 更新，可反复跑；**只动展示文案字段，不碰 dims / 计分 / 推荐专辑**。
 * 用法：node scripts/apply-type-copy.mjs [--dry] [--force]
 */
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { PersonalityType } from '../src/models/index.js';
import { TYPES } from '../src/data/personality.js';

const dry = process.argv.includes('--dry');
const force = process.argv.includes('--force');
/** 展示文案五件套：key = 字段名，kind = 字符串 or 数组 */
const FIELDS = [
  { key: 'description', kind: 'str' },
  { key: 'listeningProfile', kind: 'str' },
  { key: 'traits', kind: 'arr' },
  { key: 'albumHints', kind: 'arr' },
  { key: 'theory', kind: 'str' },
];

const isEmpty = (v) => (Array.isArray(v) ? v.length === 0 : !v || !String(v).trim());
const eq = (a, b) => (Array.isArray(b) ? JSON.stringify(a || []) === JSON.stringify(b) : String(a || '') === String(b || ''));
const one = (v, n = 30) => String(v ?? '').replace(/\s+/g, ' ').slice(0, n);

await connectDb();
console.log(`模式：${force ? 'force（按静态文件全量覆盖）' : '只填空（已有内容保留）'}${dry ? ' · dry-run 不写库' : ''}\n`);

let changed = 0, skipped = 0, missing = 0;
for (const t of TYPES) {
  const doc = await PersonalityType.findOne({ code: t.code });
  if (!doc) { console.log(`  [skip] ${t.code} 库里没有这条类型`); missing += 1; continue; }

  const patch = {};
  const lines = [];
  for (const { key, kind } of FIELDS) {
    const want = kind === 'arr' ? (t[key] || []) : (t[key] || '');
    if (isEmpty(want)) continue;                 // 静态文件也没给 → 不碰
    const have = kind === 'arr' ? (doc[key] || []) : (doc[key] || '');
    if (eq(have, want)) continue;                // 已经一致
    if (!force && !isEmpty(have)) {              // 只填空模式 + 库里已有 → 保留
      lines.push(`        ~ ${key}：库里已有内容，保留（要同步请加 --force）`);
      continue;
    }
    patch[key] = kind === 'arr' ? [...want] : want;
    lines.push(`        - ${key}: ${Array.isArray(want) ? `[${want.length} 条] ${one(want.join(' / '), 40)}` : one(want, 46)}`);
    if (!isEmpty(have)) {
      lines.push(`          （覆盖旧值：${Array.isArray(have) ? `[${have.length} 条] ${one(have.join(' / '), 40)}` : one(have, 46)}）`);
    }
  }

  if (!Object.keys(patch).length) {
    console.log(`  [=] ${t.code} ${t.name} 文案已是最新`);
    skipped += 1;
    continue;
  }
  if (!dry) await PersonalityType.updateOne({ code: t.code }, { $set: patch });
  changed += 1;
  console.log(`  [${dry ? 'dry' : 'ok'}] ${t.code} ${t.name}`);
  lines.forEach((l) => console.log(l));
}
console.log(`\n===== 类型文案应用：${changed} 条更新 / ${skipped} 条已是最新 / ${missing} 条缺${dry ? '（dry-run，未写库）' : '（已写库）'} =====`);
await disconnectDb();
process.exit(0);
