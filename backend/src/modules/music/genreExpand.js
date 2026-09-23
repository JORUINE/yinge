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
import { looksLikeArtistList } from './admission.js';
import { whitelistNamesFor, sameArtistName } from '../../data/genreWhitelist.js';

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
  /**
   * ⚠️ 2026-09-23 修（用户报「韩国流行乐出来一堆莫名其妙的歌手」）：
   * 界面的流派名是**库里歌手的 iTunes 中文标签**，而这里原来只登记了英文键 `kpop`。
   * 「韓國流行樂」归一化后不命中任何键 → 掉进下面的模糊匹配 → 被更短的「流行乐」抢走
   * → 拿 `Pop` 去搜 → 回来一堆 Miley Cyrus / ABBA 这类欧美流行歌手。
   * 现补上中文键（诊断脚本 scripts/diag-genres.mjs 可复现）。
   */
  '日本流行乐': { terms: ['J-Pop'], accept: ['j-pop', 'jpop', '日本流行'] },
  '日本流行樂': { terms: ['J-Pop'], accept: ['j-pop', 'jpop', '日本流行'] },
  'kpop': { terms: ['K-Pop'], accept: ['k-pop', 'kpop', '韩国流行', '韓國流行'] },
  '韩国流行乐': { terms: ['K-Pop'], accept: ['k-pop', 'kpop', '韩国流行', '韓國流行'] },
  '韓國流行樂': { terms: ['K-Pop'], accept: ['k-pop', 'kpop', '韩国流行', '韓國流行'] },
  '器乐': { terms: ['Instrumental'], accept: ['器乐', '器樂', 'instrumental'] },
  '器樂': { terms: ['Instrumental'], accept: ['器乐', '器樂', 'instrumental'] },
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
 * 库里流派名 → Apple Music **榜单流派 ID** + 取榜地区。
 * ------------------------------------------------------------
 * 这是 2026-09-18 修「流派大咖进不来」的关键：search 接口没有流派筛选，
 * 而老版榜单接口 `/{country}/rss/topalbums/limit=N/genre=<id>/json` **有**，
 * 且 hk/us 各区各有一份榜 → 两个区穿插取，华语与欧美的大咖就都进来了。
 *
 * ID 是实测对出来的（探针把 1~40 全部拉了一遍）：
 *   5=古典 6=乡村 7=电子 8=节庆 10=民谣/创作歌手 11=爵士 12=拉丁 14=流行
 *   15=R&B/骚灵 16=原声配乐 17=舞曲 20=另类 21=摇滚 24=雷鬼 27=日本流行
 * countries 的顺序 = 混合优先级（欧美流派 us 先，华语语境 hk 先）。
 *
 * ⚠️ 华语系流派**故意不进这张表**：hk 区的 14 号（流行）榜里混着 aespa、IVE 这类
 *    K-pop，而中文流派的正确来源是"关键词搜 + primaryGenreName 反筛"（那条路能靠
 *    标签把 K-pop 筛掉）。所以华语流派继续走关键词源。
 */
