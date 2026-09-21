/**
 * 专辑准入过滤（七条规则）
 * ------------------------------------------------------------
 * 对应《系统设计文档》4.3。规则 3~6 通过名称关键词匹配实现，
 * 关键词集合集中配置、可在后台维护。规则 7（同名去重）需要跨专辑上下文，
 * 在 applyAdmission 中统一处理。
 */

export const MIN_TRACK_COUNT = 7;
/**
 * 曲目数上限（2026-09-18 新增）。
 * 用户报「合集类专辑 30 多首歌的那种」会混进参赛池 —— 精选/大盒装/加曲合集版
 * 动辄 30+ 首，与"专辑对决"的语义不符（比的是专辑，不是打包合集）。
 * 30 是留过余量的：The Beatles（白专辑）30 首整、多数双唱片专辑 20~28 首，都不受影响。
 */
export const MAX_TRACK_COUNT = 30;

/** 名称关键词集合（规则 3~6 使用），后续可由后台维护 */
export const DEFAULT_KEYWORDS = {
  // live：除了 live/concert，还要拦「巡演 / 体育场」这类现场录音（2026-09-17 补：Stadium Tour 漏筛）
  live: [
    'live',
    '现场',
    '演唱會',
    '演唱会',
    '音乐会',
    '音樂會',
    '拉闊',
    '拉阔',
    '音乐节',
    '音樂節',
    'concert',
    'unplugged',
    'acoustic live',
    ' tour',
    'tour ',
    '巡演',
    '巡迴',
    '巡回',
    'stadium',
    '体育馆',
    '紅館',
    '红馆',
  ],
  soundtrack: [
    'ost',
    'original soundtrack',
    'soundtrack',
    '原声',
    '电影原声',
    '配乐',
    '主題曲',
    '主题曲',
    // 2026-09-18 补：影视原声有好几种写法，之前只拦了 "OST/Soundtrack/原声"，
    // 于是「Black Panther: Wakanda Forever - Music From and Inspired By」「Top Gun: Maverick
    // (Music from the Motion Picture)」这类以**曲目用途**命名的原声碟全部漏筛进参赛池。
    'music from and inspired by',
    'music from the motion picture',
    'music from',
    'inspired by',
    'motion picture',
    'score from',
    'original motion picture',
    '电影原声带',
    '原聲帶',
    '影视原声',
    '影視原聲',
  ],
  // remix：混音 / 重混专辑不是正式专辑（2026-09-18 用户报「随机出来全是 remix」）
  //   实测命中：The Remix、Judas (Remixes)、What Now (Remixes)、You da One (Remixes)、
  //            Unfaithful Remixes、Umbrella (feat. JAŸ-Z) [Remixes] …
  remix: ['remix', 'remixes', 'remixed', 'rmx', 're-mix', '混音', '重混'],
  // single：iTunes 用「 - Single / - EP」标注单曲与迷你专辑；有些单曲塞了 8 首混音，
  //   光靠 MIN_TRACK_COUNT 拦不住（2026-09-18 用户报：Disease - Single 混进来了）
  single: [' - single', ' - ep', ' (single)', ' - maxi'],
  /**
   * 再版硬剔（2026-09-18 用户点名：「已经发行的专辑的加曲合集版也不行」）。
   * 只放**只会出现在"再版"上**的词（reloaded / complete confection / 周年纪念版）。
   * ⚠️ 刻意**不**把 deluxe / expanded / remaster 放进来：它们经常是某张专辑**唯一的版本**
   *    （实测 Rihanna 的 ANTI 在港区只有 "ANTI (Deluxe)"），硬剔会把整张专辑弄丢。
   *    这类版本词交给规则 7 同名去重：与本体同时存在时保留最早那张（本体），
   *    只有当本体压根不存在时才保留它。
   */
  reissue: ['reloaded', 'complete confection', '周年纪念版', '周年紀念版', '超值版', '加值版'],
  // compilation：playlist 也算拼盘（2026-09-17 补：Surprise Song Playlist 漏筛）
  compilation: [
    '精选',
    '精選',
    'greatest hits',
    'best of',
    'collection',
    'hits',
    '典藏',
    '精裝',
    '精装',
    'playlist',
    '歌单',
    '歌單',
  ],
  multiArtist: ['群星', '合辑', '合輯', '、', ' vs ', ' VS '],
  // karaoke：卡拉OK / 伴奏 / 纯伴奏版——不是正式专辑（2026-09-17 新增：
  //   「Taylor Swift Karaoke: 1989 (Deluxe)」曾一路夺冠，属于严重漏筛）
  /**
   * 2026-09-22 补：实测曲库里混进了「petal – the a cappellas」「petal – the instrumentals」
   * 这类**非正式专辑**（前者漏了关键词，后者本来就有 instrumentals 但那是缓存早于规则）。
   * 一并补上"纯人声 / 纯伴奏 / 清唱"的各种写法。
   */
  karaoke: [
    'karaoke',
    '卡拉ok',
    '伴唱',
    '伴奏',
    'instrumental',
    'instrumentals',
    'a cappella',
    'a cappellas',
    'acappella',
    'acapella',
    '清唱',
    '純人聲',
    '纯人声',
    '純伴奏',
    '纯伴奏',
  ],
  /**
   * 2026-09-22 新增：**幕后 / 制作特辑 / 口述**类，不是专辑作品本身。
   * 实测漏筛：「petal - making a song with ari and ilya」（幕后创作纪录）。
   * 这类条目曲目数与正式专辑一样（13 首），体量规则拦不住，只能靠名称。
   */
  documentary: [
    'making a song',
    'making of',
    'the making',
    'behind the scenes',
    'documentary',
    'commentary',
    'interview',
    'interview disc',
    '口述',
    '幕后',
    '紀錄片',
    '纪录片',
    '创作纪录',
    '創作紀錄',
  ],
  // reissue（原名 deluxe）：再版 / 加曲版 / 周年版。
  // ⚠️ 这些**不做硬性剔除**，而是靠规则 7「同名去重」在本体与再版之间保留最早那张
  //    （若某歌手只有再版没有本体，硬剔会把整张专辑弄丢，例如 Rihanna 的 ANTI 只出过 Deluxe）。
  //    这里只负责把"版本词"识别出来，供去重归一化与同日期时的优先级使用。
  deluxe: [
    'deluxe',
    '豪华',
    '豪華',
    'remaster',
    'remastered',
    '重制',
    'reissue',
    'expanded',
    'special edition',
    '限量',
    '改版',
    '紀念版',
    '纪念版',
    '復刻',
    '复刻',
    '日本盤',
    '台版',
    '港版',
    // 2026-09-18 补：用户点名的两张"已发行专辑的加曲合集版"——
    //   「Good Girl Gone Bad: Reloaded」「Teenage Dream: The Complete Confection」
    'reloaded',
    'complete confection',
    'anniversary',
    'bonus track',
    'bonus version',
    '加值',
    '加曲',
    '超值版',
  ],
};

