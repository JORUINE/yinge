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
 * @param {{genre?: string, region?: string, name?: string}} artist
 * @returns {'mandarin'|'cantonese'|'japanese'|'korean'|'western'}
 */
export function languageTagOf(artist = {}) {
  const g = String(artist.genre || '');
  for (const [re, lang] of GENRE_LANG) {
    if (re.test(g)) return lang;
  }
  const n = String(artist.name || '');
  const byName = NAME_LANG.get(softNameOf(n));
  if (byName) return byName;
  const r = String(artist.region || '').toLowerCase();
  if (/[\u3040-\u30ff]/.test(n)) return 'japanese'; // 假名
  if (/[\uac00-\ud7af]/.test(n)) return 'korean'; // 谚文
  if (/[\u4e00-\u9fff]/.test(n)) {
    return CANTONESE_REGIONS.has(r) ? 'cantonese' : 'mandarin'; // 汉字
  }
  return REGION_LANG[r] || 'western'; // 拉丁名：只认 kr/jp，其余（含 hk）都算欧美
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
