/**
 * 后台管理路由
 *   POST /api/admin/login                     管理员登录（公开）  D-01
 *   GET  /api/admin/dashboard                 仪表盘              D-02
 *   GET/POST /api/admin/questions             题目列表/新建       D-03/04
 *   PUT/DELETE /api/admin/questions/:id        题目更新/删除      D-05/06
 *   GET/POST /api/admin/types                 类型列表/新建       D-07/08
 *   PUT/DELETE /api/admin/types/:id            类型更新/删除      D-09/10
 *   GET  /api/admin/music                     音乐缓存列表        D-11
 *   POST /api/admin/music/refresh             触发刷新            D-12
 *   GET  /api/admin/users                     用户列表            D-13
 *   PUT  /api/admin/users/:id/status          变更用户状态        D-14
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/http.js';
import { BANNED_REASONS } from '../../models/User.js';
import * as controller from './admin.controller.js';

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的标识');
const idParam = z.object({ id: objectId });

const loginSchema = z.object({
  account: z.string().trim().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
});

const optionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  score: z.record(z.number()),
});
const questionSchema = z.object({
  order: z.coerce.number().int().min(1),
  type: z.enum(['choice', 'audio']).default('choice'),
  title: z.string().trim().min(1, '题干不能为空'),
  audioRef: z.string().optional().nullable(),
  dims: z.array(z.string().min(1)).min(1),
  options: z.array(optionSchema).min(2, '至少两个选项'),
});
const questionUpdateSchema = questionSchema.partial();

const typeSchema = z.object({
  code: z.string().trim().min(1, '类型码不能为空'),
  name: z.string().trim().min(1, '类型名不能为空'),
  description: z.string().min(1, '描述不能为空'),
  dims: z.record(z.number()),
  recommendAlbumIds: z.array(objectId).optional(),
});
const typeUpdateSchema = typeSchema.partial();

const userStatusSchema = z.object({
  status: z.enum(['active', 'banned']),
  bannedReason: z.enum([...BANNED_REASONS, '']).optional().nullable(),
  bannedNote: z.string().max(200).optional().nullable(),
});

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  keyword: z.string().trim().max(60).optional(),
  status: z.enum(['active', 'banned']).optional(),
});

const router = Router();

// 公开：管理员登录
router.post('/login', validate(loginSchema, 'body'), asyncHandler(controller.login));

// 以下全部需要管理员身份
router.use(authenticate, requireAdmin);

router.get('/dashboard', asyncHandler(controller.dashboard));

router.get('/questions', asyncHandler(controller.listQuestions));
router.post('/questions', validate(questionSchema, 'body'), asyncHandler(controller.createQuestion));
router.put(
  '/questions/:id',
  validate(idParam, 'params'),
  validate(questionUpdateSchema, 'body'),
  asyncHandler(controller.updateQuestion),
);
router.delete('/questions/:id', validate(idParam, 'params'), asyncHandler(controller.deleteQuestion));

router.get('/types', asyncHandler(controller.listTypes));
router.post('/types', validate(typeSchema, 'body'), asyncHandler(controller.createType));
router.put('/types/:id', validate(idParam, 'params'), validate(typeUpdateSchema, 'body'), asyncHandler(controller.updateType));
router.delete('/types/:id', validate(idParam, 'params'), asyncHandler(controller.deleteType));

router.get('/music', validate(pageQuery, 'query'), asyncHandler(controller.listMusic));
router.post(
  '/music/refresh',
  validate(z.object({ artistId: z.coerce.number().int().positive() }), 'body'),
  asyncHandler(controller.refreshMusic),
);

router.get('/users', validate(pageQuery, 'query'), asyncHandler(controller.listUsers));
router.put(
  '/users/:id/status',
  validate(idParam, 'params'),
  validate(userStatusSchema, 'body'),
  asyncHandler(controller.updateUserStatus),
);

export default router;