/** 歌手名里出现"名单"特征 → 多作者专辑（Various Artists / A, B & C）。2026-09-18 新增。 */
export const MULTI_ARTIST_NAME_HINTS = [
  'various artists',
  'various artist',
  '群星',
  '合辑',
  '合輯',
  'tribute',
];

/**
 * 判断「专辑作者是不是一串人」。
 * 为什么要单列：图 8 那类「Lady Gaga, 遥恩, 巴夫, Harold Faltermeyer & Hans Zimmer」
 * 作者名本身暴露了它是拼盘，但专辑名看不出来 —— 只看专辑名会漏。
 * 保守设计（避免误杀真歌手）：
 *   · 2 个以上逗号 / 顿号 → 名单（例：Lady Gaga, A, B & C、Earth, Wind & Fire）
 *   · 1 个逗号 + ' & ' → 名单
 *   · 明确写作 feat./featuring/with 别人 → 合作曲，不算该歌手专辑
 *   · 正常含 1 个逗号或 ' & ' 的独立歌手名不算（例：Tyler, The Creator、Simon & Garfunkel）
 */
export function looksLikeArtistList(artistName) {
  const s = normalizeText(artistName);
  if (!s) return false;
  if (MULTI_ARTIST_NAME_HINTS.some((k) => s.includes(normalizeText(k)))) return true;
  const commas = (s.match(/[,、]/g) || []).length;
  if (commas >= 2) return true;
  if (commas === 1 && /\s&\s/.test(s)) return true;
  if (/\bfeat\.|\bfeaturing\b/.test(s)) return true;
  return false;
}


