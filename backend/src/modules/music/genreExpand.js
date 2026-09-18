/**
 * 流派歌手扩充（2026-09-18 用户提出）
 * ------------------------------------------------------------
 * 问题：流派模式只能从**已缓存进曲库**的歌手里找（`Artist.genre` 匹配），
 *       而正式版曲库里「流行樂」只有 8 位歌手 —— 一个流派本来有几百位艺人，
 *       池子太小就撑不起"多歌手混战"这个玩法。
 *
 * 做法：去 Apple Music / iTunes 的流派分类里**抓同一个流派靠前的歌手**补进曲库。
 *
 * ⚠️ 一个必须说清的技术事实：iTunes Search API **没有**"按流派筛选"这个参数
 *    （`attribute=genreTerm` 实测和普通关键词搜索行为一致，不是筛选器）。
 *    真正的流派信息在每条结果自带的 `primaryGenreName` 上 ——
 *    所以这里的策略是：**用流派检索词搜 → 再用 primaryGenreName 反筛**。
 *    实测 `term=Mandopop` 的前 8 条 100% 是「国语流行」，而不加筛选时
 *    会混进"中山女高流行音樂傳播社"这类名字里带"流行"的杂项。
 */
import { Artist } from '../../models/index.js';
import * as itunes from './itunes.client.js';

/**
 * 流派 → 检索词 + 认可的 iTunes 流派标签关键词。
 * 键是**归一化后**的流派名（去掉空格与斜杠、转小写）。
 * accept 用「包含」匹配，同时覆盖简体与繁体（iTunes 不同接口返回的写法不一致：
 * 搜索接口给「国语流行」，库里查到的是「國語流行樂」）。
 */
