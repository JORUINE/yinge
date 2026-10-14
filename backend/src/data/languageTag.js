/**
 * 歌手 → 语种 / 地区标签（2026-09-23，用户拍板的两级筛选）
 * ============================================================
 * 用户原话："需要新增一个华语区 外语区，如果不勾选就是混在一起打"、
 *          "你目前这里的算法出来，我感觉粤语专辑好多。我们目前这个流派模式和年代模式
 *           没有达到我预想的多元化"，并在被问口径时选了
 *          **"两级：华语区/外语区 → 再分国语/粤语/日语/韩语"**。
 *
 * ⚠️ 关键决定：**标签是"派生"的，不落库、不加字段、不做迁移**。
 *    理由：`Artist` 已经有 `genre`（iTunes 中文流派标签）与 `region`（iTunes 取数地区），
 *    这两样加起来已经足以判语种；新增字段就意味着一次迁移 + 索引 + 回填，
 *    改动面大、可回退性差，而收益几乎为零。派生函数是纯函数，好测也好回退。
 *
 * 判定优先级（自上而下，先命中先返回）：
 *   ① genre 里的语种词（最准：iTunes 就按语种分了流派，如「國語流行樂」「廣東歌/香港流行樂」）
 *   ② 白名单册归属（华语新生代 = 国语；粤语/韩语/日语那几册按册判）
 *   ③ region（iTunes 取数地区：hk/mo→粤语，tw/cn/sg→国语，kr→韩语，jp→日语，其余→欧美）
 *   ④ 名字字符兜底（假名→日语、谚文→韩语、汉字→国语、其余→欧美）
 *
 * 派生的两个维度：
 *   zone = 'zh'（华语区）| 'foreign'（外语区）
 *   lang = 'mandarin' | 'cantonese' | 'japanese' | 'korean' | 'western'
 */
import {
  GENRE_WHITELIST,
  EXTRA_LISTS,
  softNameOf,
  sameArtistName,
} from './genreWhitelist.js';

/** 语种 → 大区（两级筛选的上层） */
export const ZONE_OF_LANG = {
  mandarin: 'zh',
  cantonese: 'zh',
  japanese: 'foreign',
  korean: 'foreign',
  western: 'foreign',
};

/** 语种中文名（前端展示 + 日志） */
export const LANG_CN = {
  mandarin: '国语',
  cantonese: '粤语',
  japanese: '日语',
  korean: '韩语',
  western: '欧美',
};

/** ① genre 语种词 → 语种（顺序敏感：越具体的先判，「廣東歌」必须早于「華語」） */
const GENRE_LANG = [
  [/廣東|广东|粵語|粤语|cantopop/i, 'cantonese'],
  [/韓國|韩国|k-?pop/i, 'korean'],
  [/日本|j-?pop/i, 'japanese'],
  [/國語|国语|mandopop|c-?pop/i, 'mandarin'],
  [/華語|华语|中文/i, 'mandarin'],
];

/** ③ region（iTunes 取数地区码）—— ⚠️ 只用来**细分**，不能优先于字符判定 */
const REGION_LANG = {
  kr: 'korean',
  jp: 'japanese',
};
/** ③-2 汉字名 + 这些地区 → 粤语（港澳）；其余汉字名 → 国语 */
const CANTONESE_REGIONS = new Set(['hk', 'mo']);