/** 规则序号 → 过滤原因，供前端展示"命中规则" */
export const RULE_LABELS = {
  TYPE_AND_SIZE: '类型与体量',
  ARTIST_MATCH: '署名为该歌手本人',
  NOT_LIVE: '非现场专辑',
  NOT_SOUNDTRACK: '非影视原声',
  NOT_COMPILATION: '非精选集',
  NOT_MULTI_ARTIST: '非合辑拼盘',
  NOT_KARAOKE: '非卡拉OK / 伴奏版（含纯人声、纯伴奏）',
  NOT_DOCUMENTARY: '非幕后 / 制作特辑',
  NOT_REMIX: '非混音版',
  NOT_SINGLE: '非单曲 / EP',
  NOT_REISSUE: '非再版 / 加曲版',
  NOT_ARTIST_LIST: '非多人拼盘署名',
  DEDUPE: '同名去重',
};

/**
 * 繁体 → 简体 归一化映射（覆盖专辑名高频繁体字）。
 * 关键词表只维护简体写法，也能命中繁体专辑名——例如「現場原音專輯」必须被
 * live 关键词「现场」拦下（2026-09-16 修复 Soul Power 这类演唱会专辑漏筛）。
 */
const TRAD_TO_SIMP = {
  現: '现', 場: '场', 會: '会', 選: '选', 華: '华', 輯: '辑', 裝: '装', 聲: '声',
  樂: '乐', 團: '团', 經: '经', 專: '专', 愛: '爱', 夢: '梦', 記: '记', 憶: '忆',
  願: '愿', 緣: '缘', 舊: '旧', 歲: '岁', 萬: '万', 長: '长', 詞: '词', 編: '编',
  從: '从', 來: '来', 這: '这', 個: '个', 們: '们', 時: '时', 間: '间', 對: '对',
  開: '开', 關: '关', 錄: '录', 製: '制', 電: '电', 視: '视', 劇: '剧', 語: '语',
  國: '国', 無: '无', 為: '为', 與: '与', 體: '体', 題: '题', 舉: '举', 藝: '艺',
  術: '术', 館: '馆', 書: '书', 頭: '头', 該: '该', 進: '进', 過: '过', 還: '还',
  讓: '让', 點: '点', 熱: '热', 賣: '卖', 買: '买', 錯: '错', 髮: '发', 隻: '只',
};
const TRAD_RE = new RegExp(`[${Object.keys(TRAD_TO_SIMP).join('')}]`, 'g');

/** 文本归一化：全角空格→空格、压缩空白、转小写、繁体转简体。关键词与专辑名两侧都用它比对。 */
export function normalizeText(input) {
  return String(input || '')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(TRAD_RE, (ch) => TRAD_TO_SIMP[ch]);
}

function hitKeyword(name, list) {
  const hay = normalizeText(name);
  return list.some((kw) => hay.includes(normalizeText(kw)));
}

