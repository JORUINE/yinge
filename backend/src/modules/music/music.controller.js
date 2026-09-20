/**
 * 音乐数据控制器
 * 对应接口：M-01 ~ M-09
 */
import * as musicService from './music.service.js';
import * as genreExpand from './genreExpand.js';
import { ok } from '../../shared/response.js';

export async function searchArtists(req, res) {
  const { term, limit } = req.validated.query;
  const result = await musicService.searchArtists(term, limit ?? 10);
  return ok(res, result);
}

/** 批量歌手照片：?ids=1,2,3（最多 12 位） */
export async function artistPhotos(req, res) {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter(Boolean);
  return ok(res, { photos: await musicService.artistPhotos(ids) });
}

/** 本地曲库搜专辑（后台给「人格类型」绑推荐专辑用） */
export async function searchAlbums(req, res) {
  const term = String(req.query.term || '');
  const limit = Number(req.query.limit) || 12;
  return ok(res, { list: await musicService.searchAlbums({ term, limit }) });
}

export async function getArtist(req, res) {
  const { artistId } = req.validated.params;
  const { artist } = await musicService.getArtistAlbums(artistId);
  return ok(res, {
    artistId: artist.artistId,
    name: artist.name,
    genre: artist.genre,
    region: artist.region,
    albumCount: artist.albumCount,
  });
}

export async function listArtistAlbums(req, res) {
  const { artistId } = req.validated.params;
  const force = req.query.refresh === '1' || req.query.refresh === 'true';
  const { artist, albums, stats } = await musicService.getArtistAlbums(artistId, { force });

  // 参赛池预览需展示"共检索到 X 张，剔除 Y 张，实际参赛 Z 张"与逐张剔除原因
  const list = albums.map(musicService.serializeAlbum);
  const eligible = list.filter((a) => a.isEligible);
  const excludedList = list
    .filter((a) => !a.isEligible)
    .map((a) => ({ albumId: a.albumId, name: a.name, artworkUrl: a.artworkUrl, reason: a.excludeReason }));

  return ok(res, {
    artist: { artistId: artist.artistId, name: artist.name, region: artist.region },
    list,
    eligible,
    excluded: excludedList,
    stats: {
      total: list.length,
      excluded: excludedList.length,
      valid: eligible.length,
      byRule: stats?.byRule || null,
      region: stats?.region || artist.region,
      cachedAt: artist.cachedAt,
    },
  });
}

export async function getAlbum(req, res) {
  const { albumId } = req.validated.params;
  const album = await musicService.getAlbumByExternalId(albumId);
  return ok(res, musicService.serializeAlbum(album));
}

export async function listAlbumTracks(req, res) {
  const { albumId } = req.validated.params;
  const force = req.query.refresh === '1' || req.query.refresh === 'true';
  const { album, tracks } = await musicService.getAlbumTracks(albumId, { force });
  return ok(res, {
    album: musicService.serializeAlbum(album),
    list: tracks.map((t) => ({
      trackId: t.trackId,
      name: t.name,
      previewUrl: t.previewUrl,
      duration: t.duration,
      discNumber: t.discNumber,
      trackNumber: t.trackNumber,
    })),
  });
}

export async function getAlbumPreview(req, res) {
  const { albumId } = req.validated.params;
  const result = await musicService.getAlbumPreview(albumId);
  return ok(res, result);
}

export async function listGenres(req, res) {
  // 数据源 = 曲库里实际存在的流派（含歌手数），不是写死的列表
  return ok(res, { list: await musicService.listGenres() });
}

/**
 * M-08 按流派发现歌手（只读，不写库）
 * 用于解决"库里某流派只有几位歌手，撑不起混战"的问题。
 */
export async function discoverGenreArtists(req, res) {
  const { genre } = req.validated.query;
  const { limit } = req.validated.query;
  const data = await genreExpand.discoverGenreArtists(genre, { limit: limit || 30 });
  return ok(res, data);
}

/**
 * M-09 把发现的歌手同步进曲库（前端分批调用，每批最多 8 位）
 */
export async function warmGenreArtists(req, res) {
  const { genre, artistIds } = req.validated.body;
  const data = await genreExpand.warmGenreArtists(genre, artistIds);
  return ok(res, data, `已入库 ${data.saved} 位歌手`);
}