/**
 * ⭐⭐ 第四十批（2026-10-14）· 汉字名 ≠ 华语歌手 —— 引入「专辑标题」这条独立证据
 * ============================================================================
 * 用户报的 bug：选「华语区」却混进 Bing Crosby、Jamie xx。
 * 根因：iTunes 港区会给**欧美艺人配中文译名**（平克勞斯貝＝Bing Crosby、
 *      甸馬田＝Dean Martin、馬友友＝Yo-Yo Ma、猶太祭司合唱團＝Judas Priest），
 *      于是旧规则第 ④ 步「名字含汉字 → 判华语」把他们全放了进来。
 *
 * 用户否决了「给误伤的歌手加白名单」这种补丁法 ——
 *   "岂不是还会有很多不在白名单的歌手出问题，你必须好好思考优化这种问题"
 * ⇒ 补丁只对**已被发现的那几个**有效，库里没进名单的、以后新入库的照样错。
 *
 * 所以改成 **通用证据**：这位歌手名下的专辑标题，到底是不是中文标题。
 *   周杰倫 → 范特西 / 七里香 …………………………… 汉字为主 ⇒ 华语
 *   平克勞斯貝 → Bing & Ella / Bing & Satchmo … 全拉丁   ⇒ 不是华语
 * 这条证据对**任何歌手**都成立，不需要他进过任何名单。
 *
 * ⚠️ 实测校准（scripts/diag-album-script.mjs，全库 485 位歌手 / 6738 张专辑）：
 *   · 粤语歌手大量用英文专辑名（陳奕迅 0.43、張敬軒 0.10、衛蘭 0.07、陳柏宇 0.00）
 *     ⇒ **单看专辑标题会把陈奕迅踢出华语区**，所以标题只作**第二条**证据，
 *       且在第 ① 步（流派语种标记）之后才生效 —— 陳奕迅的流派就是「廣東歌/香港流行樂」，
 *       第 ① 步已经判对，根本走不到这里。
 *   · 真欧美（流派无语种标记者）汉字标题占比全部 ≤ 0.08；
 *     真华语（同样流派无标记者）为 0.17~0.29（布瑞吉Bridge 0.25、熊仔&豹子膽 0.25、椅子樂團 0.17）
 *     ⇒ 阈值取二者中间的 **0.15**，两侧都不误伤。
 *
 * 取向：**保守**。「不确定 ⇒ 不算华语」。
 *   漏掉一位华语歌手（他仍然出现在「不限」和其它模式里，且可被人工纠偏）＝ 小事；
 *   让欧美歌手混进华语区（用户原话"不能出现基础逻辑Bug"）＝ 事故。
 */
const HAN = /[\u4e00-\u9fff]/;
const KANA = /[\u3040-\u30ff]/;
const HANGUL = /[\uac00-\ud7af]/;
const LATIN = /[A-Za-z]/;
/** 汉字标题占比低于此值 ⇒ 认定「没有华语证据」 */
const ZH_TITLE_MIN = 0.15;
/**
 * 至少要有几张专辑才据此下结论。
 * ⚠️ 自检实测（第四十批）取 **1** 才够：
 *   年代模式下传进来的是**该年代区间内**的专辑，很多歌手在区间里只有 1 张；
 *   设成 2 的話，喜多郎 / Lady Gaga & 畢烈谷巴 / 魔力紅樂團 在区间里各只有 1 张
 *   ⇒ 拿不到证据 ⇒ 沿用旧判 ⇒ **照样漏进华语区**（实测池内仍有 5 位可疑）。
 *   取 1 会不会误伤？不会 —— 走到这一步的歌手一定**流派没有语种标记**
 *   （有标记的在第 ① 步就返回了），而粤语歌手英文专辑名那一批（陳奕迅/張敬軒/衛蘭…）
 *   流派全是「廣東歌/香港流行樂」，根本不受这条证据影响。
 */
const ZH_TITLE_MIN_ALBUMS = 1;

/** 单个标题的文字构成统计 */
function scriptStats(str) {
  let han = 0;
  let lat = 0;
  let kana = 0;
  let hangul = 0;
  for (const ch of String(str || '')) {
    if (HAN.test(ch)) han += 1;
    else if (KANA.test(ch)) kana += 1;
    else if (HANGUL.test(ch)) hangul += 1;
    else if (LATIN.test(ch)) lat += 1;
  }
  return { han, lat, kana, hangul };
}

/** 这个标题算不算「中文标题」：汉字为主，且不是日文（含假名）标题 */
export function isHanTitle(title) {
  const s = scriptStats(title);
  if (s.kana > 0 || s.hangul > 0) return false;
  return s.han > 0 && s.han > s.lat;
}

/**
 * 汇总一位歌手名下专辑标题的文字属性。
 * @param {string[]|null|undefined} albumNames
 * @returns {{n:number, hanN:number, ratio:number, kanaN:number, hangulN:number}}
 */
export function albumScriptStats(albumNames) {
  const list = Array.isArray(albumNames) ? albumNames : [];
  let hanN = 0;
  let kanaN = 0;
  let hangulN = 0;
  for (const t of list) {
    const s = scriptStats(t);
    if (isHanTitle(t)) hanN += 1;
    if (s.kana > 0) kanaN += 1;
    if (s.hangul > 0) hangulN += 1;
  }
  return {
    n: list.length,
    hanN,
    kanaN,
    hangulN,
    ratio: list.length ? hanN / list.length : 0,
  };
}

/** ② 哪些白名单册属于哪个语种（做成 Map，避免每次遍历全表）。
 *  **顺序即优先级**：越具体的语种册子排越前。 */
