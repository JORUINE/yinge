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
      link: r.artistLinkUrl || null,
    }));
  return { country, artists };
}

/**
 * 歌手本人照片 —— 从 Apple Music 艺术家页的 og:image 取（2026-09-20 新增）
 * ------------------------------------------------------------------
 * 用户问："Apple Music 打开不就有歌手最新图片吗" —— 是的，而且**不需要开发者密钥**：
 * 艺术家页 HTML 的 og:image 就是歌手本人照片。
 * ⚠️ 实测（2026-09-20，Adele 262836961 / Taylor Swift 159260351 逐一试过）：
 *    **只有 cn 商店front 的页面带真图**，us / gb / hk / tw / jp 返回的都是通用 logo
 *    （music.apple.com/assets/meta/apple-music.png）→ 所以固定打 cn 站，拿到通用 logo 就当"没有图"。
 * 返回**方形** 600x600（mzstatic 支持换尺寸段：/1200x630cw.png → /600x600bb.jpg，实测 200）。
 * 抓不到就返回 null，调用方退化为"代表作封面代位"（绝不显示裂图）。
 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export async function artistPhoto(artistId) {
  const id = Number(artistId);
  if (!id) return null;
  try {
    const res = await fetch(`https://music.apple.com/cn/artist/x/${id}`, {
      headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal: AbortSignal.timeout(9000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    /**
     * ⚠️ 2026-09-20 性能优化（用户："为什么歌手搜索出来的图片总要等一会儿才加载"）：
     * 艺术家页整页有 **1.5MB 左右**，而我们要的 `og:image` 就在 <head> 里（前几十 KB）。
     * 以前 `await res.text()` 会把 1.5MB 全下完才解析 → 白等一大截。
     * 现在**流式读，命中 og:image 立刻中断**（reader.cancel），通常几 KB 就拿到。
     */
    const reader = res.body?.getReader();
    let html = '';
    let found = null;
    if (reader) {
      const dec = new TextDecoder('utf-8');
      let total = 0;
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        html += dec.decode(value, { stream: true });
        const m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
        if (m) {
          found = m[1];
          break;
        }
        if (total > 262144) break; // 兜底：最多读 256KB，别把整页拖回来
      }
      reader.cancel().catch(() => {});
    } else {
      html = await res.text();
      const m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
      found = m?.[1] || null;
    }
    if (!found || !/mzstatic\.com/.test(found)) return null; // 通用 logo = 没有歌手图
    return found.replace(/\/\d+x\d+cw\.(png|jpg|jpeg)$/i, '/600x600bb.jpg');
  } catch {
    return null;
  }
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

/**
 * 按流派取「Apple Music 榜单专辑」——**这是唯一能真正做到"按流派取歌手"的路子**。
 * ------------------------------------------------------------
 * 为什么不用 search 接口：iTunes Search API **没有**流派筛选参数
 * （`attribute=genreTerm` 实测等同普通关键词搜索）。实测 `term=Rock` 在 hk 区
 * 返回的前 40 位是 BTS / Ed Sheeran / BLACKPINK / Taylor Swift…… 跟摇滚毫无关系，
 * 只能靠结果自带的 `primaryGenreName` 反筛 —— 筛出来的人数少、还混着制作者与
 * 歌单伪歌手（Greg Kurstin / Ari Levine / 「流行摇滚」「摇滚老太」）。
 *
 * 老版 RSS 榜单（`/{country}/rss/topalbums/limit=N/genre=<id>/json`）**支持 genre 参数**
 * 且 hk/us 两个区各自有榜，实测 `genre=21`（摇滚）在 us 区给的是
 * Journey / Pink Floyd / Fleetwood Mac / Boston / TOOL / Creedence —— 正是要的"流派大咖"。
 *
 * 附带好处：条目里的 `im:artist.attributes.href` 形如
 * `https://music.apple.com/us/artist/journey/486597?uo=2`，**歌手 ID 直接就在里面**，
 * 不必再为每位歌手打一次搜索请求（30 位歌手省 30 次请求）。
 *
 * @param {number} genreId iTunes 音乐流派 ID（21=摇滚 18=嘻哈 14=流行 15=R&B 见 genreExpand.js）
 * @param {{country?: string, limit?: number, explicit?: boolean}} options
 * @returns {Promise<{country:string, entries:Array<{artistId:number, artistName:string, albumName:string, rank:number}>}>}
 */
export async function topAlbumsByGenre(genreId, { country = 'us', limit = 100, explicit = true } = {}) {
  const url = new URL(
    `/${country}/rss/topalbums/limit=${limit}/genre=${genreId}${explicit ? '/explicit=true' : ''}/json`,
    BASE,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.itunes.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'yinge/0.1 (+https://github.com/JORUINE/yinge)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    let list = json?.feed?.entry || [];
    if (!Array.isArray(list)) list = [list]; // 只有 1 条时返回对象
    const entries = list
      .map((e, i) => {
        const href = e?.['im:artist']?.attributes?.href || '';
        const hit = href.match(/\/artist\/[^/]*\/(\d+)/);
        return {
          artistId: hit ? Number(hit[1]) : null,
          artistName: e?.['im:artist']?.label || null,
          albumName: e?.['im:name']?.label || null,
          rank: i + 1,
        };
      })
      .filter((x) => x.artistId && x.artistName);
    return { country, entries };
  } finally {
    clearTimeout(timer);
  }
}

export default { searchArtists, lookupAlbums, lookupSongs, topAlbumsByGenre, upscaleArtwork, artistPhoto };
