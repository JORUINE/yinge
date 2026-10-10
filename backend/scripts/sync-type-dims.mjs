/**
 * 把六型画像维度（`dims`）同步成静态数据源的 6 维
 * ------------------------------------------------------------
 * 为什么单独一个脚本、不并进 apply-type-copy.mjs：
 *   那个脚本的契约是"只动展示文案、不碰 dims / 计分"，混在一起以后没人敢跑。
 *
 * 背景（2026-10-10 第三十四批查出的真缺漏）：
 *   库里六型的 `dims` 只有 **3 个键**（melody / rhythm / calm），
 *   而静态数据源早就是 **6 维**（melody / rhythm / lyric / texture / novelty / calm），
 *   且注释里写明：「老版本用 4 维时 LYR / EXP 几乎匹配不到，就是缺这一条」。
 *
 *   ⚠️ 而 `matchType()` 的入参是 `await PersonalityType.find()` —— **读的是库里的 dims**。
 *   scoring.js 里 `const b = Number(dims[dim] ?? 0) * weight`
 *   ⇒ 库里缺的 lyric / texture / novelty 三维，b 恒为 0 ⇒ 这三条线在匹配里权重归零。
 *
 *   蒙特卡洛实测（4000 次随机作答，见 tools/pw/probe-r34-match-dims.mjs）：
 *     库里 3 维： MEL 16.0 / RHY 26.2 / **LYR 9.4** / TMB 13.7 / CLM 24.7 / **EXP 10.0**
 *     静态 6 维： MEL  8.9 / RHY 21.7 / **LYR 21.6** / TMB 10.2 / CLM 20.3 / **EXP 17.3**
 *   ⇒ 词句收藏家 / 探索者被系统性低估（随机作答下应≈16.7%），LYR 差 2.3 倍。
 *
 * 幂等：按 code 更新，可反复跑；**只动 dims，不碰文案 / 不碰推荐专辑 / 不碰题目**。
 * 用法：node scripts/sync-type-dims.mjs [--dry]
 */
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { PersonalityType } from '../src/models/index.js';
import { TYPES, DIMS } from '../src/data/personality.js';

const dry = process.argv.includes('--dry');
await connectDb();
console.log(`目标：把库里 dims 同步成静态数据源的 ${DIMS.length} 维${dry ? '（dry-run，不写库）' : ''}\n`);

let changed = 0, same = 0, missing = 0;
for (const t of TYPES) {
  const doc = await PersonalityType.findOne({ code: t.code });
  if (!doc) { console.log(`  [skip] ${t.code} 库里没有这条类型`); missing += 1; continue; }

  const before = doc.dims && typeof doc.dims === 'object' ? doc.dims : {};
  const after = {};
  for (const d of DIMS) after[d] = Number(t.dims?.[d] ?? 0);

  const eq = DIMS.every((d) => Number(before[d] ?? 0) === after[d])
    && Object.keys(before).length === DIMS.length;

  if (eq) { console.log(`  [=] ${t.code} ${t.name} 已是 ${DIMS.length} 维`); same += 1; continue; }

  if (!dry) await PersonalityType.updateOne({ code: t.code }, { $set: { dims: after } });
  changed += 1;
  const missKeys = DIMS.filter((d) => !(d in before));
  console.log(`  [${dry ? 'dry' : 'ok'}] ${t.code} ${t.name}`);
  console.log(`        旧：${JSON.stringify(before)}`);
  console.log(`        新：${JSON.stringify(after)}${missKeys.length ? `   ← 补上缺的 ${missKeys.join(' / ')}` : ''}`);
}
console.log(`\n===== dims 同步：${changed} 条更新 / ${same} 条已是最新 / ${missing} 条缺${dry ? '（dry-run，未写库）' : '（已写库）'} =====`);
await disconnectDb();
process.exit(0);
