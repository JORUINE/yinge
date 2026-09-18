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

/** A-07 游客数据迁移：把本机游客账号的对决 / 票 / 测评 / 收藏转到当前正式账号 */
export async function claimGuest(req, res) {
  if (req.user.role === 'guest') {
    return ok(res, { migrated: false, reason: '游客身份不能发起迁移，请先注册或登录' });
  }
  const result = await service.claimGuestData(req.user._id, req.validated.body.guestId);
  return ok(res, result, result.migrated ? '游客数据已迁移到你的账号' : result.reason);
}
