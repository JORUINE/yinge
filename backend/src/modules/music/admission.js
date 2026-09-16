/**
 * 专辑准入过滤（七条规则）
 * ------------------------------------------------------------
 * 对应《系统设计文档》4.3。规则 3~6 通过名称关键词匹配实现，
 * 关键词集合集中配置、可在后台维护。规则 7（同名去重）需要跨专辑上下文，
 * 在 applyAdmission 中统一处理。
 */

export const MIN_TRACK_COUNT = 7;

/** 名称关键词集合（规则 3~6 使用），后续可由后台维护 */
export const DEFAULT_KEYWORDS = {
  live: ['live', '现场', '演唱會', '演唱会', 'concert', 'unplugged', 'acoustic live'],
  soundtrack: ['ost', 'original soundtrack', 'soundtrack', '原声', '电影原声', '配乐', '主題曲', '主题曲'],
  compilation: ['精选', '精選', 'greatest hits', 'best of', 'collection', 'hits', '典藏', '精裝', '精装'],
  multiArtist: ['群星', '合辑', '合輯', '、', ' vs ', ' VS '],
  deluxe: ['deluxe', '豪华', '豪華', 'remaster', 'remastered', '重制', 'reissue', 'expanded', 'special edition', '限量'],
};

/** 规则序号 → 过滤原因，供前端展示"命中规则" */
export const RULE_LABELS = {
  TYPE_AND_SIZE: '类型与体量',
  ARTIST_MATCH: '署名为该歌手本人',
  NOT_LIVE: '非现场专辑',
  NOT_SOUNDTRACK: '非影视原声',
  NOT_COMPILATION: '非精选集',
  NOT_MULTI_ARTIST: '非合辑拼盘',
  DEDUPE: '同名去重',
};

function hitKeyword(name, list) {
  const lower = String(name || '').toLowerCase();
  return list.some((kw) => lower.includes(String(kw).toLowerCase()));
}

/** 归一化专辑名：去掉括号后缀、版本后缀与标点，用于同名判定 */
export function normalizeAlbumName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]|（.*?）|【.*?】/g, '')
    .replace(
      /deluxe|豪华|豪華|remaster(ed)?|重制|reissue|expanded|special edition|platinum edition|anniversary|限量版?/gi,
      '',
    )
    .replace(/[\s\-_·.,'"!?&/\\|:;]/g, '')
    .trim();
}

/** 单张专辑的规则 1~6 判定（规则 7 在批量处理时执行） */
export function evaluateAlbum(album, { artistExternalId, keywords = DEFAULT_KEYWORDS } = {}) {
  // 规则 1：类型与体量（必须为专辑且曲目数不少于 7）
  if (album.isAlbumType === false) return { isEligible: false, excludeReason: RULE_LABELS.TYPE_AND_SIZE };
  if (Number(album.trackCount || 0) < MIN_TRACK_COUNT) {
    return { isEligible: false, excludeReason: RULE_LABELS.TYPE_AND_SIZE };
  }
  // 规则 2：归属必须按标识比对，不可按名称
  if (artistExternalId != null && Number(album.artistExternalId) !== Number(artistExternalId)) {
    return { isEligible: false, excludeReason: RULE_LABELS.ARTIST_MATCH };
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

export default { applyAdmission, evaluateAlbum, normalizeAlbumName, DEFAULT_KEYWORDS, RULE_LABELS, MIN_TRACK_COUNT };
