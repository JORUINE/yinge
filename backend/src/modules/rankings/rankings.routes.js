/**
 * 排行榜路由（公开）
 *   GET /api/rank/albums  专辑榜（按有效票数）  R-01
 *   GET /api/rank/home    首页聚合             R-02
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../shared/http.js';
import * as controller from './rankings.controller.js';

const query = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const router = Router();
router.get('/albums', validate(query, 'query'), asyncHandler(controller.albums));
router.get('/home', asyncHandler(controller.home));

export default router;
