/**
 * 排行榜控制器
 */
import * as service from './rankings.service.js';
import { ok } from '../../shared/response.js';

export async function albums(req, res) {
  const { limit, page, pageSize } = req.validated.query;
  const size = Math.min(100, limit ?? pageSize ?? 20);
  const skip = ((page ?? 1) - 1) * size;
  return ok(res, { list: await service.albumsRank({ limit: size, skip }) });
}

export async function home(req, res) {
  return ok(res, await service.home());
}