const LIST_LANG = [
  ['广东歌香港流行乐', 'cantonese'],
  ['国语流行乐', 'mandarin'],
  ['华语新生代', 'mandarin'],
  ['韩国流行乐', 'korean'],
  ['日本流行乐', 'japanese'],
];
const NAME_LANG = new Map();
for (const [listKey, lang] of LIST_LANG) {
  const names = GENRE_WHITELIST[listKey] || EXTRA_LISTS[listKey] || [];
  // ⚠️ **先写先赢**（不覆盖）：陈奕迅同时在「广东歌香港流行乐」与「国语流行乐」两册里，
  //    后写会把他判成国语 —— 而他是粤语歌手。
  for (const n of names) {
    const k = softNameOf(n);
    if (!NAME_LANG.has(k)) NAME_LANG.set(k, lang);
  }
}

/**
 * 派生一位歌手的语种。
 *
 * ⚠️ 自检抓出来的坑（2026-09-23）：`region` 是 **iTunes 取数地区**，不是歌手国籍 ——
 *    本项目很多欧美歌手是经 hk 区同步进来的，`region` 也是 'hk'。
 *    所以绝不能"region 优先"：那会把 Pink Floyd 判成粤语、把外语区池子清空
 *    （自检实测：外语区只剩 1 位歌手）。现在 region 只做**细分**：
 *      · 拉丁名 + kr/jp → 韩语/日语
 *      · 汉字名 + hk/mo → 粤语；汉字名 + 其它 → 国语
 *
 * ⚠️ 第四十批（2026-10-14）：汉字名**不再单独**作为华语证据 —— 见 `ZH_TITLE_MIN` 处注释。
 *    iTunes 港区给欧美艺人配中文译名，只要名字里有汉字就判华语，欧美必然漏进来。
 *    现在汉字名要**再过一道专辑标题证据**（`albumNames` 由调用方传入）：
 *      专辑标题几乎全是拉丁字母 ⇒ 判他不是华语（再按假名/谚文/地区细分日韩欧美）
 *    调用方拿不到专辑数据时（如 genreExpand 搜歌手、人格画像）传 null，
 *    行为与改动前**完全一致** —— 那两处不决定"能不能进华语区池子"，风险可控。
 *
 * @param {{genre?: string, region?: string, name?: string}} artist
 * @param {string[]|null} [albumNames] 该歌手名下专辑标题（可选的第二证据）
 * @returns {'mandarin'|'cantonese'|'japanese'|'korean'|'western'}
 */
export function languageTagOf(artist = {}, albumNames = null) {
  // ① 流派语种词：iTunes 自己按语种分的流派，最准，先命中先返回
  const g = String(artist.genre || '');
  for (const [re, lang] of GENRE_LANG) {
    if (re.test(g)) return lang;
  }
  // ② 人工名单册归属（华语新生代 / 广东歌… / 韩国流行乐 …）
  const n = String(artist.name || '');
  const byName = NAME_LANG.get(softNameOf(n));
  if (byName) return byName;
  /**
   * ②-2 别名归属（第四十批）
   * ------------------------------------------------------------
   * 库里的歌手是 iTunes **港区**写法（防彈少年團），而名单册写的是 **BTS** ——
   * 只比 `name` 会漏。好在项目灌库时已经把名单写法回写进 `aliases`
   * （见 Artist 模型的 aliases 字段注释），这里顺手也按别名查一遍。
   * ⚠️ 这不是"给某个歌手打补丁"：别名是**灌库时自动生成**的通用数据，
   *    任何一位被名单收录的歌手都会带上，不需要人工逐个补。
   */
  if (Array.isArray(artist.aliases)) {
    for (const al of artist.aliases) {
      const byAlias = NAME_LANG.get(softNameOf(al));
      if (byAlias) return byAlias;
    }
  }

  const r = String(artist.region || '').toLowerCase();
  if (KANA.test(n)) return 'japanese'; // 假名
  if (HANGUL.test(n)) return 'korean'; // 谚文
  if (HAN.test(n)) {
    const zh = CANTONESE_REGIONS.has(r) ? 'cantonese' : 'mandarin';
    const ev = zhEvidenceFromAlbums(albumNames, r);
    // 证据不足 ⇒ 不确定就不算华语，按外语细分（杜绝欧美混进华语区）
    return ev.zh ? zh : ev.lang;
  }
  return REGION_LANG[r] || 'western'; // 拉丁名：只认 kr/jp，其余（含 hk）都算欧美
}