export const GENRE_ALIAS = {
  // —— 华语系（放在最前：越具体的越先匹配，否则会被宽泛的「流行」抢先）——
  '國語流行樂': { terms: ['Mandopop', 'C-Pop', '国语流行'], accept: ['国语流行', '國語流行', 'mandopop', 'c-pop'] },
  '国语流行樂': { terms: ['Mandopop', 'C-Pop', '国语流行'], accept: ['国语流行', '國語流行', 'mandopop', 'c-pop'] },
  '華語流行樂': { terms: ['Mandopop', 'C-Pop'], accept: ['国语流行', '國語流行', '華語流行', '华语流行', 'mandopop', 'c-pop'] },
  '華語hiphop': { terms: ['Chinese Hip-Hop', '中文说唱', 'Hip-Hop'], accept: ['hip-hop', 'hip hop', 'rap', '嘻哈', '说唱', '說唱'] },
  '广东歌香港流行乐': { terms: ['Cantopop', '粵語流行'], accept: ['广东', '廣東', '粤语', '粵語', 'cantopop'] },
  '廣東歌香港流行樂': { terms: ['Cantopop', '粵語流行'], accept: ['广东', '廣東', '粤语', '粵語', 'cantopop'] },
  // —— R&B 系 ——
  'r&b騷靈樂': { terms: ['R&B', 'Soul'], accept: ['r&b', '骚灵', '騷靈', 'soul', '节奏蓝调', '節奏藍調'] },
  'r&b骚灵乐': { terms: ['R&B', 'Soul'], accept: ['r&b', '骚灵', '騷靈', 'soul', '节奏蓝调', '節奏藍調'] },
  '當代r&b': { terms: ['Contemporary R&B', 'R&B'], accept: ['r&b'] },
  '当代r&b': { terms: ['Contemporary R&B', 'R&B'], accept: ['r&b'] },
  // —— 其余（归一化会吃掉空格、斜杠、连字符，所以键要写成"连在一起"的样子）——
  'hiphoprap': { terms: ['Hip-Hop', 'Rap', '嘻哈'], accept: ['hip-hop', 'hip hop', 'rap', '嘻哈', '说唱', '說唱'] },
  '摇滚': { terms: ['Rock', '摇滚'], accept: ['摇滚', '搖滾', 'rock', 'metal', 'punk'] },
  '搖滾': { terms: ['Rock', '摇滚'], accept: ['摇滚', '搖滾', 'rock', 'metal', 'punk'] },
  '舞曲': { terms: ['Dance', 'EDM', '舞曲'], accept: ['舞曲', 'dance', 'edm', '電子舞曲', '电子舞曲'] },
  '另类音乐': { terms: ['Alternative', 'Indie'], accept: ['另类', '另類', 'alternative', 'indie'] },
  '另類音樂': { terms: ['Alternative', 'Indie'], accept: ['另类', '另類', 'alternative', 'indie'] },
  '电子音乐': { terms: ['Electronic', 'Electronica'], accept: ['电子', '電子', 'electronic', 'house', 'techno', 'trance'] },
  '電子音樂': { terms: ['Electronic', 'Electronica'], accept: ['电子', '電子', 'electronic', 'house', 'techno', 'trance'] },
  '爵士': { terms: ['Jazz'], accept: ['爵士', 'jazz'] },
  '古典': { terms: ['Classical'], accept: ['古典', 'classical'] },
  '民谣': { terms: ['Folk'], accept: ['民谣', '民謠', 'folk'] },
  '民謠': { terms: ['Folk'], accept: ['民谣', '民謠', 'folk'] },
  '乡村': { terms: ['Country'], accept: ['乡村', '鄉村', 'country'] },
  '鄉村': { terms: ['Country'], accept: ['乡村', '鄉村', 'country'] },
  '原声配乐': { terms: ['Soundtrack', 'Original Score'], accept: ['原声', '原聲', 'soundtrack', '配乐', '配樂'] },
  '原聲配樂': { terms: ['Soundtrack', 'Original Score'], accept: ['原声', '原聲', 'soundtrack', '配乐', '配樂'] },
  'jpop': { terms: ['J-Pop'], accept: ['j-pop', 'jpop', '日本流行'] },
  'kpop': { terms: ['K-Pop'], accept: ['k-pop', 'kpop', '韩国流行', '韓國流行'] },
  '节庆': { terms: ['Christmas', 'Holiday'], accept: ['节庆', '節慶', 'holiday', 'christmas', '圣诞', '聖誕'] },
  '節慶': { terms: ['Christmas', 'Holiday'], accept: ['节庆', '節慶', 'holiday', 'christmas', '圣诞', '聖誕'] },
  // —— 宽泛项放最后 ——
  '流行樂': { terms: ['Mandopop', 'C-Pop', 'Pop', '流行'], accept: ['流行', 'pop', 'mandopop', 'c-pop'] },
  '流行乐': { terms: ['Mandopop', 'C-Pop', 'Pop', '流行'], accept: ['流行', 'pop', 'mandopop', 'c-pop'] },
};

/** 归一化流派名：去空格/斜杠/连字符，转小写，'&'→'&' 保留 */
export function normalizeGenre(g) {
  return String(g || '')
    .trim()
    .toLowerCase()
    .replace(/[\s/\\_·・－-]+/g, '')
    .replace(/＆/g, '&');
}