export const GENRE_RSS = {
  摇滚: { id: 21, countries: ['us', 'hk'] },
  搖滾: { id: 21, countries: ['us', 'hk'] },
  rock: { id: 21, countries: ['us', 'hk'] },
  hiphoprap: { id: 18, countries: ['us', 'hk'] },
  hiphop: { id: 18, countries: ['us', 'hk'] },
  嘻哈: { id: 18, countries: ['us', 'hk'] },
  流行樂: { id: 14, countries: ['us', 'hk'] },
  流行乐: { id: 14, countries: ['us', 'hk'] },
  pop: { id: 14, countries: ['us', 'hk'] },
  'r&b騷靈樂': { id: 15, countries: ['us', 'hk'] },
  'r&b骚灵乐': { id: 15, countries: ['us', 'hk'] },
  '當代r&b': { id: 15, countries: ['us', 'hk'] },
  '当代r&b': { id: 15, countries: ['us', 'hk'] },
  'r&b': { id: 15, countries: ['us', 'hk'] },
  舞曲: { id: 17, countries: ['us', 'hk'] },
  dance: { id: 17, countries: ['us', 'hk'] },
  另類音樂: { id: 20, countries: ['us', 'hk'] },
  另类音乐: { id: 20, countries: ['us', 'hk'] },
  電子音樂: { id: 7, countries: ['us', 'hk'] },
  电子音乐: { id: 7, countries: ['us', 'hk'] },
  爵士: { id: 11, countries: ['us', 'hk'] },
  jazz: { id: 11, countries: ['us', 'hk'] },
  古典: { id: 5, countries: ['us', 'hk'] },
  鄉村: { id: 6, countries: ['us', 'hk'] },
  乡村: { id: 6, countries: ['us', 'hk'] },
  民謠: { id: 10, countries: ['us', 'hk'] },
  民谣: { id: 10, countries: ['us', 'hk'] },
  原聲配樂: { id: 16, countries: ['us', 'hk'] },
  原声配乐: { id: 16, countries: ['us', 'hk'] },
  節慶: { id: 8, countries: ['us', 'hk'] },
  节庆: { id: 8, countries: ['us', 'hk'] },
  jpop: { id: 27, countries: ['hk', 'us'] },
  // —— 以下为常见变体写法，保证"说唱 / Hip-Hop / rap / R&B / 雷鬼"等也能走上榜单源 ——
  '说唱': { id: 18, countries: ['us', 'hk'] },
  rap: { id: 18, countries: ['us', 'hk'] },
  'hip-hop': { id: 18, countries: ['us', 'hk'] },
  rnb: { id: 15, countries: ['us', 'hk'] },
  '雷鬼': { id: 24, countries: ['us', 'hk'] },
  reggae: { id: 24, countries: ['us', 'hk'] },
  indie: { id: 20, countries: ['us', 'hk'] },
  edm: { id: 17, countries: ['us', 'hk'] },
  'k-pop': { id: 51, countries: ['kr', 'us'] },
  kpop: { id: 51, countries: ['kr', 'us'] },
  // 2026-09-23 补：界面传的是中文流派名（库里歌手的 iTunes 标签），必须同键登记
  '韩国流行乐': { id: 51, countries: ['kr', 'us'] },
  '韓國流行樂': { id: 51, countries: ['kr', 'us'] },
  '日本流行乐': { id: 27, countries: ['hk', 'us'] },
  '日本流行樂': { id: 27, countries: ['hk', 'us'] },
};

/**
 * 流派名 → Apple Music 榜单流派 ID（模糊匹配，2026-09-23 补）。
 * ------------------------------------------------------------
 * 原先 `discoverGenreArtists` 只做精确归一化命中，导致「说唱 / Hip-Hop / rap」这类常见写法
 * 走不到榜单源、退化成关键词搜索（只能拿到曲库里已有的少数歌手，知名艺人进不来 —— 用户原话）。
 * 现在：精确命中优先；否则用"包含"容错（「華語 Hip-Hop」→ 嘻哈 18、「说唱」→ 嘻哈 18），
 * 让更多写法都能拉到该流派真实靠前的知名艺人。
 */
/** 中文语种词：命中即判定"该流派属华语系" → 不用 Apple 榜单源（见 resolveGenreRss） */
const CN_LANG_WORDS = ['華語', '华语', '國語', '国语', '廣東', '广东', '粵語', '粤语', 'cantopop', 'mandopop'];

