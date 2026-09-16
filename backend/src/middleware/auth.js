/**
 * 鉴权中间件
 * ------------------------------------------------------------
 * 关键设计（设计文档第七章）：令牌校验通过后必须再查一次账号状态。
 * 否则被禁用账号持有效令牌仍能继续使用，与前台"账号已被禁用"提醒脱节。
 */
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { User } from '../models/index.js';
import { UnauthorizedError, ForbiddenError, AccountBannedError } from '../shared/errors.js';

function extractToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

export async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw new UnauthorizedError();

    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch {
      throw new UnauthorizedError('登录已过期，请重新登录');
    }

    const user = await User.findById(payload.sub);
    if (!user) throw new UnauthorizedError('账号不存在或已注销');

    // 二次校验账号状态，禁用账号立即失效
    if (user.status === 'banned') {
      throw new AccountBannedError({ reason: user.bannedReason, note: user.bannedNote });
    }

    req.user = user;
    req.auth = { userId: String(user._id), role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

/** 尝试解析登录态但不强制：公开接口需要区分"登录/未登录"时使用 */
export async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(payload.sub);
    if (user && user.status !== 'banned') {
      req.user = user;
      req.auth = { userId: String(user._id), role: user.role };
    }
  } catch {
    /* 公开接口忽略无效令牌 */
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return next(new UnauthorizedError());
  if (req.user.role !== 'admin') return next(new ForbiddenError('需要管理员权限'));
  return next();
}

export default { authenticate, optionalAuth, requireAdmin };