/** 取某个流派的检索配置；库里出现表外的标签时，退化为「用它自己当检索词 + 用自己当筛选词」 */
export function resolveGenreConf(genre) {
  const key = normalizeGenre(genre);
  if (GENRE_ALIAS[key]) return GENRE_ALIAS[key];
  // 退一步：模糊匹配（如「華語 Hip-Hop」→ hip-hop 那一档）
  for (const [k, v] of Object.entries(GENRE_ALIAS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  const raw = String(genre || '').trim();
  return { terms: raw ? [raw] : ['Pop'], accept: [normalizeGenre(raw) || 'pop'] };
}

const hasAny = (hay, keys) => {
  const h = String(hay || '').toLowerCase();
  return keys.some((k) => h.includes(String(k).toLowerCase()));
};

/**
 * ① 发现：按流派去 Apple Music 找靠前的歌手（**只读，不写库**）
 * 返回的 artists 按 iTunes 的相关度（≈ 热度）排序，已经入库的会标 cached。
 */
export async function discoverGenreArtists(genre, { limit = 30 } = {}) {
  const conf = resolveGenreConf(genre);
  const strict = new Map();
  const loose = new Map();

  for (const term of conf.terms) {
    if (strict.size >= limit) break;
    let artists = [];
    try {
      // 每个检索词多取一些，筛完流派还能剩下足够的人
      // eslint-disable-next-line no-await-in-loop
      ({ artists } = await itunes.searchArtists(term, 100));
    } catch {
      // 单个检索词失败不影响其它词（iTunes 偶发限流）
      continue;
    }
    for (const a of artists) {
      if (strict.has(a.artistId) || loose.has(a.artistId)) continue;
      const row = { artistId: a.artistId, name: a.name, genre: a.genre };
      // 反筛：只收流派标签对得上的（这是质量的关键一步）
      if (hasAny(a.genre, conf.accept)) strict.set(a.artistId, row);
      else loose.set(a.artistId, { ...row, loose: true });
      if (strict.size >= limit * 3) break;
    }
  }

  /**
   * 兜底：某些流派在 `country=cn` 下的官方标签是中文（实测「Reggaeton」→「拉丁都市音乐」），
   * 严格反筛会一条都不剩。这时退化为"按 iTunes 相关度收录"，并打上 loose 标记，
   * 让界面能如实说明"这批是按相关度收的，没做流派标签精确对照"。
   */
  const useStrict = strict.size >= Math.min(limit, 5);
  const pool = useStrict ? [...strict.values()] : [...strict.values(), ...loose.values()];
  const list = pool.slice(0, limit);
  const ids = list.map((a) => a.artistId);
  const cached = ids.length
    ? await Artist.find({ artistId: { $in: ids } }).select('artistId albumCount genre').lean()
    : [];
  const cacheMap = new Map(cached.map((c) => [c.artistId, c]));

  return {
    genre,
    searched: conf.terms,
    total: list.length,
    /** true = 命中数不足，这批是按相关度收的（流派标签没做精确对照） */
    loose: !useStrict,
    artists: list.map((a) => {
      const hit = cacheMap.get(a.artistId);
      return {
        ...a,
        cached: Boolean(hit),
        localAlbumCount: hit?.albumCount || 0,
      };
    }),
  };
}

/**
 * ② 入库：把这些歌手（连同其专辑）同步进本地曲库。
 * 一次最多 8 位 —— 每位歌手都要打一次 iTunes 专辑接口，太多会把这个请求拖到超时。
 * 前端按批调用，边入库边显示进度。
 */
export async function warmGenreArtists(genre, artistIds) {
  const ids = [...new Set((artistIds || []).map(Number).filter((n) => n > 0))].slice(0, 8);
  if (!ids.length) return { genre, saved: 0, failed: 0, results: [] };

  const results = [];
  // 并发 2：iTunes 对短时间内的密集请求会限流（-462 的教训）
  const queue = [...ids];
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await musicServiceSyncArtist(id);
        // ⚠️ syncArtist 返回的是 { artist, albums, stats }，不是歌手文档本身
        results.push({
          artistId: id,
          ok: true,
          name: r?.artist?.name || r?.artist?.genre || '',
          albums: (r?.albums || []).length,
        });
      } catch (e) {
        results.push({ artistId: id, ok: false, reason: e?.message || '同步失败' });
      }
    }
  };
  await Promise.all([worker(), worker()]);

  return {
    genre,
    saved: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

/** 延迟引入，避免 music.service ←→ genreExpand 的循环依赖 */
async function musicServiceSyncArtist(id) {
  const mod = await import('./music.service.js');
  return mod.syncArtist(id);
}