export function resolveGenreRss(genre) {
  const key = normalizeGenre(genre);
  if (GENRE_RSS[key]) return GENRE_RSS[key];
  /**
   * ⚠️ 2026-09-23 修（诊断脚本 scripts/diag-genres.mjs 实测）：
   * 「廣東歌香港流行樂」原来会**模糊命中「流行樂」→ 吃掉 14 号流行榜**，
   * 而 hk 区的流行榜里混着 K-pop 与欧美流行 —— 与上面注释"华语系不用榜单源"
   * 的设计意图相反，华语流派因此被带偏。
   * 现在先按**语种**拦一道：只要名字里带中文语种词，直接判"无榜单源"，
   * 退回「关键词搜 + primaryGenreName 反筛」（那条路才能把 K-pop 筛出去）。
   */
  if (CN_LANG_WORDS.some((w) => key.includes(w))) return null;
  for (const [k, v] of Object.entries(GENRE_RSS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

/**
 * 剔除"伪歌手"噪声（2026-09-18 用户报「搜摇滚出来一堆奇怪的」）。
 * 实测两类噪声：
 *   ① iTunes 自制的**歌单/电台伪歌手**：流行摇滚、摇滚老太、反叛摇滚、我的摇滚青春、
 *      Traditional、Today's Hits …… —— 它们有 artistId，但不是一个艺人；
 *   ② **词曲作者 / 制作人**（Greg Kurstin、Ari Levine、Mike Elizondo）—— iTunes 给他们
 *      开了艺人页，标签还正好是「摇滚」。这类靠名字不好认，靠"榜单源优先"把它们挤出去
 *      （榜单是真实销量/播放排序，制作人不会上榜）。
 */
const JUNK_NAME_RES = [
  /hits\b/i,
  /hottest/i,
  /essentials/i,
  /staples/i,
  /playlist/i,
  /\bradio\b/i,
  /top\s*\d+/i,
  /workout/i,
  /\bchill\b/i,
  /mixtape/i,
  /^various/i,
  /karaoke/i,
  /\btribute\b/i,
  /^traditional$/i,
];
const PURE_CHINESE_RE = /^[\u4e00-\u9fa5·・\s]+$/;
const GENRE_WORDS = ['摇滚', '搖滾', '流行', '嘻哈', '说唱', '說唱', '舞曲', '爵士', '民谣', '民謠', '乡村', '鄉村'];

export function looksLikeCuratedArtist(name, genre) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (JUNK_NAME_RES.some((re) => re.test(n))) return true;
  // 纯中文 + 名字里带流派词 → 判为歌单伪歌手（真乐队不会叫「流行摇滚」「我的摇滚青春」）
  if (PURE_CHINESE_RE.test(n) && GENRE_WORDS.some((w) => n.includes(w))) return true;
  // 正在搜的流派词被完整写进名字里（「摇滚老太」），且名字很短 → 也判伪歌手
  const g = String(genre || '').trim();
  if (g && n.length <= 8 && n.includes(g)) return true;
  return false;
}

/**
 * 发现阶段的统一"要不要这个人"判定：
 *   ① 歌单/电台伪歌手、制作人式噪声 → 丢
 *   ② 多人拼盘署名（「Rakim, Kurupt & Masta Killa」）→ 丢。
 *      这类**入库也白入**：专辑准入里"非多人拼盘署名"会把它们的专辑全剔掉
 *      （实测榜单里有好几条这种），提前筛掉可以省下入库请求。
 */
function skipArtist(name, genre) {
  return looksLikeCuratedArtist(name, genre) || looksLikeArtistList(name);
}

/** 关键词源：按检索词搜歌手 → 用 primaryGenreName 反筛（华语流派与无榜单 ID 的流派走这条） */async function keywordArtistsOf(conf, genre, { limit, seen }) {
  const strict = new Map();
  const loose = new Map();
  for (const term of conf.terms) {
    if (strict.size >= limit * 3 || seen.size + strict.size >= limit) break;
    let artists = [];
    try {
      // eslint-disable-next-line no-await-in-loop
      ({ artists } = await itunes.searchArtists(term, 100));
    } catch {
      continue; // 单个检索词失败不影响其它词（iTunes 偶发限流）
    }
    for (const a of artists) {
      if (seen.has(a.artistId) || strict.has(a.artistId) || loose.has(a.artistId)) continue;
      if (skipArtist(a.name, genre)) continue;
      const row = { artistId: a.artistId, name: a.name, genre: a.genre };
      if (hasAny(a.genre, conf.accept)) strict.set(a.artistId, row);
      else loose.set(a.artistId, { ...row, loose: true });
    }
  }
  return { strict, loose };
}

/**
 * 白名单名单（**瞬时**，不打 iTunes）—— 2026-09-23 用户：
 * "我希望这里增加点开就能看到的我们白名单内置的歌手名单"。
 * ------------------------------------------------------------
 * 与 discoverGenreArtists 的分工：
 *   · discover  —— 要逐个名字去 iTunes 搜（慢、依赖外网），用于"把还没入库的知名歌手找出来"；
 *   · 本函数    —— 只读本地白名单清单 + **一次** DB 查询标注"已入库"，毫秒级返回。
 * 于是"点开看看这册里都有谁"不再需要等搜索（用户同时抱怨了"查找速度太慢"）。
 */
export async function whitelistOfGenre(genre) {
  const names = whitelistNamesFor(genre, normalizeGenre);
  if (!names.length) return { genre, total: 0, cached: 0, artists: [] };
  // 一次扫描库里歌手（本地库千余条，毫秒级），用宽松名字匹配标注已入库
  const all = await Artist.find({}).select('artistId name albumCount genre').lean();
  const artists = names.map((name) => {
    const hit = all.find((a) => sameArtistName(a.name, name));
    return {
      name,
      cached: Boolean(hit),
      artistId: hit?.artistId || null,
      localAlbumCount: hit?.albumCount || 0,
      localGenre: hit?.genre || null,
    };
  });
  return {
    genre,
    total: artists.length,
    cached: artists.filter((a) => a.cached).length,
    artists,
  };
}

/**
 * ①-a 人工白名单（**主来源**，2026-09-23 用户定调）
 * ------------------------------------------------------------
 * 用户原话："把白名单做成默认，然后把那些时下热门的做成去补的那些人 ——
 * 因为你这个名单里的歌手反而比较符合大众对这个流派的认知，我觉得这样是最对的。"
 *
 * 为什么它比 Apple 榜单更准：榜单回答的是**"此刻在卖什么"** ——
 * 冷门新专与地区榜歌手会挤掉常青大牌（实测 Hip-Hop 榜前排是 Upchurch / AZ Cure /
 * Novel Fergus 这类，而 Drake / Kanye / Eminem 排在很后面甚至没有）。
 * 大众提到"说唱"时想到的是后者，所以**白名单做主、榜单做补**。
 *
 * 做法：按 data/genreWhitelist.js 里该流派的名字清单，**逐个去 iTunes 搜**
 * （每个名字 1 次请求，取第一条还没进池、且不是歌单伪歌手的命中），
 * 凑够 limit 就停。名字搜不到的（改名/下架/拼写差异）静默跳过，不阻塞其它人。
 *
 * ⚠️ 并发固定 3：iTunes 对密集请求会限流（-462 的教训，与 warmGenreArtists 同一套写法）。
 */
async function whitelistArtistsOf(genre, { limit, seen }) {
  const names = whitelistNamesFor(genre, normalizeGenre);
  if (!names.length) return 0;
  const queue = [...names];
  let added = 0;
  const worker = async () => {
    while (queue.length && seen.size < limit) {
      const name = queue.shift();
      let artists = [];
      try {
        // eslint-disable-next-line no-await-in-loop
        ({ artists } = await itunes.searchArtists(name, 5));
      } catch {
        continue; // 单个名字失败不影响其它名字（iTunes 偶发限流）
      }
      const hit = artists.find((a) => !seen.has(a.artistId) && !skipArtist(a.name, genre));
      if (!hit) continue;
      seen.set(hit.artistId, {
        artistId: hit.artistId,
        name: hit.name,
        genre: hit.genre,
        chartRank: null,
        from: 'whitelist',
      });
      added += 1;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return added;
}

/**
 * ① 发现：按流派去 Apple Music 找靠前的歌手（**只读，不写库**）
 * 返回的 artists 按热度（榜单名次 / iTunes 相关度）排序，已经入库的会标 cached。
 */
export async function discoverGenreArtists(genre, { limit = 30 } = {}) {
  const conf = resolveGenreConf(genre);
  const rss = resolveGenreRss(genre);
  const seen = new Map();

  /**
   * ①-a 人工白名单（**首选**，2026-09-23 用户定调）
   * ------------------------------------------------------------
   * 用户原话："把白名单做成默认，然后把那些时下热门的做成去补的那些人 ——
   * 因为你这个名单里的歌手反而比较符合大众对这个流派的认知，我觉得这样是最对的。"
   *
   * 所以发现顺序改为：**人工白名单 → Apple 榜单（补足）→ 关键词（兜底）**。
   *   · 白名单 = "大众认知里这个流派该有谁"（稳定、够大牌）—— 主来源；
   *   · 榜单   = "此刻在卖什么"（当红新人 / 地区热歌），把剩余名额补满；
   *   · 关键词 = 表外流派，或前两者都没凑够时的兜底。
   */
  await whitelistArtistsOf(genre, { limit, seen });

  // ①-b 榜单补足：白名单没凑够时，用"时下热门"补齐（hk / us 两区穿插）
  if (seen.size < limit && rss) {
    const lists = [];
    for (const country of rss.countries) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const { entries } = await itunes.topAlbumsByGenre(rss.id, { country, limit: 100 });
        lists.push(entries);
      } catch {
        lists.push([]);
      }
    }
    const deepest = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < deepest && seen.size < limit; i += 1) {
      for (const list of lists) {
        const e = list[i];
        if (!e || seen.has(e.artistId) || skipArtist(e.artistName, genre)) continue;
        seen.set(e.artistId, {
          artistId: e.artistId,
          name: e.artistName,
          genre: null, // 榜单条目不带流派标签，前端显示"该流派"即可
          chartRank: e.rank,
          from: 'chart',
        });
        if (seen.size >= limit) break;
      }
    }
  }

  // ①-c 关键词源：表外流派（华语系原先的路径）或白名单/榜单仍不足时兜底
  let looseUsed = false;
  if (seen.size < limit) {
    const { strict, loose } = await keywordArtistsOf(conf, genre, { limit, seen });
    const need = limit - seen.size;
    const useStrict = strict.size >= Math.min(need, 5);
    const pool = useStrict ? [...strict.values()] : [...strict.values(), ...loose.values()];
    looseUsed = !useStrict;
    for (const a of pool) {
      if (seen.size >= limit) break;
      if (seen.has(a.artistId)) continue;
      seen.set(a.artistId, { ...a, chartRank: null, from: 'keyword' });
    }
  }

  const list = [...seen.values()].slice(0, limit);
  const ids = list.map((a) => a.artistId);
  const cached = ids.length
    ? await Artist.find({ artistId: { $in: ids } }).select('artistId albumCount genre').lean()
    : [];
  const cacheMap = new Map(cached.map((c) => [c.artistId, c]));

  return {
    genre,
    searched: conf.terms,
    /**
     * 'whitelist' = 人工白名单（现在的主来源）｜'chart' = Apple 榜单补足｜
     * 'keyword' = 关键词+标签反筛兜底｜'mixed' = 混合
     */
    source: (() => {
      const kinds = new Set(list.map((a) => a.from));
      if (kinds.size > 1) return 'mixed';
      if (kinds.has('whitelist')) return 'whitelist';
      if (kinds.has('chart')) return 'chart';
      return 'keyword';
    })(),
    total: list.length,
    /**
     * true = 命中数不足，部分是按相关度收的（流派标签没做精确对照）。
     * ⚠️ 2026-09-23 修：这里原来读的是 `usedChart`，而该变量在上一批重构时已被删除 ——
     *    `node --check` 查不出未声明变量，是个只在**真实调用时**才炸的运行时炸弹（ReferenceError）。
     *    现在直接看最终名单里有没有榜单来源，不依赖中间变量。
     */
    loose: !list.some((a) => a.from === 'chart') && looseUsed,
    artists: list.map((a) => {
      const hit = cacheMap.get(a.artistId);
      return {
        ...a,
        cached: Boolean(hit),
        localAlbumCount: hit?.albumCount || 0,
        localGenre: hit?.genre || null,
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
