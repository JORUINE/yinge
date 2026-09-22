/**
 * 年代模式专辑池自动补足（2026-09-23 / #84）
 * ------------------------------------------------------------
 * 问题：年代模式按「本地曲库里 releaseDate 落在年份区间的合格专辑」建池，
 *   而本地曲库在某个区间里往往只有十几张 → 用户选 32 张参战也只能给十几张，
 *   「选几张参战」看起来无效（根因是数据不够，不是代码）。
 * 做法：建池前若区间内合格专辑 < 需要张数，就把「区间内（含 ±3 年边界）的已知歌手」
 *   当种子，重新 syncArtist 拉整张碟（syncArtist 会写回 releaseDate / isEligible），
 *   把他们的年代专辑挖出来，再重查区间。失败容忍、可关。
 *
 * ⚠️ iTunes Search API 没有「按年份筛选」参数，所以这里**不靠搜年份**，
 *   而是复用「已知歌手的完整唱片」—— 这些歌手已经证明属于该年代（本地有他们的年代专辑），
 *   拉全碟后按 releaseDate 自然落在区间里的就多了。
 */
import { Album } from '../../models/index.js';
import { logger } from '../../shared/logger.js';
import * as musicService from './music.service.js';

const ERA_SEED_MAX = 24; // 最多重同步多少位歌手（每位打 1 次 iTunes 专辑接口）
const ERA_SEED_CONCURRENCY = 4; // 并发度（iTunes 密集请求会限流，-462 教训）

function eraFilter(startYear, endYear) {
  const filter = { isEligible: true };
  if (startYear || endYear) {
    filter.releaseDate = {};
    if (startYear) filter.releaseDate.$gte = new Date(`${startYear}-01-01`);
    if (endYear) filter.releaseDate.$lte = new Date(`${endYear}-12-31`);
  }
  return filter;
}

/**
 * 确保年代区间内有足够合格专辑。
 * @param {number} [startYear]
 * @param {number} [endYear]
 * @param {number} [needCount=32] 需要凑到的张数（通常传 era 分支算好的 cap）
 * @returns {Promise<{before:number, after:number, seeded:number, synced:number, triggered:boolean, disabled?:boolean}>}
 */
export async function ensureEraPool(startYear, endYear, needCount = 32) {
  const filter = eraFilter(startYear, endYear);
  const before = await Album.countDocuments(filter);
  if (before >= needCount) {
    return { before, after: before, seeded: 0, synced: 0, triggered: false };
  }
  if (process.env.ENABLE_ERA_BACKFILL === 'off') {
    return { before, after: before, seeded: 0, synced: 0, triggered: false, disabled: true };
  }

  // 种子歌手：区间放宽 ±3 年内合格专辑最多的前 ERA_SEED_MAX 位（已证明属于该年代）
  const loYear = Math.max(1900, (Number(startYear) || 1900) - 3);
  const hiYear = (Number(endYear) || 2100) + 3;
  const seeds = await Album.aggregate([
    {
      $match: {
        isEligible: true,
        releaseDate: { $gte: new Date(`${loYear}-01-01`), $lte: new Date(`${hiYear}-12-31`) },
      },
    },
    { $group: { _id: '$artistExternalId', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: ERA_SEED_MAX },
  ]);
  const seedIds = seeds.map((s) => s._id).filter((x) => x);

  let synced = 0;
  const queue = [...seedIds];
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      try {
        // eslint-disable-next-line no-await-in-loop
        await musicService.syncArtist(id);
        synced += 1;
      } catch (e) {
        logger.warn('era 补足：歌手同步失败（已跳过，不阻塞建池）', {
          artistId: id,
          error: e?.message,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: ERA_SEED_CONCURRENCY }, () => worker()));

  const after = await Album.countDocuments(filter);
  logger.info('era 补足完成', {
    startYear,
    endYear,
    needCount,
    before,
    after,
    seeded: seedIds.length,
    synced,
  });
  return { before, after, seeded: seedIds.length, synced, triggered: true };
}

export default { ensureEraPool };
