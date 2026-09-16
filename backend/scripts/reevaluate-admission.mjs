/**
 * 一次性重算专辑准入（A2 的收尾）
 * ------------------------------------------------------------
 * 背景：专辑的 isEligible 是在 syncArtist 时算一次、然后落库的（见 Album.isEligible），
 *       `serializeAlbum` 只是把库里的值读出来。所以 2026-09-16 的"繁简归一"修复
 *       只会对**新抓取**的专辑生效；已缓存的歌手（如陶喆）仍留旧判定，
 *       Soul Power (現場原音專輯) 会继续出现在对决池里。
 *
 * 做法：按 artistExternalId 分组，对**当前 isEligible=true** 的专辑重跑 applyAdmission，
 *       把新判定为不合格的置为 isEligible=false 并写明命中规则。
 *       已剔除的专辑不动（不复活），因此脚本幂等、可反复执行。
 *       注意：Album 表未存 isAlbumType，故规则 1 的"类型"部分无法复核，
 *             仅复核曲目数——这正是本脚本只处理"当前合格"专辑的原因。
 *
 * 用法：
 *   cd backend && node scripts/reevaluate-admission.mjs --dry   # 只看会剔除哪些，不写库
 *   cd backend && node scripts/reevaluate-admission.mjs         # 真正写库
 */
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { Album } from '../src/models/index.js';
import { applyAdmission } from '../src/modules/music/admission.js';
import { logger } from '../src/shared/logger.js';

const DRY = process.argv.includes('--dry');

async function main() {
  await connectDb();

  const groups = await Album.aggregate([
    { $match: { isEligible: true } },
    { $group: { _id: '$artistExternalId', ids: { $push: '$_id' } } },
    { $sort: { _id: 1 } },
  ]);

  let scanned = 0;
  let changed = 0;
  const byRule = {};
  const samples = [];

  for (const g of groups) {
    const list = await Album.find({ _id: { $in: g.ids } }).lean();
    scanned += list.length;
    const { excluded } = applyAdmission(list, { artistExternalId: g._id });
    for (const item of excluded) {
      byRule[item.reason] = (byRule[item.reason] || 0) + 1;
      changed += 1;
      if (samples.length < 30) samples.push(`${item.reason} ｜ ${item.album.name}`);
      if (!DRY) {
        await Album.updateOne(
          { _id: item.album._id },
          { $set: { isEligible: false, excludeReason: item.reason } },
        );
      }
    }
  }

  logger.info(`[重算准入] 扫描"当前合格"专辑 ${scanned} 张，本轮新剔除 ${changed} 张${DRY ? '（dry-run，未写库）' : ''}`);
  for (const [reason, n] of Object.entries(byRule)) logger.info(`  · ${reason}：${n} 张`);
  if (samples.length) {
    logger.info('  样例：');
    for (const s of samples) logger.info(`    - ${s}`);
  }
  if (!DRY) {
    logger.info('  回滚：把上述专辑 isEligible 置回 true、excludeReason 置 null 即可（本次仅剔除本应排除的现场/精选等专辑）。');
  }

  await disconnectDb();
}

main().catch(async (err) => {
  logger.error(err);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
