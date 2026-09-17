/**
 * 认证控制器（只做请求解析与响应封装，不含业务规则）
 */
import * as authService from './auth.service.js';
import { ok } from '../../shared/response.js';

export async function register(req, res) {
  const payload = req.validated.body;
  const result = await authService.register(payload);
  return ok(res, result, '注册成功');
}

export async function login(req, res) {
  const payload = req.validated.body;
  const result = await authService.login(payload);
  return ok(res, result, '登录成功');
}

/** 免注册可玩：无登录态时前端自动来领一个游客身份 */
export async function guest(req, res) {
  const result = await authService.createGuest();
  return ok(res, result, '游客身份已创建');
}

export async function me(req, res) {
  return ok(res, req.user.toSafeJSON());
}

export async function logout(req, res) {
  // 令牌为无状态 JWT，退出由前端清除本地存储完成；此接口用于统一流程与埋点
  return ok(res, null, '已退出登录');
}
