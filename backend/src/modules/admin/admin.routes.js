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
  /**
   * 2026-09-25：**必须允许缺失/空**。
   * ⚠️ 写法陷阱：`questionUpdateSchema = questionSchema.partial()` 只让**顶层**字段可选，
   * 嵌套在 options 里的 score 依旧必填 —— 于是"修改一道题再保存"必然报 `options.N.score Required`
   * （旧题里"说不上来"这种中立选项本来就没有分数）。
   * 这里放宽成"可选 + 允许 null"，真正的清洗交给 service 的 cleanOptions()。
   */
  score: z.record(z.union([z.number(), z.null()])).optional().default({}),
});
const questionSchema = z.object({
  order: z.coerce.number().int().min(1),
  type: z.enum(['choice', 'audio']).default('choice'),
  title: z.string().trim().min(1, '题干不能为空'),
  audioRef: z.string().optional().nullable(),
  /** 主维度（2026-09-22）：抽题按此配平，保证每次抽的题在 6 个维度上数量固定 */
  primary: z.enum(['melody', 'rhythm', 'lyric', 'texture', 'novelty', 'calm']).optional().nullable(),
  dims: z.array(z.string().min(1)).min(1),
  options: z.array(optionSchema).min(2, '至少两个选项'),
});
const questionUpdateSchema = questionSchema.partial();

const typeSchema = z.object({
  code: z.string().trim().min(1, '类型码不能为空'),
  name: z.string().trim().min(1, '类型名不能为空'),
  description: z.string().min(1, '描述不能为空'),
  dims: z.record(z.number()),
  /** 2026-09-22 新增：文献依据 / 听众画像 / 推荐专辑的挑选原则（答辩要讲得出来源） */
  theory: z.string().optional().nullable(),
  listeningProfile: z.string().optional().nullable(),
  albumHints: z.array(z.string()).optional(),
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

const genreArtistSchema = z.object({
  genre: z.string().trim().min(1, '请提供流派'),
  q: z.string().trim().min(1, '请输入歌手名').max(80),
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

/**
 * 按流派手动加歌手（2026-09-24 第十七批）：搜音乐源 → 专辑入库 → 记录流派归属
 */
router.post(
  '/genre-artists',
  validate(genreArtistSchema, 'body'),
  asyncHandler(controller.addGenreArtist),
);
router.get(
  '/genre-artists',
  validate(z.object({ genre: z.string().trim().min(1) }), 'query'),
  asyncHandler(controller.listGenreArtists),
);

router.get('/users', validate(pageQuery, 'query'), asyncHandler(controller.listUsers));
router.put(
  '/users/:id/status',
  validate(idParam, 'params'),
  validate(userStatusSchema, 'body'),
  asyncHandler(controller.updateUserStatus),
);

export default router;
