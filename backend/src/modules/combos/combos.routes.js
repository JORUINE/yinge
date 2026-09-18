/**
 * 歌手组合路由（均需登录）
 *   GET    /api/combos       我能看到的组合（系统组合 + 我建的）   C-01
 *   POST   /api/combos       新建组合（管理员带 isSystem=true 即建系统组合）  C-02
 *   PUT    /api/combos/:id   改名 / 改规模（仅本人或管理员改系统组合）        C-03
 *   DELETE /api/combos/:id   删除（同上）                                   C-04
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/http.js';
import * as controller from './combos.controller.js';

const artistEntry = z.object({
  artistId: z.coerce.number().int().positive(),
  name: z.string().trim().max(80).optional(),
  albumCount: z.coerce.number().int().min(1).max(50).optional(),
});

const createSchema = z.object({
  label: z.string().trim().min(1, '组合名不能为空').max(40, '组合名最多 40 字'),
  scopeType: z.enum(['multi-artist', 'aligned']).optional(),
  artists: z.array(artistEntry).min(2, '至少要 2 位歌手').max(6, '最多 6 位歌手'),
  perArtist: z.coerce.number().int().min(4).max(50).optional(),
  alignCount: z.coerce.number().int().min(1).max(20).optional(),
  isSystem: z.boolean().optional(),
});

const updateSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  perArtist: z.coerce.number().int().min(4).max(50).optional(),
});

const idParam = z.object({ id: z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的标识') });

const popularQuery = z.object({
  limit: z.coerce.number().int().min(1).max(60).optional(),
});

const router = Router();
router.use(authenticate);

// 必须排在 '/:id' 之前
router.get('/popular', validate(popularQuery, 'query'), asyncHandler(controller.popular));
router.get('/', asyncHandler(controller.list));
router.post('/', validate(createSchema, 'body'), asyncHandler(controller.create));
router.put('/:id', validate(idParam, 'params'), validate(updateSchema, 'body'), asyncHandler(controller.update));
router.delete('/:id', validate(idParam, 'params'), asyncHandler(controller.remove));

export default router;
