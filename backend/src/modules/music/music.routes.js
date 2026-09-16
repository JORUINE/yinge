/**
 * 音乐数据路由
 *   GET /api/music/artists/search         歌手搜索（公开）  M-01
 *   GET /api/music/artists/:artistId      歌手详情（公开）  M-02
 *   GET /api/music/artists/:artistId/albums 歌手专辑池+准入过滤（公开）M-03
 *   GET /api/music/albums/:albumId        专辑详情（公开）  M-04
 *   GET /api/music/albums/:albumId/tracks 专辑曲目（公开）  M-05
 *   GET /api/music/albums/:albumId/preview 试听代表曲（公开）M-06
 *   GET /api/music/genres                 流派列表（公开）  M-07
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../shared/http.js';
import * as controller from './music.controller.js';

const numericId = z.coerce.number().int().positive('标识必须为正整数');

const searchSchema = z.object({
  term: z.string().trim().min(1, '请输入歌手名'),
  limit: z.coerce.number().int().min(1).max(25).optional(),
});

const artistParamSchema = z.object({ artistId: numericId });
const albumParamSchema = z.object({ albumId: numericId });

const router = Router();

// 注意：/artists/search 必须声明在 /artists/:artistId 之前
router.get('/artists/search', validate(searchSchema, 'query'), asyncHandler(controller.searchArtists));
router.get('/artists/:artistId', validate(artistParamSchema, 'params'), asyncHandler(controller.getArtist));
router.get(
  '/artists/:artistId/albums',
  validate(artistParamSchema, 'params'),
  asyncHandler(controller.listArtistAlbums),
);
router.get('/albums/:albumId', validate(albumParamSchema, 'params'), asyncHandler(controller.getAlbum));
router.get(
  '/albums/:albumId/tracks',
  validate(albumParamSchema, 'params'),
  asyncHandler(controller.listAlbumTracks),
);
router.get(
  '/albums/:albumId/preview',
  validate(albumParamSchema, 'params'),
  asyncHandler(controller.getAlbumPreview),
);
router.get('/genres', asyncHandler(controller.listGenres));

export default router;
