/**
 * 认证服务
 * 对应接口：A-01 注册 / A-02 登录 / A-03 当前用户 / A-04 退出
 */
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import config from '../../config/index.js';
import { User } from '../../models/index.js';
import { BadRequestError, DuplicateError, AccountBannedError, UnauthorizedError } from '../../shared/errors.js';

export function issueToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiresIn,
  });
}

export async function register({ account, password, nickname }) {
  const accountKey = account.toLowerCase();
  if (await User.exists({ account: accountKey })) {
    throw new DuplicateError('该账号已被注册');
  }
  if (await User.exists({ nickname })) {
    throw new DuplicateError('该昵称已被使用');
  }

  const user = new User({ account: accountKey, nickname });
  await user.setPassword(password);
  await user.save();

  return { token: issueToken(user), user: user.toSafeJSON() };
}

export async function login({ account, password }) {
  const user = await User.findOne({ account: account.toLowerCase() });
  if (!user) throw new BadRequestError('账号或密码错误');

  const matched = await user.verifyPassword(password);
  if (!matched) throw new BadRequestError('账号或密码错误');

  // 禁用账号即使密码正确也不放行，直接抛出带原因的 2003
  if (user.status === 'banned') {
    throw new AccountBannedError({ reason: user.bannedReason, note: user.bannedNote });
  }

  user.lastLoginAt = new Date();
  await user.save();

  return { token: issueToken(user), user: user.toSafeJSON() };
}

export async function getById(userId) {
  const user = await User.findById(userId);
  if (!user) throw new UnauthorizedError('账号不存在或已注销');
  return user;
}

/**
 * 游客身份（免注册可玩 —— 需求文档写明「不注册也能玩对决」）
 * ------------------------------------------------------------
 * 做法：发一个真实的「游客账号」（role=guest，随机账号密码）+ 正式 JWT。
 * 好处：对决归属、每人一票、限流、防刷<b>全部复用现有逻辑</b>，没有任何特殊分支。
 * 边界：游客数据绑定本机浏览器（localStorage 的 token），清缓存/换设备会丢；
 *       收藏仍要求正式注册（前端 FavoriteButton 拦 role=guest）。
 */
export async function createGuest() {
  const suffix = randomBytes(4).toString('hex');
  const user = new User({
    account: `guest_${Date.now().toString(36)}${suffix}`,
    nickname: `游客${suffix.toUpperCase()}`,
    role: 'guest',
  });
  await user.setPassword(randomBytes(24).toString('hex'));
  await user.save();
  return { token: issueToken(user), user: user.toSafeJSON() };
}
