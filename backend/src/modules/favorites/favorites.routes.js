/**
 * 收藏与分享路由（均需登录）
 *   POST   /api/favorites             新增收藏   U-01
 *   DELETE /api/favorites/:targetId   取消收藏   U-02
 *   GET    /api/favorites             收藏列表   U-03
 *   POST   /api/share-cards           记录分享图 U-04
 *   GET    /api/share-cards           分享记录   U-05
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/http.js';
import * as controller from './favorites.controller.js';

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, '无效的标识');

const addSchema = z.object({ targetType: z.enum(['album', 'personality_type']), targetId: objectId });
const targetParam = z.object({ targetId: objectId });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  targetType: z.enum(['album', 'personality_type']).optional(),
});

const shareSchema = z.object({
  type: z.enum(['bracket', 'champion', 'personality']),
  refId: objectId,
  imageUrl: z.string().url('图片地址不合法'),
});
const shareListQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  type: z.enum(['bracket', 'champion', 'personality']).optional(),
});

export const favoriteRouter = Router();
favoriteRouter.use(authenticate);
favoriteRouter.post('/', validate(addSchema, 'body'), asyncHandler(controller.add));
favoriteRouter.get('/', validate(listQuery, 'query'), asyncHandler(controller.list));
favoriteRouter.delete('/:targetId', validate(targetParam, 'params'), asyncHandler(controller.remove));

export const shareCardRouter = Router();
shareCardRouter.use(authenticate);
shareCardRouter.post('/', validate(shareSchema, 'body'), asyncHandler(controller.addShareCard));
shareCardRouter.get('/', validate(shareListQuery, 'query'), asyncHandler(controller.listShareCards));

export default favoriteRouter;
