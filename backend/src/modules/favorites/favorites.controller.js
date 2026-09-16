/**
 * 收藏与分享控制器
 */
import * as service from './favorites.service.js';
import { ok, paginated } from '../../shared/response.js';

export async function add(req, res) {
  const result = await service.addFavorite(req.user._id, req.validated.body);
  return ok(res, result, '收藏成功');
}

export async function remove(req, res) {
  const { targetId } = req.validated.params;
  await service.removeFavorite(req.user._id, targetId);
  return ok(res, null, '已取消收藏');
}

export async function list(req, res) {
  const { list: items, page, pageSize, total } = await service.listFavorites(req.user._id, req.validated.query);
  return ok(res, paginated(items, total, page, pageSize));
}

export async function addShareCard(req, res) {
  const result = await service.addShareCard(req.user._id, req.validated.body);
  return ok(res, result, '分享图已记录');
}

export async function listShareCards(req, res) {
  const { list: items, page, pageSize, total } = await service.listShareCards(req.user._id, req.validated.query);
  return ok(res, paginated(items, total, page, pageSize));
}
