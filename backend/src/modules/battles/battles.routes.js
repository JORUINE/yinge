/**
 * 对决路由（全部需要登录）
 *   POST   /api/battles                        创建对决            B-01
 *   GET    /api/battles/:id                    对决详情            B-02
 *   GET    /api/battles/:id/next-match         下一场              B-03
 *   POST   /api/battles/:id/matches/:matchId/vote  投票            B-04
 *   POST   /api/battles/:id/revival            开启复活赛          B-05
 *   GET    /api/battles/:id/result             结果与夺冠路径      B-06
 *   GET    /api/battles                        我的对决列表        B-07
 *   DELETE /api/battles/:id                    删除对决            B-08
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/http.js';
import { SCOPE_TYPES } from '../../models/index.js';
import * as controller from './battles.controller.js';

const artistEntry = z.object({
  artistId: z.coerce.number().int().positive(),
  albumCount: z.coerce.number().int().min(1).max(50).optional(),
});

const createSchema = z
  .object({
    scopeType: z.enum(SCOPE_TYPES),
    scopeKey: z.string().trim().max(120).optional(),
    // 单歌手模式：artistId 必填，albumCount 可选（限制参赛张数，与服务 resolvePool 共用）
    artistId: z.coerce.number().int().positive().optional(),
    albumCount: z.coerce.number().int().min(1).max(50).optional(),
    artists: z.array(artistEntry).min(2).max(6).optional(),
    alignCount: z.coerce.number().int().min(1).max(20).optional(),
    genre: z.string().trim().max(40).optional(),
    startYear: z.coerce.number().int().min(1900).max(2100).optional(),
    endYear: z.coerce.number().int().min(1900).max(2100).optional(),
    albumIds: z.array(z.coerce.number().int().positive()).optional(),
    withRevival: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.scopeType === 'artist' && !data.artistId) {
      ctx.addIssue({ code: 'custom', path: ['artistId'], message: '单歌手模式必须提供 artistId' });
    }
    if (['multi-artist', 'aligned'].includes(data.scopeType) && (!data.artists || data.artists.length < 2)) {
      ctx.addIssue({ code: 'custom', path: ['artists'], message: '该模式需要 2 位及以上歌手' });
    }
    if (data.scopeType === 'aligned') {
      if (!data.alignCount) ctx.addIssue({ code: 'custom', path: ['alignCount'], message: '对位赛必须提供对位张数' });
      if (data.artists && data.artists.length > 4) {
        ctx.addIssue({ code: 'custom', path: ['artists'], message: '对位赛歌手数限定 2 至 4 位' });
      }
    }
    if (data.scopeType === 'custom' && (!data.albumIds || data.albumIds.length < 4)) {
      ctx.addIssue({ code: 'custom', path: ['albumIds'], message: '手动挑选模式至少 4 张专辑' });
    }
    if (data.scopeType === 'genre' && !data.genre) {
      ctx.addIssue({ code: 'custom', path: ['genre'], message: '请提供流派' });
    }
  });

const idParam = z.object({ id: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的标识') });
const voteParam = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的对决标识'),
  matchId: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的场次标识'),
});
const voteBody = z.object({
  // 按接口文档 5.4：传「外部专辑标识」，数字或数字字符串均可
  albumId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/, '专辑标识必须为数字')]),
});
const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['playing', 'finished']).optional(),
});

const router = Router();
router.use(authenticate);

router.get('/', validate(listQuery, 'query'), asyncHandler(controller.listMine));
router.post('/', validate(createSchema, 'body'), asyncHandler(controller.create));
router.get('/:id', validate(idParam, 'params'), asyncHandler(controller.detail));
router.get('/:id/next-match', validate(idParam, 'params'), asyncHandler(controller.nextMatch));
router.post(
  '/:id/matches/:matchId/vote',
  validate(voteParam, 'params'),
  validate(voteBody, 'body'),
  asyncHandler(controller.vote),
);
router.post('/:id/revival', validate(idParam, 'params'), asyncHandler(controller.revival));
router.get('/:id/result', validate(idParam, 'params'), asyncHandler(controller.result));
router.delete('/:id', validate(idParam, 'params'), asyncHandler(controller.remove));

export default router;