/**
 * 「这位歌手到底是不是华语」—— 专辑标题证据（第四条，2026-10-14）
 * ------------------------------------------------------------
 * 只在**前面三条都没判出来**（流派没语种标记、不在人工名单、名字又是汉字）时才用到。
 *
 * @param {string[]|null} albumNames
 * @param {string} region
 * @returns {{zh: boolean, lang?: string, reason: string}}
 */
function zhEvidenceFromAlbums(albumNames, region) {
  if (!Array.isArray(albumNames) || albumNames.length < ZH_TITLE_MIN_ALBUMS) {
    // 库里没有足够的专辑 ⇒ 不做判断，维持原判（不惩罚"没数据"）
    return { zh: true, reason: 'no-data' };
  }
  const st = albumScriptStats(albumNames);
  if (st.ratio >= ZH_TITLE_MIN) {
    return { zh: true, reason: 'han-titles', st };
  }
  // 汉字名，专辑却几乎没有中文标题 ⇒ 极可能是被 iTunes 译了名的外语歌手
  /**
   * ⚠️ 这里**不**用"标题带假名/谚文 ⇒ 日韩"这条推断 —— 实测证明它不成立
   *   （scripts/verify-language-filter.mjs【8】，全库真数据）：
   *     日语歌手：米津玄師 0.00、星野源 0.00、藤井風 0.00、宇多田光 0.08
   *     欧美歌手：魔力紅樂團(Maroon 5) 0.08 —— 因为欧美专辑也有日本盘特供名
   *   ⇒ 两组**重叠**，任何阈值都分不开。用它是"看似有据、实则瞎猜"。
   *
   *   好在**不影响本次要修的问题**：日韩与欧美同属「外语区」，
   *   判成 western 一样能把他们挡在华语区外（久石讓/喜多郎/菅野洋子 此前判 cantonese
   *   —— 那是**漏进华语区**，现在都回到外语区了）。
   *   至于「外语区 + 日语」这个子筛选会漏掉这几位，是**既有的、可人工纠偏**的缺口，
   *   不值得为此引入一个被数据证伪的判据。真要修，正路是给流派/名单册补人，不是猜。
   */
  if (REGION_LANG[region]) return { zh: false, lang: REGION_LANG[region], reason: 'region', st };
  return { zh: false, lang: 'western', reason: 'latin-titles', st };
}

/** 语种 → 大区 */
export function zoneOfLang(lang) {
  return ZONE_OF_LANG[lang] || 'foreign';
}

/**
 * 这个歌手是否通过「地区/语种」筛选。
 * ⚠️ 语义（用户原话"不勾选就是混在一起打"）：
 *   · zone 为空            → 全部通过（混着打，与改动前行为完全一致）
 *   · zone='zh' 且 lang 空 → 只要华语区（国语 + 粤语）
 *   · zone='foreign' 且 lang 空 → 只要外语区（日语 + 韩语 + 欧美）
 *   · lang 非空            → 只保留该语种（此时 zone 只做一致性校验，不额外收窄）
 * @param {string} lang 该歌手的语种
 * @param {{zone?: string, lang?: string}} filter
 */
export function passesLanguageFilter(lang, { zone, lang: wantLang } = {}) {
  if (wantLang) return lang === wantLang;
  if (!zone) return true;
  return zoneOfLang(lang) === zone;
}

/**
 * 「华语区但不选子语种」时的池内均衡（治用户报的"粤语专辑好多"）。
 * ------------------------------------------------------------
 * 单纯按语种过滤成 "zh" 之后，本地库里粤语歌手仍然远多于国语 —— 池子还是会偏粤语。
 * 所以这里对**已选出的桶**按语种交错：国语、粤语、国语、粤语…… 轮流上。
 * 与"白名单大牌 2:1 交错"同一个思路：只调顺序，不动张数。
 * @param {Array<{lang: string}>} buckets 已按语种标记的桶
 */
export function interleaveByLang(buckets) {
  const groups = new Map();
  for (const b of buckets) {
    const k = b.lang || 'western';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  const keys = [...groups.keys()].sort(); // 稳定顺序，结果可复现
  const out = [];
  let more = true;
  while (more) {
    more = false;
    for (const k of keys) {
      const g = groups.get(k);
      if (g.length) {
        out.push(g.shift());
        more = true;
      }
    }
  }
  return out;
}

export { sameArtistName };
