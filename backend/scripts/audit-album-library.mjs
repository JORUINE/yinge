/**
 * 曲库体检：找出「标记为合格、但按现行准入规则已不合格」的专辑（2026-09-22）
 * ------------------------------------------------------------
 * ⚠️ 先说清口径（第一版写错过）：曲库是**长期累积的缓存** —— 只要被搜过就会落库，
 *    所以"库里有 4600 张不合格"不是缺陷数，那些大多从一开始就带着 `isEligible: false`。
 *    真正有害的是另一类：**`isEligible: true` 但按今天收紧后的规则已经不该合格**。
 *    为什么会出现这种"过期合格"：
 *      · 准入规则是逐步加严的（2026-09-17/18 补了 live/原声/remix/单曲/再版…），
 *        老数据在写入时用的是**当时的**规则，之后没人复查；
 *      · `applyAdmission` 只在**组池**那一刻跑，缓存命中时不会重跑。
 *    后果：这类专辑能进玩法和人格推荐 —— 实测 TMB 音色控里就混进了一条"幕后创作纪录"，
 *    以及「petal – the complete live album」「petal – the a cappellas」这类非正式专辑。
 *
 * 做三件事（默认**只读**）：
 *   ① 在 `isEligible: true` 的集合里重跑 `evaluateAlbum`，列出"过期合格"的与命中规则
 *   ② 报告它们被谁引用（对决 / 收藏 / 人格推荐）—— 被引用的不能删
 *   ③ `--fix-recs`：把它们从人格类型 `recommendAlbumIds` 里摘掉（唯一不伤历史数据的动作）
 *   `--fix-flags`：把"过期合格"的 `isEligible` 改回 false（**推荐**；不删数据、不动战绩）
 *   `--delete`：只删"零引用"的，并先导出 id 清单
 *
 * 用法：
 *   node scripts/audit-album-library.mjs              # 只体检出报告
 *   node scripts/audit-album-library.mjs --fix-recs --fix-flags   # 修人格推荐 + 改回不合格标记
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** 清单一律写到仓库根的「_证据与痕迹/曲库体检/」——和别的留痕放一起，别散在 backend 下 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
import { Album, Battle, Favorite, PersonalityType, PersonalityResult } from '../src/models/index.js';
import { evaluateAlbum, RULE_LABELS } from '../src/modules/music/admission.js';

const FIX_RECS = process.argv.includes('--fix-recs');
const FIX_FLAGS = process.argv.includes('--fix-flags');
const DELETE = process.argv.includes('--delete');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yinge';
await mongoose.connect(uri);

const total = await Album.countDocuments({});
const eligibleTotal = await Album.countDocuments({ isEligible: true });
const albums = await Album.find({ isEligible: true }).select(
  'name artistName artistExternalId trackCount releaseDate isAlbumType albumId',
).lean();
console.log(`· 曲库共 ${total} 张（其中标记为合格 ${eligibleTotal} 张）；
  本次只复查"合格"这一批 —— 未标记合格的是缓存里的搜索残留，不参与玩法。`);

const bad = [];
for (const a of albums) {
  const v = evaluateAlbum(a, { artistExternalId: a.artistExternalId });
  if (!v.isEligible) bad.push({ album: a, reason: v.excludeReason });
}

console.log(`\n=== 体检结果：过期合格 ${bad.length} / ${eligibleTotal} 张（这些可能漏进玩法与推荐）===`);
const byRule = bad.reduce((acc, b) => {
  acc[b.reason] = (acc[b.reason] || 0) + 1;
  return acc;
}, {});
for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${rule}  ${n} 张`);
}
console.log('\n  前 25 条明细：');
for (const b of bad.slice(0, 25)) {
  console.log(`   · [${b.reason}] ${b.album.name} — ${b.album.artistName}（${b.album.trackCount} 首）`);
}
if (bad.length > 25) console.log(`   …还有 ${bad.length - 25} 张，见导出的 JSON`);

// ── 引用检查：哪些被历史数据引用（这些不能删） ──
const badIds = bad.map((b) => b.album._id);
const [inBattles, inFavs, inTypes, inResults] = await Promise.all([
  Battle.countDocuments({ albumIds: { $in: badIds } }),
  Favorite.countDocuments({ albumId: { $in: badIds } }),
  PersonalityType.countDocuments({ recommendAlbumIds: { $in: badIds } }),
  PersonalityResult.countDocuments({ recommendAlbumIds: { $in: badIds } }),
]);
console.log(
  `\n=== 引用情况 ===\n   对决引用 ${inBattles} 局 · 收藏 ${inFavs} 条 · 人格类型推荐 ${inTypes} 个 · 历史结果 ${inResults} 条`,
);

// 导出清单（留痕，可回退）
const outDir = join(ROOT, '_证据与痕迹', '曲库体检');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = join(outDir, `album-library-${stamp}.json`);
writeFileSync(
  out,
  JSON.stringify(
    bad.map((b) => ({
      _id: String(b.album._id),
      albumId: b.album.albumId,
      name: b.album.name,
      artistName: b.album.artistName,
      trackCount: b.album.trackCount,
      reason: b.reason,
    })),
    null,
    2,
  ),
);
console.log(`   清单已导出：${out}`);

// ── ③ 修人格推荐（安全动作）──
if (FIX_RECS && badIds.length) {
  const types = await PersonalityType.find({ recommendAlbumIds: { $in: badIds } });
  for (const t of types) {
    const before = (t.recommendAlbumIds || []).length;
    const badIdSet = new Set(badIds.map(String));
    t.recommendAlbumIds = (t.recommendAlbumIds || []).filter((id) => !badIdSet.has(String(id)));
    await t.save();
    console.log(`   · ${t.code} ${t.name}：推荐 ${before} → ${t.recommendAlbumIds.length} 张`);
  }
  if (!types.length) console.log('   · 人格推荐里本来就没有不合格专辑');
}

// ── --fix-flags：把"过期合格"的标记改回不合格 ──
//    这是**最该做、也最安全**的一步：不删任何数据、不动历史战绩，
//    只是让 `isEligible` 这个标记与现行规则一致 —— 之后组池、人格投票、推荐采纳
//    都不会再选中它们。（引用它们的旧对局照常打得开，因为专辑还在库里。）
if (FIX_FLAGS && bad.length) {
  const r = await Album.updateMany(
    { _id: { $in: badIds } },
    { $set: { isEligible: false, excludeReason: RULE_LABELS.TYPE_AND_SIZE } },
  );
  console.log(`\n   --fix-flags：已把 ${r.modifiedCount} 张标记为不合格（未删除任何数据）`);
}

// ── --delete：只删没有任何引用的 ──
if (DELETE) {
  const referenced = new Set();
  const bs = await Battle.find({ albumIds: { $in: badIds } }).select('albumIds').lean();
  bs.forEach((b) => (b.albumIds || []).forEach((id) => referenced.add(String(id))));
  const fs = await Favorite.find({ albumId: { $in: badIds } }).select('albumId').lean();
  fs.forEach((f) => referenced.add(String(f.albumId)));
  const dels = badIds.filter((id) => !referenced.has(String(id)));
  console.log(`\n   --delete：可安全删除 ${dels.length} 张（有引用的 ${badIds.length - dels.length} 张保留）`);
  if (dels.length) {
    const r = await Album.deleteMany({ _id: { $in: dels } });
    console.log(`   已删除 ${r.deletedCount} 张`);
  }
}

await mongoose.disconnect();
console.log('\n✅ 体检完成（默认只读；加 --fix-recs / --fix-flags / --delete 才会改数据）');
