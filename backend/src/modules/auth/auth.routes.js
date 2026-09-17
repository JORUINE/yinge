/**
 * 认证路由
 *   POST /api/auth/register   注册（公开）
 *   POST /api/auth/login      登录（公开）
 *   GET  /api/auth/me         当前用户（需要登录）
 *   POST /api/auth/logout     退出（需要登录）
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/http.js';
import * as controller from './auth.controller.js';

const registerSchema = z.object({
  account: z
    .string()
    .trim()
    .min(4, '账号至少 4 位')
    .max(20, '账号最多 20 位')
    .regex(/^[a-zA-Z0-9_]+$/, '账号仅支持字母、数字与下划线'),
  password: z.string().min(6, '密码至少 6 位').max(64, '密码最多 64 位'),
  nickname: z.string().trim().min(2, '昵称至少 2 个字').max(16, '昵称最多 16 个字'),
});

const loginSchema = z.object({
  account: z.string().trim().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
});

const router = Router();

router.post('/register', validate(registerSchema, 'body'), asyncHandler(controller.register));
router.post('/login', validate(loginSchema, 'body'), asyncHandler(controller.login));
// 免注册可玩（公开）：领游客身份。放在 /me 之前无所谓，路径不冲突
router.post('/guest', asyncHandler(controller.guest));
router.get('/me', authenticate, asyncHandler(controller.me));
router.post('/logout', authenticate, asyncHandler(controller.logout));

export default router;
