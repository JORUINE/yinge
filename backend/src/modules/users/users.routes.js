/**
 * 用户中心路由（均需登录）
 *   PUT /api/users/me        修改资料   A-05
 *   GET /api/users/me/stats  个人统计   A-06
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/http.js';
import * as controller from './users.controller.js';

const updateSchema = z.object({
  nickname: z.string().trim().min(2, '昵称至少 2 个字').max(16, '昵称最多 16 个字').optional(),
});

// A-07：游客数据迁移。guestId 为本机游客账号的标识（来自 localStorage）
const claimSchema = z.object({
  guestId: z.string().trim().min(1).optional(),
});

const router = Router();
router.use(authenticate);

router.put('/me', validate(updateSchema, 'body'), asyncHandler(controller.updateMe));
router.get('/me/stats', asyncHandler(controller.myStats));
router.post('/me/claim-guest', validate(claimSchema, 'body'), asyncHandler(controller.claimGuest));

export default router;
