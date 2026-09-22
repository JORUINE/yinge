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

// 流派歌手扩充（M-08 / M-09）：一次最多入库 8 位 —— 每位都要打一次 iTunes 专辑接口
const genreDiscoverSchema = z.object({
  genre: z.string().trim().min(1, '请提供流派'),
  limit: z.coerce.number().int().min(1).max(60).optional(),
});
const genreWarmSchema = z.object({
  genre: z.string().trim().min(1, '请提供流派'),
  artistIds: z.array(z.coerce.number().int().positive()).min(1).max(8, '每批最多 8 位歌手'),
});

const router = Router();

// 注意：/artists/search 与 /artists/photos 必须声明在 /artists/:artistId 之前
router.get('/artists/search', validate(searchSchema, 'query'), asyncHandler(controller.searchArtists));
/** 批量补歌手本人照片（前端拿到搜索结果后再调，避免拖慢搜索） */
router.get('/artists/photos', asyncHandler(controller.artistPhotos));
router.get('/artists/:artistId', validate(artistParamSchema, 'params'), asyncHandler(controller.getArtist));
router.get(
  '/artists/:artistId/albums',
  validate(artistParamSchema, 'params'),
  asyncHandler(controller.listArtistAlbums),
);
// ⚠️ 必须排在 '/albums/:albumId' 之前，否则 'search' 会被当成 albumId
router.get('/albums/search', asyncHandler(controller.searchAlbums));
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
// ⚠️ 必须排在 '/genres' 之后不影响，但要在任何 '/:xxx' 通配之前
router.get(
  '/genres/discover',
  validate(genreDiscoverSchema, 'query'),
  asyncHandler(controller.discoverGenreArtists),
);
router.post(
  '/genres/warm',
  validate(genreWarmSchema, 'body'),
  asyncHandler(controller.warmGenreArtists),
);

// 年代模式专辑池补足（M-10 / #84）：把区间内已知歌手整张碟同步进库，撑大年代池
const eraBackfillSchema = z.object({
  startYear: z.coerce.number().int().min(1900).max(2100).optional(),
  endYear: z.coerce.number().int().min(1900).max(2100).optional(),
  needCount: z.coerce.number().int().min(4).max(32).optional(),
});
router.post(
  '/era/backfill',
  validate(eraBackfillSchema, 'body'),
  asyncHandler(controller.eraBackfill),
);

export default router;
