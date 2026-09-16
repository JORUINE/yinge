/**
 * 用户中心控制器
 */
import * as service from './users.service.js';
import { ok } from '../../shared/response.js';

export async function updateMe(req, res) {
  const user = await service.updateProfile(req.user._id, req.validated.body);
  return ok(res, user.toSafeJSON(), '资料已更新');
}

export async function myStats(req, res) {
  return ok(res, await service.stats(req.user._id));
}
