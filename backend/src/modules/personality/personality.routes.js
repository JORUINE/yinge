/**
 * 人格测评路由
 *   GET  /api/personality/questions      获取题目（公开）      P-01
 *   POST /api/personality/submit         提交作答（需登录）    P-02
 *   GET  /api/personality/results/:id    结果详情（需登录）    P-03
 *   GET  /api/personality/results        我的测评（需登录）    P-04
 *   GET  /api/personality/types          类型图鉴（公开）      P-05
 *   GET  /api/personality/types/:code    类型详情（公开）      P-06
 *   GET  /api/personality/stats          类型占比（公开）      P-07
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/http.js';
import * as controller from './personality.controller.js';

const submitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的题目标识'),
        optionKey: z.string().min(1, '选项不能为空'),
      }),
    )
    .min(1, '请至少作答一题'),
});

const idParam = z.object({ id: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的标识') });
const codeParam = z.object({ code: z.string().trim().min(1) });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const router = Router();

/* —— 专辑归类投票（需登录：一人一张一票，可改投） —— */
const tagSchema = z.object({
  albumId: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的专辑标识'),
  typeCode: z.string().trim().min(1, '请选择一个类型'),
});
router.get('/album-tags/next', authenticate, asyncHandler(controller.nextTagAlbum));
router.post('/album-tags', authenticate, validate(tagSchema, 'body'), asyncHandler(controller.voteTag));
/** 聚合统计（后台采纳用；公开只读，不涉及个人信息） */
router.get('/album-tags/stats', asyncHandler(controller.tagStats));

router.get('/questions', asyncHandler(controller.questions));
router.get('/types', asyncHandler(controller.types));
router.get('/types/:code', validate(codeParam, 'params'), asyncHandler(controller.typeDetail));
router.get('/stats', asyncHandler(controller.stats));

router.post('/submit', authenticate, validate(submitSchema, 'body'), asyncHandler(controller.submit));
router.get('/results', authenticate, validate(listQuery, 'query'), asyncHandler(controller.listMine));
router.get('/results/:id', authenticate, validate(idParam, 'params'), asyncHandler(controller.result));

export default router;