/** 归一化专辑名：繁简/大小写归一 + 去掉括号后缀、版本后缀与标点，用于同名判定 */
export function normalizeAlbumName(name) {
  return normalizeText(name)
    .replace(/\(.*?\)|\[.*?\]|（.*?）|【.*?】/g, '')
    .replace(
      // ⚠️ 这里每加一个"版本词"，就等于把该版本与本体合并为同一张（去重时保留最早那张）。
      //    2026-09-18 用户点名的「Good Girl Gone Bad: Reloaded」「Teenage Dream: The Complete
      //    Confection」就是靠 reloaded / complete confection 两个词归一到本体的。
      /the complete confection|complete confection|deluxe|豪华|remaster(ed)?|重制|reissue|expanded|special edition|platinum edition|anniversary|限量版?|改版|紀念版|纪念版|復刻|复刻|日本盤|台版|港版|reloaded|bonus tracks?|加值|加曲|超值版/gi,
      '',
    )
    .replace(/[\s\-_·.,'"!?&/\\|:;]/g, '')
    .trim();
}

/** 单张专辑的规则 1~6 判定（规则 7 在批量处理时执行） */
export function evaluateAlbum(album, { artistExternalId, keywords = DEFAULT_KEYWORDS } = {}) {
  // 规则 1：类型与体量（必须为专辑，曲目数落在 [7, 30]）
  if (album.isAlbumType === false) return { isEligible: false, excludeReason: RULE_LABELS.TYPE_AND_SIZE };
  const tracks = Number(album.trackCount || 0);
  if (tracks < MIN_TRACK_COUNT || tracks > MAX_TRACK_COUNT) {
    return { isEligible: false, excludeReason: RULE_LABELS.TYPE_AND_SIZE };
  }
  // 规则 2：归属必须按标识比对，不可按名称
  if (artistExternalId != null && Number(album.artistExternalId) !== Number(artistExternalId)) {
    return { isEligible: false, excludeReason: RULE_LABELS.ARTIST_MATCH };
  }
  // 规则 2.5：多作者署名（Various Artists / A, B & C / feat.）—— 不是"某歌手的专辑"
  if (looksLikeArtistList(album.artistName)) {
    return { isEligible: false, excludeReason: RULE_LABELS.NOT_ARTIST_LIST };
  }
  // 规则 3~6：名称关键词
  if (hitKeyword(album.name, keywords.live)) return { isEligible: false, excludeReason: RULE_LABELS.NOT_LIVE };
  if (hitKeyword(album.name, keywords.soundtrack)) {
    return { isEligible: false, excludeReason: RULE_LABELS.NOT_SOUNDTRACK };
  }
  if (hitKeyword(album.name, keywords.compilation)) {
    return { isEligible: false, excludeReason: RULE_LABELS.NOT_COMPILATION };
  }
  if (hitKeyword(album.name, keywords.multiArtist)) {
    return { isEligible: false, excludeReason: RULE_LABELS.NOT_MULTI_ARTIST };
  }
  // 规则 6.5：卡拉OK / 伴奏 / 纯人声版（不是正式专辑）
  if (hitKeyword(album.name, keywords.karaoke)) {
    return { isEligible: false, excludeReason: RULE_LABELS.NOT_KARAOKE };
  }
  // 规则 6.55：幕后 / 制作特辑 / 口述（2026-09-22 新增）
  if (hitKeyword(album.name, keywords.documentary)) {
    return { isEligible: false, excludeReason: RULE_LABELS.NOT_DOCUMENTARY };
  }
  // 规则 6.6：混音版（2026-09-18 新增）
  if (hitKeyword(album.name, keywords.remix)) {
    return { isEligible: false, excludeReason: RULE_LABELS.NOT_REMIX };
  }
  // 规则 6.7：单曲 / EP（2026-09-18 新增）
  if (hitKeyword(album.name, keywords.single)) {
    return { isEligible: false, excludeReason: RULE_LABELS.NOT_SINGLE };
  }
  // 规则 6.8：再版 / 加曲合集版（2026-09-18 新增，用户点名）
  if (hitKeyword(album.name, keywords.reissue)) {
    return { isEligible: false, excludeReason: RULE_LABELS.NOT_REISSUE };
  }
  return { isEligible: true, excludeReason: null };
}

function isDeluxe(name, keywords) {
  return hitKeyword(name, keywords.deluxe);
}

/**
 * 批量执行七条规则。
 * @returns {{ valid: object[], excluded: object[], stats: object }}
 */
export function applyAdmission(albums, { artistExternalId = null, keywords = DEFAULT_KEYWORDS } = {}) {
  const valid = [];
  const excluded = [];

  // 规则 1~6
  const passedRules1to6 = [];
  for (const album of albums) {
    const verdict = evaluateAlbum(album, { artistExternalId, keywords });
    if (verdict.isEligible) passedRules1to6.push(album);
    else excluded.push({ album, reason: verdict.excludeReason });
  }

  // 规则 7：同名去重——同名只保留最早发行、且不带豪华版后缀的版本
  const sorted = [...passedRules1to6].sort((a, b) => {
    const ta = a.releaseDate ? new Date(a.releaseDate).getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.releaseDate ? new Date(b.releaseDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    // 发行时间相同：非豪华版优先
    return Number(isDeluxe(a.name, keywords)) - Number(isDeluxe(b.name, keywords));
  });

  const seen = new Map();
  for (const album of sorted) {
    const key = normalizeAlbumName(album.name) || `id:${album.albumId}`;
    if (seen.has(key)) {
      excluded.push({ album, reason: RULE_LABELS.DEDUPE });
      continue;
    }
    seen.set(key, album);
    valid.push(album);
  }

  return {
    valid,
    excluded,
    stats: {
      total: albums.length,
      excluded: excluded.length,
      valid: valid.length,
      // 分规则剔除数，供"共检索到 X 张，剔除 Y 张，实际参赛 Z 张"展示
      byRule: excluded.reduce((acc, item) => {
        acc[item.reason] = (acc[item.reason] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

export default {
  applyAdmission,
  evaluateAlbum,
  normalizeAlbumName,
  looksLikeArtistList,
  DEFAULT_KEYWORDS,
  RULE_LABELS,
  MIN_TRACK_COUNT,
  MAX_TRACK_COUNT,
};
