/**
 * iTunes Search API 客户端
 * ------------------------------------------------------------
 * 免密钥、免登录、无风控，可公开部署（对比网易云接口已被风控 -462，故弃用）。
 * 地区策略：默认 hk，失败按 hk -> tw -> us -> cn 依次回退（接口文档 2.1）。
 * 实测约束：按 artistId 拉曲目被 200 上限截断（无法 offset 翻页），多专辑歌手部分专辑会漏歌；
 * 故曲目同步改用「逐专辑 lookupAlbumSongs」拿完整列表（hk 区可展开），artistId 拉歌仅作批量预缓存。
 */
import config from '../../config/index.js';
import { ExternalMusicError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

const BASE = 'https://itunes.apple.com';

function buildCountries() {
  const primary = config.itunes.country;
  const rest = config.itunes.countryFallback.filter((c) => c !== primary);
  return [primary, ...rest];
}

async function request(path, params) {
  const countries = buildCountries();
  let lastError = null;

  for (let i = 0; i < countries.length; i += 1) {
    const country = countries[i];
    const url = new URL(path, BASE);
    url.searchParams.set('country', country);
    url.searchParams.set('media', 'music');
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.itunes.timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'yinge/0.1 (+https://github.com/JORUINE/yinge)' },
      });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      const count = Number(json.resultCount || 0);
      const isLast = i === countries.length - 1;
      if (count === 0 && !isLast) {
        lastError = new Error('该地区无结果');
        continue;
      }
      return { json, country };
    } catch (err) {
      lastError = err;
      logger.warn('iTunes 地区请求失败，尝试回退', { country, error: err.message });
    } finally {
      clearTimeout(timer);
    }
  }

  throw new ExternalMusicError(`外部音乐接口请求失败：${lastError?.message || '未知原因'}`);
}

/** 封面地址升清：接口返回 100x100bb，替换为 600x600bb */
export function upscaleArtwork(url, size = 600) {
  if (!url) return url;
  return String(url).replace(/\d+x\d+bb/, `${size}x${size}bb`);
}

export async function searchArtists(term, limit = 10) {
  const { json, country } = await request('/search', { term, entity: 'musicArtist', limit });
  const artists = (json.results || [])
    .filter((r) => r.artistId)
    .map((r) => ({
      artistId: Number(r.artistId),
      name: r.artistName,
      genre: r.primaryGenreName || null,
      region: country,
    }));
  return { country, artists };
}

export async function lookupAlbums(artistId, limit = 200) {
  const { json, country } = await request('/lookup', { id: artistId, entity: 'album', limit });
  const albums = (json.results || [])
    .filter((r) => r.wrapperType === 'collection' || r.collectionId)
    .map((r) => ({
      albumId: Number(r.collectionId),
      artistExternalId: Number(r.artistId),
      artistName: r.artistName,
      name: r.collectionName,
      artworkUrl: upscaleArtwork(r.artworkUrl100),
      trackCount: Number(r.trackCount || 0),
      releaseDate: r.releaseDate ? new Date(r.releaseDate) : null,
      // ⚠️ 流派必须带上：syncArtist 靠它给 Artist/Album 落 genre（流派模式依赖）。
      //    之前只有 searchArtists 存了 genre，lookupAlbums 丢掉了 → 流派模式 100% 查不到。
      genre: r.primaryGenreName || null,
      isAlbumType: r.collectionType === 'Album',
      collectionType: r.collectionType || null,
    }));
  return { country, albums };
}

export async function lookupSongs(artistId, limit = 200) {
  const { json, country } = await request('/lookup', { id: artistId, entity: 'song', limit });
  const songs = (json.results || [])
    .filter((r) => r.wrapperType === 'track' || r.trackId)
    .map((r) => ({
      trackId: Number(r.trackId),
      albumExternalId: Number(r.collectionId),
      artistExternalId: Number(r.artistId),
      name: r.trackName,
      previewUrl: r.previewUrl || null,
      duration: r.trackTimeMillis || null,
      discNumber: r.discNumber || null,
      trackNumber: r.trackNumber || null,
    }));
  return { country, songs };
}

/**
 * 按专辑逐张拉曲目（实测 hk 区可展开：返回该专辑完整曲目列表）。
 * 用于修正「按歌手拉歌被 200 上限截断、导致多专辑歌手部分专辑曲目不全」的问题。
 */
export async function lookupAlbumSongs(collectionId, limit = 200) {
  const { json, country } = await request('/lookup', { id: collectionId, entity: 'song', limit });
  const songs = (json.results || [])
    .filter((r) => r.wrapperType === 'track' || r.trackId)
    .map((r) => ({
      trackId: Number(r.trackId),
      albumExternalId: Number(r.collectionId),
      artistExternalId: Number(r.artistId),
      name: r.trackName,
      previewUrl: r.previewUrl || null,
      duration: r.trackTimeMillis || null,
      discNumber: r.discNumber || null,
      trackNumber: r.trackNumber || null,
    }));
  return { country, songs };
}

export default { searchArtists, lookupAlbums, lookupSongs, upscaleArtwork };
