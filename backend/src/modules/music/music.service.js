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
    /**
     * 本地 ObjectId 字符串。
     * 收藏接口（POST /favorites）要的是这个本地 id，而前端只能拿到外部 albumId，
     * 所以必须一并吐出去，否则「收藏」根本没法接（2026-09-18 补）。
     */
    id: String(album._id),
    albumId: album.albumId,
    name: album.name,
    artistId: album.artistExternalId,
    artistName: album.artistName || '',
    artworkUrl: album.artworkUrl,
    trackCount: album.trackCount,
    releaseDate: album.releaseDate,
    isEligible: album.isEligible,
    excludeReason: album.excludeReason,
    genre: album.genre || null,
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
  // ⚠️ 流派必须落库：之前 $set 里从来没写 genre，Artist.genre 永远是 null，
  //    导致「按流派建对决」100% 查不到歌手（2026-09-18 修复）。流派取 iTunes 的 primaryGenreName。
  const artistGenre = rawAlbums.find((a) => a.genre)?.genre || null;
  const artist = await Artist.findOneAndUpdate(
    { artistId: id },
    {
      $set: {
        name: artistName,
        region: country,
        albumCount: rawAlbums.length,
        cachedAt: now,
        ...(artistGenre ? { genre: artistGenre } : {}),
      },
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
              artistName: album.artistName || artistName,
              artistId: artist._id,
              artistExternalId: album.artistExternalId,
              artworkUrl: album.artworkUrl,
              trackCount: album.trackCount,
              releaseDate: album.releaseDate,
              isEligible: !excludeMap.has(album.albumId),
              excludeReason: excludeMap.get(album.albumId) || null,
              genre: album.genre || null,
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

/** 按歌手批量拉曲目再归组落库（仅作批量预缓存；上限 200 首，多专辑歌手会漏，正式试听走逐专辑） */
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

/** 逐专辑拉曲目并落库（hk 区可展开完整列表，不受 200 上限截断影响） */
export async function syncAlbumTracks(albumExternalId, artistExternalId) {
  const id = Number(albumExternalId);
  const { songs } = await itunes.lookupAlbumSongs(id);
  if (!songs.length) return 0;
  const albumDoc = await Album.findOne({ albumId: id });
  const albumObjectId = albumDoc?._id;
  const now = new Date();
  const ops = songs.map((song) => ({
    updateOne: {
      filter: { trackId: song.trackId },
      update: {
        $set: {
          albumId: albumObjectId,
          albumExternalId: song.albumExternalId,
          artistExternalId: Number(artistExternalId),
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
  }));
  await Track.bulkWrite(ops);
  return songs.length;
}

/** 进程内去重：同一专辑已尝试过逐专辑同步就不再重拉（避免曲目数天生少于 trackCount 时反复请求） */
const TRACK_SYNC_TRIED = new Set();

export async function getAlbumTracks(albumExternalId, { force = false } = {}) {
  const album = await getAlbumByExternalId(albumExternalId);
  let tracks = await Track.find({ albumExternalId: album.albumId }).sort({ discNumber: 1, trackNumber: 1 });

  const expect = Number(album.trackCount || 0);
  // 已缓存但条数少于专辑应有数 → 很可能是旧的「按歌手拉歌被 200 上限截断」留下的残缺缓存，补一次逐专辑同步
  const short = expect > 0 && tracks.length < expect;
  const needSync =
    force || tracks.length === 0 || freshness(album.cachedAt) === 'expired' || (short && !TRACK_SYNC_TRIED.has(album.albumId));

  if (needSync) {
    TRACK_SYNC_TRIED.add(album.albumId);
    try {
      // 逐专辑同步：拿该专辑完整曲目列表（不受歌手 200 首上限截断）
      await syncAlbumTracks(album.albumId, album.artistExternalId);
    } catch (err) {
      logger.warn('逐专辑曲目同步失败，沿用本地缓存', { albumId: album.albumId, error: err.message });
    }
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
/**
 * 曲库里实际存在的流派（来自已缓存歌手的 iTunes 流派标签），带歌手数。
 * ⚠️ 流派选择器的数据源必须是它，而不是写死的英文列表 —— hk 区返回的是
 *    「國語流行樂 / 流行樂 / 舞曲」这类繁体标签，写死 Pop/Rock 永远匹配不上（已踩坑）。
 */
export async function listGenres() {
  const rows = await Artist.aggregate([
    { $match: { genre: { $type: 'string' } } },
    { $group: { _id: '$genre', artists: { $sum: 1 } } },
    { $sort: { artists: -1, _id: 1 } },
  ]);
  return rows.map((r) => ({ genre: r._id, artists: r.artists }));
}

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

/**
 * 歌手搜索（带「头像 + 简介」，2026-09-19 P1）
 * ------------------------------------------------------------
 * ⚠️ 事实：iTunes Search API 的 musicArtist 结果里**没有歌手头像**
 *    （只有 artistLinkUrl / primaryGenreName）。Apple Music API 有头像但要开发者密钥。
 *    所以这里用**代表作封面代位**当头像，并用真实数据拼简介：
 *      · 曲库已缓存 → 头像取较新的一张合格专辑封面；简介给"流派 · 正式专辑数 · 年代跨度"
 *      · 未缓存 → 去 iTunes 查一次该歌手的专辑（每人最多 1 次请求，并发 3），
 *        头像取第一张有封面的正式专辑，简介给"流派 · 代表作《X》 · 未入库"
 *    简介里不放任何编出来的话（"著名歌手/殿堂级"这类一律不写）。
 */
const SEARCH_ARTIST_CONCURRENCY = 3;

async function mapWithConcurrency(list, limit, fn) {
  const out = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= list.length) return;
      // eslint-disable-next-line no-await-in-loop
      out[i] = await fn(list[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

const yearOf = (d) => (d ? new Date(d).getFullYear() : null);
/** 歌手图缓存的保鲜期：30 天内不重复抓 Apple Music 页（没抓到也记时间，避免每次重试） */
const ARTIST_IMAGE_TTL_MS = 30 * 86400000;

/**
 * 歌手本人照片：先查库（Artist.imageUrl），没有再去 Apple Music 艺术家页取一次并落库。
 * 抓不到返回 null → 前端退化为代表作封面代位。
 */
async function ensureArtistPhoto(a) {
  const doc = await Artist.findOne({ artistId: a.artistId }).select('imageUrl imageFetchedAt').lean();
  if (doc?.imageUrl) return doc.imageUrl;
  const fresh = doc?.imageFetchedAt && Date.now() - new Date(doc.imageFetchedAt).getTime() < ARTIST_IMAGE_TTL_MS;
  if (fresh) return null; // 30 天内查过且没有图 → 不再打扰 Apple
  const url = await itunes.artistPhoto(a.artistId);
  Artist.updateOne(
    { artistId: a.artistId },
    { $set: { imageUrl: url || null, imageFetchedAt: new Date() } },
    { upsert: false },
  ).catch(() => {});
  return url;
}

async function enrichArtistBrief(a) {
  // ⚠️ 2026-09-20 性能修正：这里**不再**顺手去抓 Apple Music 页（一次要 1–2 秒 × 12 位歌手，
  //    把搜索拖成十几秒，第一次搜直接超时 → 用户以为"搜不出这位歌手"）。
  //    现在搜索只做"零成本的活"：查库拿专辑数/封面/已缓存的歌手图；
  //    真图由前端拿到结果后再调 /music/artists/photos 异步补（见 artistPhotos）。
  const [cached, doc] = await Promise.all([
    Album.find({ artistExternalId: a.artistId, isEligible: true })
      .sort({ releaseDate: 1 })
      .select('albumId name artworkUrl releaseDate')
      .lean(),
    Artist.findOne({ artistId: a.artistId }).select('imageUrl').lean(),
  ]);
  const photoUrl = doc?.imageUrl || null;
  if (cached.length) {
    const years = cached.map((x) => yearOf(x.releaseDate)).filter(Boolean);
    const newest = cached[cached.length - 1];
    return {
      ...a,
      cached: true,
      photoUrl,
      albumCount: cached.length,
      artworkUrl: newest.artworkUrl || cached[0].artworkUrl || null,
      topAlbum: newest.name || null,
      yearFrom: years.length ? Math.min(...years) : null,
      yearTo: years.length ? Math.max(...years) : null,
    };
  }
  try {
    const { albums } = await itunes.lookupAlbums(a.artistId, 25);
    const pick = albums.find((x) => x.artworkUrl && x.isAlbumType) || albums.find((x) => x.artworkUrl) || null;
    return {
      ...a,
      cached: false,
      photoUrl,
      albumCount: 0,
      artworkUrl: pick?.artworkUrl || null,
      topAlbum: pick?.name || null,
      yearFrom: pick ? yearOf(pick.releaseDate) : null,
      yearTo: null,
    };
  } catch {
    // 外部接口挂了也要能搜（降级：没有头像就显示首字母占位）
    return { ...a, cached: false, photoUrl, albumCount: 0, artworkUrl: null, topAlbum: null };
  }
}

/**
 * 批量补歌手本人照片（前端拿到搜索结果后再调用，避免拖慢搜索）
 * 返回 { [artistId]: url }，取不到的就不出现在结果里（前端保持专辑封面代位）。
 */
export async function artistPhotos(ids = []) {
  const list = [...new Set(ids.map(Number).filter(Boolean))].slice(0, 12);
  const out = {};
  await mapWithConcurrency(list, 3, async (id) => {
    const url = await ensureArtistPhoto({ artistId: id }).catch(() => null);
    if (url) out[id] = url;
  });
  return out;
}

export async function searchArtists(term, limit = 10) {
  const { artists } = await itunes.searchArtists(term, limit);
  const enriched = await mapWithConcurrency(artists, SEARCH_ARTIST_CONCURRENCY, enrichArtistBrief);
  return { artists: enriched };
}

export default {
  getArtistAlbums,
  getAlbumByExternalId,
  getAlbumTracks,
  getAlbumPreview,
  searchArtists,
  artistPhotos,
  syncArtist,
  freshness,
  serializeAlbum,
  GENRES,
};
