/**
 * 音乐数据服务
 * ------------------------------------------------------------
 * 两级策略：外部获取 + 本地缓存（设计文档 5.8）。
 *   新鲜（≤25 天）读本地；将过期（>25 且 ≤30 天）读本地并后台顺手刷新；
 *   已过期（>30 天）强制重新拉取后再返回。
 * 外部接口不可用时，本地缓存仍可支撑系统运行（外部依赖降级）。
 */
import config from '../../config/index.js';
import { Artist, Album, Track } from '../../models/index.js';
import { NotFoundError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';
import * as itunes from './itunes.client.js';
import { applyAdmission } from './admission.js';

/** 缓存新鲜度判定，前台与后台共用同一套口径 */
export function freshness(cachedAt) {
  if (!cachedAt) return 'expired';
  const days = (Date.now() - new Date(cachedAt).getTime()) / 86400000;
  if (days <= config.cache.staleDays) return 'fresh';
  if (days <= config.cache.freshDays) return 'stale';
  return 'expired';
}

/** 专辑序列化：对齐接口文档 10.1（artistId 为外部数字标识） */
export function serializeAlbum(album) {
  return {
    albumId: album.albumId,
    name: album.name,
    artistId: album.artistExternalId,
    artworkUrl: album.artworkUrl,
    trackCount: album.trackCount,
    releaseDate: album.releaseDate,
    isEligible: album.isEligible,
    excludeReason: album.excludeReason,
  };
}

/** 拉取并落库某歌手的专辑（含七条准入过滤） */
export async function syncArtist(artistExternalId) {
  const id = Number(artistExternalId);
  const { country, albums: rawAlbums } = await itunes.lookupAlbums(id);
  const { excluded, stats } = applyAdmission(rawAlbums, { artistExternalId: id });
  const excludeMap = new Map(excluded.map((item) => [item.album.albumId, item.reason]));
  const now = new Date();

  const artistName = rawAlbums[0]?.artistName || `歌手 ${id}`;
  const artist = await Artist.findOneAndUpdate(
    { artistId: id },
    {
      $set: { name: artistName, region: country, albumCount: rawAlbums.length, cachedAt: now },
      $setOnInsert: { artistId: id },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (rawAlbums.length) {
    await Album.bulkWrite(
      rawAlbums.map((album) => ({
        updateOne: {
          filter: { albumId: album.albumId },
          update: {
            $set: {
              name: album.name,
              artistId: artist._id,
              artistExternalId: album.artistExternalId,
              artworkUrl: album.artworkUrl,
              trackCount: album.trackCount,
              releaseDate: album.releaseDate,
              isEligible: !excludeMap.has(album.albumId),
              excludeReason: excludeMap.get(album.albumId) || null,
              cachedAt: now,
            },
            $setOnInsert: { albumId: album.albumId },
          },
          upsert: true,
        },
      })),
    );
  }

  const albums = await Album.find({ artistExternalId: id }).sort({ releaseDate: 1, albumId: 1 });
  return { artist, albums, stats: { ...stats, region: country } };
}

/** 取歌手专辑池（带缓存策略） */
export async function getArtistAlbums(artistExternalId, { force = false } = {}) {
  const id = Number(artistExternalId);
  const artist = await Artist.findOne({ artistId: id });
  const localCount = await Album.countDocuments({ artistExternalId: id });

  if (force || !artist || localCount === 0 || freshness(artist.cachedAt) === 'expired') {
    return syncArtist(id);
  }

  if (freshness(artist.cachedAt) === 'stale') {
    // 后台顺手刷新，不阻塞本次请求
    syncArtist(id).catch((err) => logger.warn('后台刷新歌手数据失败', { artistId: id, error: err.message }));
  }

  const albums = await Album.find({ artistExternalId: id }).sort({ releaseDate: 1, albumId: 1 });
  return { artist, albums, stats: null };
}

export async function getAlbumByExternalId(albumExternalId) {
  const album = await Album.findOne({ albumId: Number(albumExternalId) });
  if (!album) throw new NotFoundError('专辑');
  return album;
}

/** 按歌手批量拉曲目再归组落库（按专辑查询不展开曲目，故必须如此） */
export async function syncTracks(artistExternalId) {
  const id = Number(artistExternalId);
  const { songs } = await itunes.lookupSongs(id);
  const albumDocs = await Album.find({ artistExternalId: id });
  const albumIdMap = new Map(albumDocs.map((a) => [a.albumId, a._id]));
  const now = new Date();

  const ops = [];
  for (const song of songs) {
    const albumObjectId = albumIdMap.get(song.albumExternalId);
    if (!albumObjectId) continue; // 曲目所属专辑未缓存，跳过
    ops.push({
      updateOne: {
        filter: { trackId: song.trackId },
        update: {
          $set: {
            albumId: albumObjectId,
            albumExternalId: song.albumExternalId,
            artistExternalId: song.artistExternalId,
            name: song.name,
            previewUrl: song.previewUrl,
            duration: song.duration,
            discNumber: song.discNumber,
            trackNumber: song.trackNumber,
            cachedAt: now,
          },
          $setOnInsert: { trackId: song.trackId },
        },
        upsert: true,
      },
    });
  }
  if (ops.length) await Track.bulkWrite(ops);
  return songs.length;
}

export async function getAlbumTracks(albumExternalId, { force = false } = {}) {
  const album = await getAlbumByExternalId(albumExternalId);
  let tracks = await Track.find({ albumExternalId: album.albumId }).sort({ discNumber: 1, trackNumber: 1 });

  if (force || tracks.length === 0 || freshness(album.cachedAt) === 'expired') {
    await syncTracks(album.artistExternalId);
    tracks = await Track.find({ albumExternalId: album.albumId }).sort({ discNumber: 1, trackNumber: 1 });
  }
  return { album, tracks };
}

/** 试听代表曲：优先第 1 首且有试听地址者；无则降级提示（previewUrl 可能为空） */
export async function getAlbumPreview(albumExternalId) {
  const { album, tracks } = await getAlbumTracks(albumExternalId);
  const representative =
    tracks.find((t) => t.trackNumber === 1 && t.previewUrl) || tracks.find((t) => t.previewUrl) || null;
  return {
    album: serializeAlbum(album),
    track: representative
      ? { trackId: representative.trackId, name: representative.name, duration: representative.duration }
      : null,
    previewUrl: representative?.previewUrl || null,
    fallback: !representative,
  };
}

/** 流派列表（用于范围模式选择；iTunes 无流派接口，此处为策展集合） */
export const GENRES = [
  'Pop',
  'Rock',
  'R&B/Soul',
  'Hip-Hop/Rap',
  'Electronic',
  'Jazz',
  'Folk',
  'Alternative',
  'Mandopop',
  'Cantopop',
  'Classical',
  'Soundtrack',
];

export async function searchArtists(term, limit = 10) {
  return itunes.searchArtists(term, limit);
}

export default {
  getArtistAlbums,
  getAlbumByExternalId,
  getAlbumTracks,
  getAlbumPreview,
  searchArtists,
  syncArtist,
  freshness,
  serializeAlbum,
  GENRES,
};
