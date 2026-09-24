/**
 * 对决服务
 * ------------------------------------------------------------
 * 对应接口：B-01 创建 / B-02 详情 / B-03 下一场 / B-05 复活赛 / B-06 结果 / B-07 我的对决 / B-08 删除
 * 赛制规则见《系统设计文档》第四章；本文件只做编排，赛制数学在 bracket.js。
 */
import {
  Battle,
  BattleMatch,
  Album,
  Artist,
  Track,
  Vote,
  BattleGroup,
  User,
} from '../../models/index.js';
import config from '../../config/index.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  TooFrequentError,
  DuplicateError,
} from '../../shared/errors.js';
import { parsePagination } from '../../shared/http.js';
import * as musicService from '../music/music.service.js';
import { ensureEraPool } from '../music/eraExpand.js';
// 白名单「知名歌手」判定 + 策展流派：流派/年代池轮转取张时让大牌排在前面（只调顺序，不动张数/公式）
import {
  isWhitelistedArtist,
  sameArtistName,
  canonicalGenreKey,
  whitelistNamesFor,
} from '../../data/genreWhitelist.js';
// 语种/地区两级筛选（2026-09-23 用户拍板）：标签是派生的，不落库、不迁移
import { languageTagOf, passesLanguageFilter, interleaveByLang } from '../../data/languageTag.js';
import { normalizeGenre } from '../music/genreExpand.js';
import * as bracket from './bracket.js';

const byReleaseThenId = (a, b) => {
  const ta = a.releaseDate ? new Date(a.releaseDate).getTime() : Number.MAX_SAFE_INTEGER;
  const tb = b.releaseDate ? new Date(b.releaseDate).getTime() : Number.MAX_SAFE_INTEGER;
  return ta - tb || a.albumId - b.albumId;
};

/**
 * 「知名歌手优先」的桶排序（2026-09-23 用户拍板：白名单要影响流派/年代模式）
 * ------------------------------------------------------------
 * 背景：用户同时要两个目标 —— ① 要有大牌（"一个出名的大牌歌手都没有"）② 要多元。
 * 若纯粹把白名单歌手全排前面，年代池（本地 1100+ 张专辑）每次都会被同一批
 * 港台大牌填满 —— 大牌有了，多样性没了。自检实测到过这个副作用。
 *
 * 做法：**2:1 交错** —— 大牌、大牌、其他、大牌、大牌、其他…… 于是 cap 个名额里
 * 约 2/3 是白名单大牌、1/3 留给其余歌手，两个目标同时满足。
 *
 * ⚠️ 只影响**顺序**：张数、封顶（ERA_MAX_POOL / 32）、赛程公式一律不动。
 * @param {Array<[number, Array]>} entries byArtist 的 [artistId, albums] 列表
 * @param {Map<number,string>} nameById artistId → 歌手名
 */
function orderBucketsForPool(entries, nameById) {
  const famous = [];
  const others = [];
  for (const [id, bucket] of entries) {
    /**
     * ⚠️ 2026-09-23 用户报「pop 流派全是这几张专辑，甚至出现顺序都一样」（测了三次都一样）——
     * 因为轮转取张拿的是每个歌手 bucket 的**第一张**（按发行时间升序），池子完全确定。
     * 这里先洗牌再轮转，于是每次开局抽到的专辑不同（保留"盲盒"手感）。
     * 只影响**选哪张**，不影响歌手轮转的公平性与张数。
     */
    const target = isWhitelistedArtist(nameById.get(id) || '') ? famous : others;
    target.push(shuffle(bucket));
  }
  const out = [];
  let fi = 0;
  let oi = 0;
  while (fi < famous.length || oi < others.length) {
    for (let k = 0; k < 2 && fi < famous.length; k += 1) out.push(famous[fi++]);
    if (oi < others.length) out.push(others[oi++]);
  }
  return out;
}

/** Fisher–Yates 洗牌（不改原数组） */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 需要「跨歌手对局」的范围模式（《系统设计文档》4.4 规则 2）。
 * 这些模式下**同一歌手的专辑不互相对决**：小组赛分组保证同组歌手互不相同，
 * 淘汰赛每位歌手至多 1 张。只有单歌手模式允许"自己打自己"
 * （因为池子里本来就只有一位歌手），手动挑选模式尊重用户自己的选择。
 */
const CROSS_ARTIST_SCOPES = new Set(['multi-artist', 'genre', 'era']);
export const isCrossArtistScope = (scopeType) => CROSS_ARTIST_SCOPES.has(scopeType);

/**
 * 流派/年代模式参赛池上限。
 * 2026-09-23 第十二批（用户拍板）：**32 → 48**，与前端档位 16/24/32/48 对齐。
 * 安全性：赛程公式 planTournament 是纯函数，48 张 → 12 组 × 4、晋级 24 → 淘汰轮 32（r32）
 *   → 复活补 8。qualified 上限 = 2·ceil(t/4) ≤ 24（t≤48），knockoutSize ≤ 32，
 *   不会超过 KO_NAMES 的 r32（≥64 张才会需要 r64，本上限留足余量）。
 */
export const ERA_MAX_POOL = 48;

/**
 * 多歌手混战的总池上限（2026-09-19 修正）。
 * ⚠️ 历史教训：修「取最小值」bug 时我曾把这里写成 MAX_POOL=32 —— 那是**顺手改了玩法**，
 *    直接把用户"5 位歌手 × 每位 10 张、40 多场"的大场砍没了（用户原话：
 *    "修复bug不能破坏改变已经好了的玩法 这也是规则 而且你没问我"）。
 *    多歌手模式本来就允许超 32（5×10=50 张），上限与「自选专辑最多 100 张」对齐 = 100。
 *    单歌手档位（最大 32）维持原样不动；流派/年代模式上限见 ERA_MAX_POOL（2026-09-23 起为 48）。
 */
export const MULTI_POOL_MAX = 100;

/** 新赛制（tournamentVersion=2）淘汰赛轮次名顺序（与 BattleMatch.ROUND_NAMES 对齐） */
export const KO_NAMES = ['r32', 'r16', 'qf', 'semi', 'final'];

/** 淘汰赛下一轮名：final 之后返回 null */
export function nextRoundName(name) {
  const i = KO_NAMES.indexOf(name);
  if (i < 0 || i === KO_NAMES.length - 1) return null;
  return KO_NAMES[i + 1];
}

/**
 * 场次所属「阶段」序号 —— 用于撤销时判断"哪些场次必须跟着一起撤掉"。
 *   0 = 小组赛 / 对位赛 / 指定对决（同一批勾选或同一批指定产生，属同一阶段）
 *   1 = 遗珠复活
 *   2+ = 淘汰赛各轮（r32 → final 依次递增）
 *
 * ⚠️ 绝不能用 `matchOrder` 大小来判断"更晚的阶段"：**同一轮内的兄弟场次 matchOrder 也是递增的**，
 *    按序号删会把同轮的兄弟场次一起删掉 → 剩下"半决赛只有 1 场"的残缺轮次 →
 *    推进逻辑误判该轮已投完 → 用 1 个胜者生成决赛（轮空场，无法投票）→ 对局永久卡在
 *    「本轮已投完，正在生成下一轮对阵…」（2026-09-18 用户报的卡死 bug，根因即此）。
 */
export function stageRankOf(match) {
  const name = match?.roundName;
  if (name === 'revival') return 1;
  const i = KO_NAMES.indexOf(name);
  if (i >= 0) return 2 + i;
  return 0; // group / duel / aligned
}

/** 取某歌手的合格专辑（已缓存优先，必要时同步） */
async function eligibleAlbumsOf(artistExternalId) {
  const { albums } = await musicService.getArtistAlbums(artistExternalId);
  return albums.filter((a) => a.isEligible).sort(byReleaseThenId);
}

/** 取歌手元信息（artists 子文档要求 name 必填，缺失时给占位名避免校验失败） */
async function artistMeta(artistExternalId) {
  const id = Number(artistExternalId);
  const doc = await Artist.findOne({ artistId: id }).select('name albumCount');
  return { artistId: id, name: doc?.name || `歌手 ${id}`, albumCount: doc?.albumCount || 0 };
}

/**
 * 从某歌手的合格专辑里挑出参赛的那几张。
 * ------------------------------------------------------------
 * 背景（2026-09-17 用户反馈）：以前一律 `slice(0, N)` = 取**最早**的 N 张，
 * 导致专辑超过 N 张的歌手，后面的专辑永远没机会参赛。现在改为可控：
 *   pick = 'picked' → 用用户勾选的 albumIds（自选）
 *   pick = 'newest' → 发行时间倒序取最新 N 张
 *   pick = 'random'（默认）→ 洗牌随机取 N 张（保留"盲盒"的刺激感）
 * @param {Array} list 该歌手的合格专辑（已按发行时间升序）
 * @param {number} count 目标张数
 * @param {{pick?: string, albumIds?: Array}} opts
 */
function pickAlbums(list, count, { pick = 'random', albumIds = null } = {}) {
  if (albumIds && albumIds.length) {
    const wanted = new Set(albumIds.map(Number));
    const picked = list.filter((a) => wanted.has(Number(a.albumId)));
    if (picked.length) return picked;
  }
  if (!count || count >= list.length) return list;
  if (pick === 'newest') {
    return [...list]
      .sort((a, b) => new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0))
      .slice(0, count);
  }
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

/** 依据范围模式解析参赛池 */
export async function resolvePool(payload) {
  const { scopeType } = payload;

  if (scopeType === 'artist') {
    const list = await eligibleAlbumsOf(payload.artistId);
    const take = pickAlbums(list, payload.albumCount, payload);
    const meta = await artistMeta(payload.artistId);
    return { albums: take, artists: [{ ...meta, albumCount: take.length }] };
  }

  if (scopeType === 'multi-artist') {
    // 跨歌手对决：各歌手按所选张数抽（该歌手合格专辑不够就出几张），再全局封顶 32。
    // ⚠️ 2026-09-19 严重 bug 修复：以前在这里"取所有歌手的最小值"再统一截断 ——
    //    只要有一位歌手只有 1 张合格专辑（例如某位歌手在店里只有一张正式专辑），
    //    其他歌手的池子也会被拖到 1 张 → 5 位歌手只出 5 张 → 5 场就"比完了"。
    //    用户原话："这种严重Bug马上修复吸取经验 以后绝对不能再有"。
    //    同室操戈本来就允许（界面上有标注），没必要为了配对把整个池子砍掉。
    const lists = [];
    const metas = [];
    for (const item of payload.artists) {
      const list = await eligibleAlbumsOf(item.artistId);
      // 每位歌手按同一策略抽（可各自自选：item.albumIds）
      const take = pickAlbums(list, item.albumCount, {
        pick: payload.pick,
        albumIds: item.albumIds || (payload.artists.length === 1 ? payload.albumIds : null),
      });
      const meta = await artistMeta(item.artistId);
      if (!take.length) throw new BadRequestError(`歌手「${meta.name}」没有可参赛的合格专辑`);
      lists.push(take);
      metas.push(meta);
    }
    if (lists.length < 2) throw new BadRequestError('多歌手混战至少需要 2 位歌手');

    // 每位歌手的目标张数（合格专辑不够就出几张）
    const targets = payload.artists.map((it, i) =>
      Math.max(1, Math.min(Number(it?.albumCount) || bracket.DEFAULT_PER_ARTIST, lists[i].length)),
    );
    // 总池封顶 100（与「自选专辑最多 100 张」同一口径）—— **不是 32**：
    // 5 位歌手 × 每位 10 张 = 50 张、40 多场的大场是用户一直在玩的玩法，必须保住。
    const total = Math.min(MULTI_POOL_MAX, targets.reduce((a, b) => a + b, 0));
    // 轮转取张（每位歌手轮流出一张）：既不挤掉任何歌手，也不会某一位独占池子
    const cursors = lists.map(() => 0);
    const picked = [];
    let progressed = true;
    while (picked.length < total && progressed) {
      progressed = false;
      for (let i = 0; i < lists.length; i += 1) {
        if (picked.length >= total) break;
        if (cursors[i] >= targets[i]) continue; // 这位歌手的目标张数已够
        const next = lists[i][cursors[i]];
        cursors[i] += 1;
        picked.push(next);
        progressed = true;
      }
    }
    const artists = metas.map((m, i) => ({
      artistId: m.artistId,
      name: m.name,
      albumCount: cursors[i],
    }));
    return { albums: picked, artists };
  }

  if (scopeType === 'custom') {
    const list = await Album.find({ albumId: { $in: payload.albumIds.map(Number) } });
    if (list.length !== payload.albumIds.length) throw new BadRequestError('存在无效的专辑标识');
    return { albums: list.sort(byReleaseThenId), artists: [] };
  }

  if (scopeType === 'genre') {
    const term = String(payload.genre || '').trim();
    /**
     * ⚠️ 2026-09-23 用户定调「流派 = 白名单这一册人」，所以组池也按**白名单名字**匹配已缓存歌手，
     * 不再按 iTunes 流派标签 —— 否则「華語 Hip-Hop」白名单那 15 位（蛋堡 / GAI / MC HotDog…）
     * 标签各不相同，会被漏掉、只数到 3 位（用户报的"显示只有 3 个歌手，但是都入库了"）。
     * 这一处与 listGenres 的计数、whitelistNamesFor 的取册**三处同口径**。
     * 表外流派（你手输的、白名单没覆盖的写法）才退回按规范键全等匹配。
     */
    const wlNames = whitelistNamesFor(term, normalizeGenre);
    const all = await Artist.find({}).select('artistId name genre region').lean();
    let matched;
    if (wlNames.length) {
      matched = all.filter((a) => wlNames.some((n) => sameArtistName(a.name, n)));
      if (!matched.length) {
        throw new BadRequestError(
          `「${term}」这册名单里的歌手还没进曲库 —— 先在上方点「一键补知名歌手」把这册人加进曲库再回来`,
        );
      }
    } else {
      const wantKey = canonicalGenreKey(term);
      matched = all.filter((a) => canonicalGenreKey(a.genre) === wantKey);
      if (!matched.length) {
        // 把话说清楚：流派 = 已缓存歌手的 iTunes 流派标签，不是全网搜索
        throw new BadRequestError(
          `曲库里还没有归类到「${term}」的歌手。流派取自 iTunes 的歌手流派标签，只覆盖已缓存进曲库的歌手 —— 先在上方点「一键补知名歌手」再回来，或换个流派词`,
        );
      }
    }
    const ids = matched.map((a) => a.artistId);
    const list = await Album.find({ artistExternalId: { $in: ids }, isEligible: true }).sort({
      releaseDate: 1,
    });

    // 与年代模式完全同口径（2026-09-18 修复）：此前流派分支直接返回全量且 albumCount=0，
    // ①池子可能远超 32 破坏赛程公式 ②跨歌手分组退化 ③专辑多的歌手挤掉别人。
    const byArtist = new Map();
    for (const al of list) {
      const key = Number(al.artistExternalId);
      if (!byArtist.has(key)) byArtist.set(key, []);
      byArtist.get(key).push(al);
    }

    // 各歌手轮转取一张封顶（默认 32）：既压住规模，又保证流派池里歌手足够多、谁也不挤谁
    const cap = Math.max(4, Math.min(Number(payload.albumCount) || ERA_MAX_POOL, ERA_MAX_POOL));
    const nameById = new Map(matched.map((a) => [a.artistId, a.name]));
    const langById = new Map(matched.map((a) => [a.artistId, languageTagOf(a)]));

    /**
     * 地区/语种筛选（2026-09-23 用户拍板「两级：华语区/外语区 → 再分语种」，不勾＝混着打）。
     * ⚠️ 不传 zone/lang 时全部通过 —— 与改动前行为**完全一致**，老组合、老局面不受影响。
     */
    const langFilter = { zone: payload.zone, lang: payload.lang };
    let entries = [...byArtist.entries()].filter(([id]) =>
      passesLanguageFilter(langById.get(id) || 'western', langFilter),
    );
    if (!entries.length) {
      throw new BadRequestError('这个流派里没有符合所选语种/地区的专辑，放宽筛选或换个流派试试');
    }
    /**
     * 「华语区」但不选子语种时：按语种交错，治用户报的"粤语专辑好多"。
     * 先交错语种，再让白名单大牌靠前（2:1）—— 两个目标互不冲突：交错决定"谁和谁交替"，
     * 大牌靠前决定"谁先上"。⚠️ 只调顺序，不动张数/封顶。
     */
    if (langFilter.zone === 'zh' && !langFilter.lang) {
      entries = interleaveByLang(
        entries.map(([id, bucket]) => ({ id, bucket, lang: langById.get(id) || 'western' })),
      ).map((x) => [x.id, x.bucket]);
    }
    /**
     * ⚠️ 2026-09-23 用户拍板「白名单要影响流派模式」：
     * 轮转取张时让白名单大牌靠前（2:1 交错，见 orderBucketsForPool）。
     * 只调顺序：张数、封顶、赛程公式一律不动。
     */
    const buckets = orderBucketsForPool(entries, nameById);
    const picked = [];
    let progressed = true;
    while (picked.length < cap && progressed) {
      progressed = false;
      for (const bucket of buckets) {
        if (picked.length >= cap) break;
        const next = bucket.shift();
        if (next) {
          picked.push(next);
          progressed = true;
        }
      }
    }
    picked.sort(byReleaseThenId);

    const countById = new Map();
    for (const al of picked) {
      const key = Number(al.artistExternalId);
      countById.set(key, (countById.get(key) || 0) + 1);
    }
    const artists = [...countById.keys()].map((id) => ({
      artistId: id,
      name: nameById.get(id) || `歌手 ${id}`,
      albumCount: countById.get(id),
    }));

    return { albums: picked, artists };
  }

  if (scopeType === 'era') {
    // #84 年代池自动补足：本地区间内合格专辑不够就按已知歌手重同步整张碟（详见 eraExpand.js）。
    // 先按用户选的张数算好 cap，再让 ensureEraPool 把池子撑到够（失败/不可达就退化为本地有多少给多少）。
    const cap = Math.max(4, Math.min(Number(payload.albumCount) || ERA_MAX_POOL, ERA_MAX_POOL));
    await ensureEraPool(payload.startYear, payload.endYear, cap);

    const filter = { isEligible: true };
    if (payload.startYear || payload.endYear) {
      filter.releaseDate = {};
      if (payload.startYear) filter.releaseDate.$gte = new Date(`${payload.startYear}-01-01`);
      if (payload.endYear) filter.releaseDate.$lte = new Date(`${payload.endYear}-12-31`);
    }
    const list = await Album.find(filter).sort({ releaseDate: 1 });
    if (!list.length) throw new BadRequestError('该年代区间内没有合格的专辑，请放宽年份范围');

    // 年代模式的歌手必须由「命中的专辑」反推（2026-09-17 修复 A5）：
    // 之前这里返回 artists: []，于是跨歌手分组拿到"歌手数 = 0"→ 组容量退化成 1
    // → 一场对阵都排不出 → 必然抛"这些专辑无法组成跨歌手对局"，等于该模式不可用。
    const byArtist = new Map();
    for (const al of list) {
      const key = Number(al.artistExternalId);
      if (!byArtist.has(key)) byArtist.set(key, []);
      byArtist.get(key).push(al);
    }

    // 参赛池封顶 + 歌手均衡：按"各歌手轮转取一张"挑选，专辑多的歌手不会挤掉专辑少的，
    // 既把规模压在 ERA_MAX_POOL 以内，又保证池子里歌手足够多（跨歌手对阵才有得打）。
    const eraDocs = await Artist.find({ artistId: { $in: [...byArtist.keys()] } }).select(
      'artistId name genre region',
    );
    const eraNameById = new Map(eraDocs.map((d) => [d.artistId, d.name]));
    const eraLangById = new Map(eraDocs.map((d) => [d.artistId, languageTagOf(d)]));

    /**
     * 地区/语种筛选（2026-09-23 用户拍板）。年代区间横跨所有地区，本地库里港台歌手格外多，
     * 这正是用户报"粤语专辑好多"的场景 —— 所以这里是最需要这道筛的地方。
     * ⚠️ 不传 zone/lang 时全部通过，与改动前行为完全一致。
     */
    const eraLangFilter = { zone: payload.zone, lang: payload.lang };
    let eraEntries = [...byArtist.entries()].filter(([id]) =>
      passesLanguageFilter(eraLangById.get(id) || 'western', eraLangFilter),
    );
    if (!eraEntries.length) {
      throw new BadRequestError('该年代区间内没有符合所选语种/地区的专辑，放宽筛选或放宽年份');
    }
    // 选「华语区」但不选子语种时按语种交错，不让粤语独占（与流派分支同口径）
    if (eraLangFilter.zone === 'zh' && !eraLangFilter.lang) {
      eraEntries = interleaveByLang(
        eraEntries.map(([id, bucket]) => ({ id, bucket, lang: eraLangById.get(id) || 'western' })),
      ).map((x) => [x.id, x.bucket]);
    }
    /**
     * ⚠️ 2026-09-23 用户拍板「白名单要影响年代模式」+ 用户报「粤语专辑好多 / 一个大牌都没有」：
     * 轮转取张时让白名单大牌靠前（2:1 交错，见 orderBucketsForPool）——
     * 既让大牌进池，又保留 1/3 名额给其余歌手，不至于每次都同一批人。
     * ⚠️ 只调**顺序**：张数、封顶、赛程公式一律不动。
     */
    const buckets = orderBucketsForPool(eraEntries, eraNameById);
    const picked = [];
    let progressed = true;
    while (picked.length < cap && progressed) {
      progressed = false;
      for (const bucket of buckets) {
        if (picked.length >= cap) break;
        const next = bucket.shift();
        if (next) {
          picked.push(next);
          progressed = true;
        }
      }
    }
    picked.sort(byReleaseThenId);

    const countById = new Map();
    for (const al of picked) {
      const key = Number(al.artistExternalId);
      countById.set(key, (countById.get(key) || 0) + 1);
    }
    const artists = [...countById.keys()].map((id) => ({
      artistId: id,
      name: eraNameById.get(id) || `歌手 ${id}`,
      albumCount: countById.get(id),
    }));

    return { albums: picked, artists };
  }

  if (scopeType === 'aligned') {
    const perArtist = [];
    const artists = [];
    for (const item of payload.artists) {
      const list = await eligibleAlbumsOf(item.artistId);
      const take = list.slice(0, payload.alignCount);
      perArtist.push(take);
      const meta = await artistMeta(item.artistId);
      artists.push({ ...meta, albumCount: take.length });
    }
    return { albums: perArtist.flat(), artists, alignedLists: perArtist };
  }

  if (scopeType === 'duel') {
    // 指定对决：用户逐行指定对位组，每组两张专辑直接单挑，可跨歌手与年代
    const flat = payload.pairs.flat().map(Number);
    const docs = await Album.find({ albumId: { $in: flat } });
    const byExt = new Map(docs.map((d) => [d.albumId, d]));
    const duelPairs = [];
    for (const [a, b] of payload.pairs) {
      const left = byExt.get(Number(a));
      const right = byExt.get(Number(b));
      if (!left || !right) throw new BadRequestError('存在无效的专辑标识，请先搜索并确认专辑');
      if (String(left._id) === String(right._id)) throw new BadRequestError('同一组对位不能是同一张专辑');
      duelPairs.push([left, right]);
    }
    const albums = duelPairs.flat();
    // 收集涉及到的歌手（去重），供前端展示
    const seen = new Set();
    const artists = [];
    for (const al of albums) {
      const key = Number(al.artistExternalId);
      if (Number.isFinite(key) && !seen.has(key)) {
        seen.add(key);
        artists.push(await artistMeta(key));
      }
    }
    return { albums, artists, duelPairs };
  }

  throw new BadRequestError(`不支持的范围模式：${scopeType}`);
}

export async function createBattle(userId, payload) {
  const { albums, artists, alignedLists, duelPairs } = await resolvePool(payload);

  // 新赛制（2026-09-17）：规模自选 + 小组赛 4 选 2 + 遗珠复活 + 1v1 淘汰。
  // tournamentVersion=2 时走全新链路；其余保持旧赛制不变（灰度共存）。
  if (payload.tournamentVersion === 2) {
    return createBattleV2(userId, payload, { albums, artists });
  }

  if (payload.scopeType === 'duel') {
    const matches = bracket.buildDuelMatches(duelPairs);
    const battle = await Battle.create({
      userId,
      scopeType: 'duel',
      scopeKey: null,
      artists,
      alignCount: null,
      withRevival: false,
      status: 'playing',
      groupCount: duelPairs.length,
      roundCount: 1,
      currentRound: 1,
      matchTotal: matches.length,
      hasBye: false,
      albumIds: albums.map((a) => a._id),
    });
    await BattleMatch.insertMany(matches.map((m) => ({ ...m, battleId: battle._id })));
    return battle;
  }

  if (payload.scopeType === 'aligned') {
    const n = Math.min(...alignedLists.map((l) => l.length));
    if (n < 1) throw new BadRequestError('所选歌手的正式专辑不足以对位');
    const matches =
      payload.alignMode === 'chrono'
        ? bracket.buildAlignedChronoMatches(alignedLists)
        : bracket.buildAlignedMatches(alignedLists);
    const battle = await Battle.create({
      userId,
      scopeType: 'aligned',
      scopeKey: artists.map((a) => a.artistId).join(','),
      artists,
      alignCount: n,
      withRevival: false,
      status: 'playing',
      groupCount: n,
      roundCount: 1,
      currentRound: 1,
      matchTotal: matches.length,
      hasBye: false,
      albumIds: albums.map((a) => a._id),
    });
    await BattleMatch.insertMany(matches.map((m) => ({ ...m, battleId: battle._id })));
    return battle;
  }

  // 标准赛制：创建时至少 4 张
  if (albums.length < 4) throw new BadRequestError('参赛专辑不得少于 4 张');

  if (isCrossArtistScope(payload.scopeType)) {
    // 跨歌手赛制：小组赛与淘汰赛都保证对阵双方来自不同歌手。
    const { groups, groupCount } = bracket.groupAlbumsCrossArtist(albums, artists.length);
    const groupMatches = bracket.buildGroupMatches(groups);
    if (!groupMatches.length) {
      throw new BadRequestError('这些专辑无法组成跨歌手对局，请多选几位歌手，或减少单人所取张数');
    }
    // 淘汰赛席位 = min(四强席位, 歌手数)，每位歌手至多 1 张 → 半决赛/决赛也是跨歌手
    const fieldSize = Math.max(2, Math.min(bracket.KNOCKOUT_SIZE, artists.length));
    const battle = await Battle.create({
      userId,
      scopeType: payload.scopeType,
      scopeKey: payload.scopeKey ?? payload.genre ?? null,
      artists,
      alignCount: null,
      withRevival: false,
      status: 'playing',
      groupCount,
      roundCount: fieldSize <= 2 ? 2 : 3,
      currentRound: 1,
      matchTotal: groupMatches.length + (fieldSize - 1),
      hasBye: fieldSize % 2 === 1,
      albumIds: albums.map((a) => a._id),
    });
    await BattleMatch.insertMany(groupMatches.map((m) => ({ ...m, battleId: battle._id })));
    return battle;
  }

  const { groups, groupCount } = bracket.groupAlbums(albums);
  const groupMatches = bracket.buildGroupMatches(groups);
  const hasBye = groups.some((g) => g.length % 2 === 1);

  const battle = await Battle.create({
    userId,
    scopeType: payload.scopeType,
    scopeKey: payload.scopeKey ?? payload.genre ?? null,
    artists,
    alignCount: null,
    withRevival: Boolean(payload.withRevival),
    status: 'playing',
    groupCount,
    roundCount: payload.withRevival ? 4 : 3,
    currentRound: 1,
    matchTotal: bracket.computeStandardTotal(groupMatches.length, payload.withRevival),
    hasBye,
    albumIds: albums.map((a) => a._id),
  });

  await BattleMatch.insertMany(groupMatches.map((m) => ({ ...m, battleId: battle._id })));
  return battle;
}

// ============================================================
// 新赛制（tournamentVersion = 2）Creation / Group-Vote / Progression
// ------------------------------------------------------------
// 与旧赛制（version = 1）完全隔离：本段只服务 tournamentVersion=2 的对决。
// 赛程分三阶段：① 小组赛（每 4 张一组，一次勾选 2 张）—— 落在 battle_groups
//             ② 遗珠复活（若有）—— 也是一次多选，落在 battle_groups(roundName='revival')
//             ③ 1v1 淘汰（r32/r16/qf/semi/final）—— 落在 battle_matches
// ②③ 都依赖前序投票结果，故"淘汰赛场次"不在创建时生成，而在小组/复活完成后按需生成。
// ============================================================

/**
 * 创建新赛制对决：规划赛程 + 落 BattleGroup（小组）+ Battle。
 * 不在此生成淘汰赛场次（依赖小组/复活结果）。
 */
async function createBattleV2(userId, payload, resolved) {
  const { albums, artists } = resolved;
  if (albums.length < 2) throw new BadRequestError('参赛专辑不得少于 2 张');

  const plan = bracket.planTournament(albums.length);
  if (!plan) throw new BadRequestError('参赛专辑不足以组成对决');

  const crossArtist = isCrossArtistScope(payload.scopeType);
  const groupDefs = crossArtist
    ? bracket.buildGroupDefsCrossArtist(albums)
    : bracket.buildGroupDefs(albums);

  const battle = await Battle.create({
    userId,
    scopeType: payload.scopeType,
    scopeKey: payload.scopeKey ?? payload.genre ?? null,
    artists,
    alignCount: null,
    withRevival: plan.revivalNeed > 0,
    status: 'playing',
    groupCount: plan.groupCount,
    roundCount: plan.totalSteps,
    currentRound: 1,
    matchTotal: plan.totalSteps,
    hasBye: false,
    tournamentVersion: 2,
    poolTarget: plan.total,
    knockoutSize: plan.knockoutSize,
    revivalNeed: plan.revivalNeed,
    stepTotal: plan.totalSteps,
    albumIds: albums.map((a) => a._id),
  });

  await BattleGroup.insertMany(
    groupDefs.map((g) => ({
      battleId: battle._id,
      roundName: 'group',
      groupNo: g.groupNo,
      albumIds: g.albumIds,
      advanceCount: g.advanceCount,
      // 只有 1 张的组没有可比性：直接算作已晋级，不产生投票步骤（与 planTournament 的 groupSteps 对齐）
      ...(g.albumIds.length <= 1 ? { pickedAlbumIds: g.albumIds, pickedAt: new Date() } : {}),
    })),
  );

  return battle;
}

/** 小组 / 复活多选投票：一次性勾选 advanceCount 张晋级 */
export async function castGroupVote(battleId, groupId, pickedExternalIds, userId) {
  const battle = await loadOwnedBattle(battleId, userId);
  if (battle.status !== 'playing') throw new BadRequestError('该对决已结束');
  if (battle.tournamentVersion !== 2) throw new BadRequestError('该对决不是新赛制');

  const group = await BattleGroup.findOne({ _id: groupId, battleId });
  if (!group) throw new NotFoundError('分组');
  if (group.isPicked()) throw new DuplicateError('该分组已投票');

  // 入参是外部专辑标识数组 → 解析为本地 _id，并校验都在本组内
  if (!Array.isArray(pickedExternalIds) || pickedExternalIds.length !== group.advanceCount) {
    throw new BadRequestError(`本分组需选择 ${group.advanceCount} 张专辑晋级`);
  }
  if (new Set(pickedExternalIds.map(String)).size !== pickedExternalIds.length) {
    throw new BadRequestError('所选专辑不能重复');
  }
  const pickedLocal = [];
  for (const ext of pickedExternalIds) {
    const doc = await Album.findOne({ albumId: Number(ext) });
    if (!doc) throw new BadRequestError('存在无效的专辑标识');
    if (!group.albumIds.map(String).includes(String(doc._id))) {
      throw new BadRequestError('所投专辑不在本分组内');
    }
    pickedLocal.push(doc._id);
  }

  // 轻度限流（不计违规）：同一用户连续多选投票过快时拦截，阈值与淘汰赛投票一致（config.vote.minIntervalMs）
  const last = await Vote.findOne({ userId, groupId: { $ne: null } }).sort({ createdAt: -1 }).select('createdAt');
  if (last && Date.now() - new Date(last.createdAt).getTime() < config.vote.minIntervalMs) {
    throw new TooFrequentError('操作过于频繁，请稍后再试');
  }

  // 每张选票落库（partial 唯一索引 (groupId,userId,albumId) 防同一张重复投）
  await Vote.insertMany(
    pickedLocal.map((albumObjectId) => ({
      groupId: group._id,
      battleId: battle._id,
      albumId: albumObjectId,
      userId,
      isInvalid: false,
    })),
  );

  group.pickedAlbumIds = pickedLocal;
  group.pickedAt = new Date();
  await group.save();

  const progress = await progressBattle(battle);
  return { invalid: false, groupId: String(group._id), progress };
}

/** 取下一个待投票步骤（统一覆盖 小组 / 复活 / 淘汰赛 / 已结束），前端据此渲染 */
export async function getNextStep(battleId, userId, _depth = 0) {
  const battle = await loadOwnedBattle(battleId, userId);
  if (battle.status === 'finished') {
    return { finished: true, phase: 'finished', progress: { decided: battle.stepTotal || 0, total: battle.stepTotal || 0 } };
  }
  if (battle.tournamentVersion !== 2) {
    // 旧赛制：交由既有 next-match 接口处理
    return { legacy: true };
  }

  /**
   * 兜底自愈：赛程其实已经可以推进（所有场次都判定完了 / 小组都勾完了），
   * 但 status 还停在 playing 时，**读状态这一下就顺手推进**。
   * 为什么必须这么做：推进原本只发生在投票那一刻，一旦出现"最后一轮全是轮空场"
   * 这类**没有可投场次**的局面，就再也没有触发推进的机会 → 前端永远停在
   * 「本轮已投完，正在生成下一轮对阵…」（2026-09-18 用户报的卡死 bug 的兜底）。
   */
  const selfHeal = async (state) => {
    if (_depth >= 5) return state;
    const p = await progressBattle(battle);
    if (p?.advanced) return getNextStep(battleId, userId, _depth + 1);
    return state;
  };

  const groups = await BattleGroup.find({ battleId: battle._id }).sort({ groupNo: 1, roundName: 1 });
  const groupPickedCount = groups.filter((g) => g.isPicked()).length;
  const undecided = groups.find((g) => !g.isPicked());

  if (undecided) {
    const albumDocs = await Album.find({ _id: { $in: undecided.albumIds } });
    const albumMap = new Map(albumDocs.map((a) => [String(a._id), a]));
    const shape = (id) => {
      const a = albumMap.get(String(id));
      return a ? musicService.serializeAlbum(a) : null;
    };
    return {
      finished: false,
      phase: undecided.roundName, // 'group' | 'revival'
      group: {
        groupId: String(undecided._id),
        roundName: undecided.roundName,
        groupNo: undecided.groupNo,
        advanceCount: undecided.advanceCount,
        albums: undecided.albumIds.map(shape),
      },
      progress: { decided: groupPickedCount, total: battle.stepTotal },
    };
  }

  // 小组 + 复活全部完成 → 进入淘汰赛阶段
  const koMatches = await BattleMatch.find({ battleId: battle._id, roundName: { $in: KO_NAMES } }).sort({
    matchOrder: 1,
  });
  const koDecided = koMatches.filter((m) => m.isBye || m.winnerAlbumId).length;
  if (koMatches.length) {
    const match = koMatches.find((m) => !m.isBye && !m.winnerAlbumId);
    if (!match) {
      return selfHeal({
        finished: false,
        phase: 'await',
        progress: { decided: groupPickedCount + koDecided, total: battle.stepTotal },
      });
    }
    const albumDocs = await Album.find({ _id: { $in: [match.leftAlbumId, match.rightAlbumId].filter(Boolean) } });
    const albumMap = new Map(albumDocs.map((a) => [String(a._id), a]));
    const previews = await Track.find({
      albumExternalId: { $in: albumDocs.map((a) => a.albumId) },
      previewUrl: { $ne: null },
    }).select('albumExternalId previewUrl trackNumber');
    const previewMap = new Map();
    for (const t of previews) {
      const cur = previewMap.get(t.albumExternalId);
      if (!cur || (t.trackNumber === 1 && cur.trackNumber !== 1)) previewMap.set(t.albumExternalId, t);
    }
    const shapeAlbum = (album) =>
      album
        ? { ...musicService.serializeAlbum(album), previewUrl: previewMap.get(album.albumId)?.previewUrl || null }
        : null;
    return {
      finished: false,
      phase: 'knockout',
      match: {
        matchId: String(match._id),
        roundName: match.roundName,
        matchOrder: match.matchOrder,
        leftAlbum: shapeAlbum(albumMap.get(String(match.leftAlbumId))),
        rightAlbum: match.rightAlbumId ? shapeAlbum(albumMap.get(String(match.rightAlbumId))) : null,
        leftVotes: match.leftVotes,
        rightVotes: match.rightVotes,
        isBye: match.isBye,
      },
      progress: { decided: groupPickedCount + koDecided, total: battle.stepTotal },
    };
  }

  // 兜底：分组都投完但还没生成淘汰赛（progressBattleV2 会同步生成，正常不会停在这里）→ 自愈一次
  return selfHeal({ finished: false, phase: 'await', progress: { decided: groupPickedCount, total: battle.stepTotal } });
}

/** 新赛制推进：小组 / 复活阶段（淘汰赛已生成则转交 progressKnockoutV2） */
async function progressGroupRevivalV2(battle) {
  const groups = await BattleGroup.find({ battleId: battle._id }).sort({ groupNo: 1, roundName: 1 });
  const groupRounds = groups.filter((g) => g.roundName === 'group');
  if (!groupRounds.length) return { advanced: false };
  if (!groupRounds.every((g) => g.isPicked())) return { advanced: false };

  const advancedIds = groupRounds.flatMap((g) => g.pickedAlbumIds.map((id) => String(id)));

  if (battle.revivalNeed > 0) {
    let revival = groups.find((g) => g.roundName === 'revival');
    if (!revival) {
      const advancedSet = new Set(advancedIds);
      const remaining = battle.albumIds.filter((id) => !advancedSet.has(String(id)));
      const advanceCount = Math.min(battle.revivalNeed, remaining.length);
      if (advanceCount <= 0) {
        // 没有遗珠可捞（极端情况），直接进入淘汰赛
        return startKnockoutV2(battle, advancedIds.map((id) => ({ _id: id })));
      }
      revival = await BattleGroup.create({
        battleId: battle._id,
        roundName: 'revival',
        groupNo: groupRounds.length + 1,
        albumIds: remaining,
        advanceCount,
      });
      battle.currentRound = battle.groupCount + 1;
      await battle.save();
      return { advanced: true, round: 'revival' };
    }
    if (!revival.isPicked()) return { advanced: false };
    const revived = revival.pickedAlbumIds.map((id) => ({ _id: id }));
    const seeds = [...advancedIds.map((id) => ({ _id: id })), ...revived];
    return startKnockoutV2(battle, seeds);
  }

  return startKnockoutV2(battle, advancedIds.map((id) => ({ _id: id })));
}

/** 生成第一轮淘汰赛（seeds 数 = 晋级数 + 复活数 = knockoutSize） */
async function startKnockoutV2(battle, seeds) {
  if (seeds.length < 2) {
    // 仅剩 1 张 → 直接夺冠
    battle.status = 'finished';
    battle.championAlbumId = seeds[0]?._id || null;
    await battle.save();
    return { advanced: true, finished: true };
  }
  const roundName = bracket.roundNameFor(seeds.length);
  const order = await nextMatchOrder(battle._id);

  // 跨歌手优先配对（用户规则）：第一轮尽量不让同歌手的专辑互打（2026-09-17 修复）
  const docs = await Album.find({ _id: { $in: seeds.map((s) => s._id) } }).select('_id artistExternalId');
  const artistOf = new Map(docs.map((d) => [String(d._id), String(d.artistExternalId ?? d._id)]));
  let matches;
  if (artistOf.size > 1) {
    const pairs = bracket.buildFirstRoundCrossArtist(seeds, (id) => artistOf.get(String(id)));
    matches = pairs.map((p, i) => ({
      roundName,
      roundIndex: 1,
      matchOrder: order + i,
      leftAlbumId: p.left._id,
      rightAlbumId: p.right ? p.right._id : null,
      isBye: !p.right,
      isRevival: false,
    }));
  } else {
    matches = bracket.buildKnockoutMatches(seeds, roundName, { roundIndex: 1, startOrder: order });
  }
  await BattleMatch.insertMany(matches.map((m) => ({ ...m, battleId: battle._id })));
  battle.currentRound = battle.groupCount + (battle.revivalNeed > 0 ? 1 : 0) + 1;
  await battle.save();
  return { advanced: true, round: roundName };
}

/** 新赛制推进：淘汰赛阶段（逐轮减半到冠军） */
async function progressKnockoutV2(battle) {
  const matches = await BattleMatch.find({ battleId: battle._id, roundName: { $in: KO_NAMES } }).sort({
    matchOrder: 1,
  });
  if (!matches.length) return { advanced: false };

  const byRound = new Map();
  for (const m of matches) {
    if (!byRound.has(m.roundName)) byRound.set(m.roundName, []);
    byRound.get(m.roundName).push(m);
  }
  let lastRoundName = null;
  for (const name of KO_NAMES) if (byRound.has(name)) lastRoundName = name;
  const lastRound = byRound.get(lastRoundName);
  const decided = (m) => m.isBye || Boolean(m.winnerAlbumId);
  if (!lastRound.every(decided)) return { advanced: false };

  if (lastRoundName === 'final') {
    const finalMatch = lastRound.find((m) => !m.isBye) || lastRound[0];
    battle.status = 'finished';
    battle.championAlbumId = finalMatch?.winnerAlbumId || (lastRound[0]?.isBye ? lastRound[0].leftAlbumId : null);
    await battle.save();
    return { advanced: true, finished: true };
  }

  const winners = lastRound
    .map((m) => ({ _id: m.winnerAlbumId || (m.isBye ? m.leftAlbumId : null) }))
    .filter((w) => w._id);
  const nextName = nextRoundName(lastRoundName);
  const order = await nextMatchOrder(battle._id);
  const newMatches = bracket.buildKnockoutMatches(winners, nextName, { roundIndex: 1, startOrder: order });
  await BattleMatch.insertMany(newMatches.map((m) => ({ ...m, battleId: battle._id })));
  battle.currentRound += 1;
  await battle.save();
  return { advanced: true, round: nextName };
}

async function loadOwnedBattle(battleId, userId) {
  const battle = await Battle.findById(battleId);
  if (!battle) throw new NotFoundError('对决');
  if (String(battle.userId) !== String(userId)) throw new ForbiddenError('无权访问该对决');
  return battle;
}

export async function getBattleDetail(battleId, userId) {
  const battle = await loadOwnedBattle(battleId, userId);
  const matches = await BattleMatch.find({ battleId: battle._id }).sort({ matchOrder: 1 });
  const albumDocs = await Album.find({ _id: { $in: battle.albumIds } });
  const albumMap = new Map(albumDocs.map((a) => [String(a._id), a]));

  // 各小组战绩
  const groups = {};
  for (const match of matches.filter((m) => m.roundName === 'group')) {
    const key = String(match.groupNo ?? 0);
    if (!groups[key]) groups[key] = [];
    groups[key].push(match);
  }
  const standings = {};
  for (const [key, list] of Object.entries(groups)) {
    standings[key] = bracket.computeStandings(list).map((row) => ({
      ...row,
      album: albumMap.get(row.albumId)
        ? musicService.serializeAlbum(albumMap.get(row.albumId))
        : null,
    }));
  }

  // 新赛制 v2：小组 / 复活环节（对阵列 + 已晋级）——对阵表页需要
  let v2GroupList = [];
  if (battle.tournamentVersion === 2) {
    const groupDocs = await BattleGroup.find({ battleId: battle._id }).sort({ roundName: 1, groupNo: 1 });
    v2GroupList = groupDocs.map((g) => ({
      groupId: String(g._id),
      roundName: g.roundName, // 'group' | 'revival'
      groupNo: g.groupNo,
      advanceCount: g.advanceCount,
      picked: g.isPicked(),
      // ⚠️ 必须是「外部专辑标识」：前端拿 al.albumId（iTunes 的 id）来比对，
      //    之前返回的是本地 ObjectId，导致对阵表里所有专辑都显示"未晋级"（2026-09-17 修复）
      advancedAlbumIds: (g.pickedAlbumIds || []).map((id) => {
        const a = albumMap.get(String(id));
        return a ? String(a.albumId) : String(id);
      }),
      albums: g.albumIds
        .map((id) => {
          const a = albumMap.get(String(id));
          return a ? musicService.serializeAlbum(a) : null;
        })
        .filter(Boolean),
    }));
  }

  return {
    battle,
    matches: matches.map((m) => serializeMatch(m, albumMap)),
    standings,
    groups: v2GroupList,
  };
}

function serializeMatch(match, albumMap) {
  const left = albumMap.get(String(match.leftAlbumId));
  const right = match.rightAlbumId ? albumMap.get(String(match.rightAlbumId)) : null;
  const winner = match.winnerAlbumId ? albumMap.get(String(match.winnerAlbumId)) : null;
  return {
    matchId: String(match._id),
    roundName: match.roundName,
    roundIndex: match.roundIndex,
    groupNo: match.groupNo,
    matchOrder: match.matchOrder,
    leftAlbum: left ? musicService.serializeAlbum(left) : null,
    rightAlbum: right ? musicService.serializeAlbum(right) : null,
    leftVotes: match.leftVotes,
    rightVotes: match.rightVotes,
    /** ⚠️ 本地 ObjectId：仅供后端内部与旧逻辑使用，前端判定胜方一律用 winnerAlbumExternalId */
    winnerAlbumId: match.winnerAlbumId ? String(match.winnerAlbumId) : null,
    /**
     * 胜方的「外部专辑标识」（iTunes collectionId）。
     * ⚠️ 前端拿到的专辑只有外部 albumId；若拿 winnerAlbumId（本地 ObjectId）去比，永远对不上
     * —— 对阵表页「胜方高亮」曾因此全部失效（与 2026-09-17 修的 advancedAlbumIds 是同一个坑）。
     */
    winnerAlbumExternalId: winner ? Number(winner.albumId) : null,
    isBye: match.isBye,
    isRevival: match.isRevival,
  };
}

/** B-03 下一场：返回当前应投的场次（结构对齐接口文档 5.3） */
export async function getNextMatch(battleId, userId) {
  await loadOwnedBattle(battleId, userId);

  const [decidedCount, votableTotal] = await Promise.all([
    BattleMatch.countDocuments({ battleId, isBye: false, winnerAlbumId: { $ne: null } }),
    BattleMatch.countDocuments({ battleId, isBye: false }),
  ]);
  const progress = { decided: decidedCount, total: votableTotal };

  const match = await BattleMatch.findOne({ battleId, isBye: false, winnerAlbumId: null }).sort({
    matchOrder: 1,
  });
  if (!match) return { finished: true, matchId: null, left: null, right: null, progress };

  const albumDocs = await Album.find({
    _id: { $in: [match.leftAlbumId, match.rightAlbumId].filter(Boolean) },
  });
  const albumMap = new Map(albumDocs.map((a) => [String(a._id), a]));

  // 试听地址：取该专辑任一带试听资源的曲目，优先第 1 首
  const previews = await Track.find({
    albumExternalId: { $in: albumDocs.map((a) => a.albumId) },
    previewUrl: { $ne: null },
  }).select('albumExternalId previewUrl trackNumber');
  const previewMap = new Map();
  for (const t of previews) {
    const cur = previewMap.get(t.albumExternalId);
    if (!cur || (t.trackNumber === 1 && cur.trackNumber !== 1)) previewMap.set(t.albumExternalId, t);
  }

  const shape = (album) =>
    album
      ? { ...musicService.serializeAlbum(album), previewUrl: previewMap.get(album.albumId)?.previewUrl || null }
      : null;

  return {
    finished: false,
    matchId: String(match._id),
    roundName: match.roundName,
    roundIndex: match.roundIndex,
    isRevival: match.isRevival,
    isBye: match.isBye,
    left: shape(albumMap.get(String(match.leftAlbumId))),
    right: shape(match.rightAlbumId ? albumMap.get(String(match.rightAlbumId)) : null),
    progress,
  };
}

/**
 * 撤销上一步投票（用户要求："选错了没关系，可以回退"）
 * ------------------------------------------------------------
 * 单人赛制下，一次投票可能连带的动作有两类：
 *   ① 小组 / 复活：给该组写 pickedAlbumIds + 一组票；
 *   ② 淘汰赛：给该场加票、判胜方，并可能在"本轮全部打完"时**生成下一轮场次**。
 * 撤销必须让赛程自洽，规则是：
 *   · `matchOrder` 是全局递增序号（见 nextMatchOrder）→ 「这一票之后才被创建出来的场次」
 *     就是 `matchOrder` 更大的场次，全部删掉；
 *   · 同时删掉本人在这些场次 / 该分组上的票，并把这一场重新计票、重判胜方；
 *   · 最后把 battle 拉回 playing（冠军清空），让 /next-step 重新按当前进度出题。
 * 只允许撤销**自己**的最后一条投票（loadOwnedBattle 已保证对决归属）。
 */
export async function undoLastStep(battleId, userId) {
  const battle = await loadOwnedBattle(battleId, userId);

  /**
   * 对位赛 / 指定对决（旧赛制，tournamentVersion=1）也要能撤销 —— 2026-09-20 用户：
   * "这个所谓旧赛制没法撤销 我在对位赛里 必须改进"。
   * 对位赛与混战最大的不同：**每场独立**（不产生冠军、场次之间没有晋级依赖，
   * roundIndex 就是第几组对位），所以撤销不需要像 v2 那样重算赛程：
   * 把我最近投的那一场退回"未决"即可，其它场次完全不受影响。
   */
  if (battle.tournamentVersion !== 2) {
    if (battle.scopeType !== 'aligned' && battle.scopeType !== 'duel') {
      throw new BadRequestError('这个赛制暂不支持撤销');
    }
    const lastVote = await Vote.findOne({ battleId, userId }).sort({ createdAt: -1 });
    if (!lastVote) throw new BadRequestError('还没有投过票，没有可撤销的步骤');
    const m = lastVote.matchId ? await BattleMatch.findById(lastVote.matchId) : null;
    if (!m) throw new BadRequestError('找不到要撤销的场次');
    await Vote.deleteMany({ battleId, userId, matchId: m._id });
    // ⚠️ leftVotes/rightVotes 在 BattleMatch 里是 required 的 Number → 归零而不是 null，
    //    否则 save() 会抛「Path leftVotes is required」。winnerAlbumId 置空即代表「本场未决」。
    m.leftVotes = 0;
    m.rightVotes = 0;
    m.winnerAlbumId = null;
    await m.save();
    // 如果这局刚因为"投完"被判结束，退回进行中，否则前端会卡在结果页
    if (battle.status === 'finished') {
      battle.status = 'playing';
      await battle.save();
    }
    return { undone: `第 ${m.roundIndex} 组对位`, legacy: true };
  }

  if (battle.status === 'finished') throw new BadRequestError('对决已结束，无法再撤销');

  const last = await Vote.findOne({ battleId, userId }).sort({ createdAt: -1 });
  if (!last) throw new BadRequestError('还没有投过票，没有可撤销的步骤');

  let undone = '上一步投票';

  if (last.groupId) {
    const group = await BattleGroup.findOne({ _id: last.groupId, battleId });
    if (group) {
      group.pickedAlbumIds = [];
      group.pickedAt = null;
      await group.save();
      undone = group.roundName === 'revival' ? '遗珠复活' : `小组赛 · ${group.groupNo} 组`;
    }
    await Vote.deleteMany({ battleId, userId, groupId: last.groupId });
    // 小组阶段本身不产生场次；一旦有场次（复活赛 / 淘汰赛）就说明已经推进过 → 全部撤掉
    const later = await BattleMatch.find({ battleId }).select('_id');
    if (later.length) {
      await Vote.deleteMany({ battleId, userId, matchId: { $in: later.map((m) => m._id) } });
      await BattleMatch.deleteMany({ battleId });
    }
  } else if (last.matchId) {
    const match = await BattleMatch.findById(last.matchId);
    await Vote.deleteMany({ battleId, userId, matchId: last.matchId });
    if (match) {
      // ⚠️ 只撤销「严格更晚阶段」的场次。同轮的兄弟场次必须留着 ——
      //    历史实现按 matchOrder 删，会把同轮兄弟一起删掉，从而造出残缺轮次并把对局卡死
      //    （2026-09-18 用户报的「本轮已投完」死锁）。见 stageRankOf 注释。
      const rank = stageRankOf(match);
      const all = await BattleMatch.find({ battleId }).select('_id roundName').lean();
      const laterIds = all.filter((m) => stageRankOf(m) > rank).map((m) => m._id);
      if (laterIds.length) {
        await Vote.deleteMany({ battleId, userId, matchId: { $in: laterIds } });
        await BattleMatch.deleteMany({ _id: { $in: laterIds } });
      }
      // 重新计票 + 重判胜方
      const [left, right] = await Promise.all([
        Vote.countDocuments({ matchId: match._id, albumId: match.leftAlbumId, isInvalid: false }),
        Vote.countDocuments({ matchId: match._id, albumId: match.rightAlbumId, isInvalid: false }),
      ]);
      match.leftVotes = left;
      match.rightVotes = right;
      match.winnerAlbumId = left || right ? await decideWinner(match, battle) : null;
      await match.save();

      // 回写当前轮次：= 小组阶段轮数 + 复活 + 现存淘汰赛轮数（与 startKnockoutV2 / progressKnockoutV2 的口径一致）
      const leftRounds = await BattleMatch.find({ battleId }).select('roundName').lean();
      const koRoundsLeft = new Set(leftRounds.filter((m) => KO_NAMES.includes(m.roundName)).map((m) => m.roundName));
      battle.currentRound =
        (battle.groupCount || 0) + (battle.revivalNeed > 0 ? 1 : 0) + Math.max(1, koRoundsLeft.size);
      undone = `淘汰赛 · ${match.roundName}`;
    }
  } else {
    throw new BadRequestError('最后一条投票没有可撤销的归属');
  }

  battle.status = 'playing';
  battle.championAlbumId = null;
  await battle.save();

  return { undone };
}

// ============================================================
// 好友一起玩：同款签表（invite / join / compare）
// ------------------------------------------------------------
// 思路（对应《赛制升级方案》第七章）：
//   ① 发起方打完（或打到一半）点「和好友一起玩」→ 生成一个 6 位邀请码 shareCode
//   ② 好友点 /battle/join/<code> → 看到同一批专辑的介绍页 → 点「开始同款对决」
//      → 后端用**发起方那一局的 albumIds 原样复制**出一局新的（不重新抽专辑），
//        因此签表完全一致：分组、场次、对阵顺序都相同（分组是确定性的，只有抽张才随机）。
//   ③ 两边都打完后 → 对比页：冠军是否一致 / 从第几步开始分歧 / 逐步并排对照
// ============================================================

/** 邀请码字母表：去掉了容易看错的 0/O/1/I/L/U */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const CODE_LEN = 6;

function randomCode() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i += 1) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

/** 生成一个没被占用的邀请码（撞码概率极低，最多重试 8 次） */
async function mintShareCode() {
  for (let i = 0; i < 8; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const code = randomCode();
    // eslint-disable-next-line no-await-in-loop
    const hit = await Battle.exists({ shareCode: code, originBattleId: null });
    if (!hit) return code;
  }
  throw new BadRequestError('生成邀请码失败，请重试');
}

/** 取出「发起方那一局」（同码里最早、且不是接龙出来的一局） */
async function findSourceByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) throw new BadRequestError('邀请码为空');
  const src = await Battle.findOne({ shareCode: c, originBattleId: null }).sort({ createdAt: 1 });
  // ⚠️ NotFoundError(x) 会自动拼成「x不存在」，这里别再手写"不存在"
  if (!src) throw new BadRequestError('这份签表不存在或已失效');
  return src;
}

/** ① 生成 / 取回我的同款签表邀请码（只有本局主人能生成） */
export async function createInvite(userId, battleId) {
  const battle = await Battle.findById(battleId);
  if (!battle) throw new NotFoundError('对决');
  if (String(battle.userId) !== String(userId)) throw new ForbiddenError('只能分享自己的对决');
  if (!battle.shareCode) {
    battle.shareCode = await mintShareCode();
    await battle.save();
  }
  return { shareCode: battle.shareCode, battleId: String(battle._id) };
}

/** 把专辑按给定 id 顺序还原（find() 本身不保证顺序，签表顺序必须一致） */
async function albumsInOrder(ids) {
  const docs = await Album.find({ _id: { $in: ids } });
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

function albumBrief(a) {
  if (!a) return null;
  return {
    albumId: a.albumId,
    name: a.name,
    artistName: a.artistName || '',
    artworkUrl: a.artworkUrl || '',
    releaseDate: a.releaseDate || null,
  };
}

/**
 * ② 查看同款签表（进人页用）。
 * 守「盲盒原则」：只露每位歌手 1~2 张封面做示意，不把全部出战专辑摊开。
 */
export async function getInvite(code) {
  const src = await findSourceByCode(code);
  const albums = await albumsInOrder(src.albumIds);

  // 每位歌手最多 2 张做预览
  const perArtist = new Map();
  const preview = [];
  for (const a of albums) {
    const k = a.artistName || '未知歌手';
    const n = perArtist.get(k) || 0;
    if (n < 2) {
      perArtist.set(k, n + 1);
      preview.push(albumBrief(a));
    }
  }

  const inviter = await User.findById(src.userId).select('nickname account').lean();
  const champion = src.championAlbumId
    ? albumBrief(await Album.findById(src.championAlbumId))
    : null;

  return {
    shareCode: src.shareCode,
    scopeType: src.scopeType,
    scopeKey: src.scopeKey || null,
    artists: (src.artists || []).map((a) => ({ artistId: a.artistId, name: a.name })),
    albumCount: albums.length,
    tournamentVersion: src.tournamentVersion || 1,
    stepTotal: src.stepTotal ?? src.matchTotal ?? null,
    withRevival: Boolean(src.withRevival),
    status: src.status,
    inviter: inviter?.nickname || '好友',
    champion,
    previewAlbums: preview,
    // 我自己有没有接过这一局（前端用来判断按钮文案）
    joinedCount: await Battle.countDocuments({ shareCode: src.shareCode }),
  };
}

/**
 * ③ 接龙开局：用发起方那局的专辑原样复制一局给我。
 *    · 新赛制（v2）→ 走 createBattleV2（分组确定性 → 签表一致）
 *    · 旧赛制（v1，含指定对决 / 对位赛）→ 直接复制 Battle.create + 场次文档
 */
export async function joinInvite(userId, code) {
  const src = await findSourceByCode(code);
  const albums = await albumsInOrder(src.albumIds);
  if (albums.length < 2) throw new BadRequestError('这份签表的专辑已失效，无法开局');

  // 同一个人重复点「开始」不该刷出一堆局：已经有未打完的就返回那一局
  const mine = await Battle.findOne({
    shareCode: src.shareCode,
    userId,
    status: 'playing',
  }).sort({ createdAt: -1 });
  if (mine) return mine;

  const base = {
    userId,
    scopeType: src.scopeType,
    scopeKey: src.scopeKey ?? null,
    artists: src.artists || [],
    alignCount: src.alignCount ?? null,
    withRevival: Boolean(src.withRevival),
    status: 'playing',
    groupCount: src.groupCount,
    roundCount: src.roundCount,
    currentRound: 1,
    matchTotal: src.matchTotal,
    hasBye: Boolean(src.hasBye),
    tournamentVersion: src.tournamentVersion || 1,
    poolTarget: src.poolTarget ?? null,
    knockoutSize: src.knockoutSize ?? null,
    revivalNeed: src.revivalNeed ?? null,
    stepTotal: src.stepTotal ?? null,
    albumIds: src.albumIds,
    shareCode: src.shareCode,
    originBattleId: src._id,
  };

  let battle;
  if ((src.tournamentVersion || 1) === 2) {
    // eslint-disable-next-line no-underscore-dangle
    battle = await createBattleV2(
      userId,
      { scopeType: src.scopeType, scopeKey: src.scopeKey ?? null },
      { albums, artists: src.artists || [] },
    );
    battle.shareCode = src.shareCode;
    battle.originBattleId = src._id;
    await battle.save();
  } else {
    battle = await Battle.create(base);
    const srcMatches = await BattleMatch.find({ battleId: src._id }).sort({ matchOrder: 1 }).lean();
    if (srcMatches.length) {
      await BattleMatch.insertMany(
        srcMatches.map((m) => ({
          battleId: battle._id,
          roundIndex: m.roundIndex,
          roundName: m.roundName,
          groupNo: m.groupNo ?? null,
          matchOrder: m.matchOrder,
          leftAlbumId: m.leftAlbumId,
          rightAlbumId: m.rightAlbumId ?? null,
          isBye: Boolean(m.isBye),
          isRevival: Boolean(m.isRevival),
        })),
      );
    }
    const srcGroups = await BattleGroup.find({ battleId: src._id }).sort({ groupNo: 1 }).lean();
    if (srcGroups.length) {
      await BattleGroup.insertMany(
        srcGroups.map((g) => ({
          battleId: battle._id,
          roundName: g.roundName,
          groupNo: g.groupNo,
          albumIds: g.albumIds,
          advanceCount: g.advanceCount,
          // 只复制「分组」本身，不复制发起方的选择 —— 好友要自己选
          pickedAlbumIds: [],
          pickedAt: null,
        })),
      );
    }
  }
  return battle;
}

/** 轮次中文名（对比页用） */
const STEP_LABEL = {
  group: '小组赛',
  revival: '遗珠复活',
  r32: '32 强',
  r16: '16 强',
  qf: '八强',
  semi: '半决赛',
  final: '决赛',
  duel: '对位',
};

/** 把一局的选择按「步」摊平：小组 → 复活 → 淘汰赛，顺序与 matchOrder 一致 */
async function stepsOf(battleId) {
  const groups = await BattleGroup.find({ battleId }).sort({ roundName: 1, groupNo: 1 }).lean();
  const matches = await BattleMatch.find({ battleId }).sort({ matchOrder: 1 }).lean();
  const steps = [];
  for (const g of groups) {
    if (g.roundName === 'group') {
      steps.push({ label: `小组 ${g.groupNo + 1}`, picks: (g.pickedAlbumIds || []).map(String) });
    }
  }
  const rev = groups.find((g) => g.roundName === 'revival');
  if (rev) steps.push({ label: '遗珠复活', picks: (rev.pickedAlbumIds || []).map(String) });
  for (const m of matches) {
    steps.push({
      label: STEP_LABEL[m.roundName] || m.roundName,
      picks: m.winnerAlbumId ? [String(m.winnerAlbumId)] : [],
    });
  }
  return steps;
}

const sameSet = (a, b) => {
  if (a.length !== b.length) return false;
  const sa = [...a].sort().join(',');
  const sb = [...b].sort().join(',');
  return sa === sb;
};

/**
 * ④ 同款签表对比：我和好友在同一批专辑上的选择差在哪。
 *    返回：参与者列表（含各自冠军）、冠军是否一致、第一个分歧点、逐步对照。
 */
export async function getInviteCompare(code, userId) {
  const src = await findSourceByCode(code);
  const all = await Battle.find({ shareCode: src.shareCode })
    .sort({ createdAt: 1 })
    .populate('userId', 'nickname account')
    .lean();

  const albumIds = all.flatMap((b) => (b.championAlbumId ? [b.championAlbumId] : []));
  const albumDocs = albumIds.length ? await Album.find({ _id: { $in: albumIds } }).lean() : [];
  const albumById = new Map(albumDocs.map((d) => [String(d._id), d]));

  const participants = [];
  for (const b of all) {
    const champ = b.championAlbumId ? albumById.get(String(b.championAlbumId)) : null;
    participants.push({
      battleId: String(b._id),
      nickname: b.userId?.nickname || (b.userId?.account === undefined ? '好友' : '好友'),
      isMe: String(b.userId?._id ?? b.userId) === String(userId),
      isHost: String(b._id) === String(src._id),
      finished: b.status === 'finished',
      champion: champ ? albumBrief(champ) : null,
    });
  }

  const finished = participants.filter((p) => p.finished && p.champion);
  const championAgree =
    finished.length >= 2 &&
    finished.every((p) => p.champion.albumId === finished[0].champion.albumId);

  // 逐步对照：拿「我」和第一个打完的好友比
  const meBattle = all.find((b) => String(b.userId?._id ?? b.userId) === String(userId));
  const otherBattle =
    all.find(
      (b) => String(b.userId?._id ?? b.userId) !== String(userId) && b.status === 'finished',
    ) || all.find((b) => String(b._id) !== String(meBattle?._id));

  let steps = [];
  let firstDiff = null;
  if (meBattle && otherBattle) {
    const [s1, s2] = await Promise.all([stepsOf(meBattle._id), stepsOf(otherBattle._id)]);
    const albumIdToName = new Map();
    const needIds = [...s1, ...s2].flatMap((s) => s.picks);
    if (needIds.length) {
      const docs = await Album.find({ _id: { $in: needIds } }).select('name _id').lean();
      docs.forEach((d) => albumIdToName.set(String(d._id), d.name));
    }
    const n = Math.max(s1.length, s2.length);
    for (let i = 0; i < n; i += 1) {
      const a = s1[i] || { label: `第 ${i + 1} 步`, picks: [] };
      const b = s2[i] || { label: a.label, picks: [] };
      const same = a.picks.length > 0 && sameSet(a.picks, b.picks);
      steps.push({
        label: a.label,
        mine: a.picks.map((id) => albumIdToName.get(id) || '—'),
        theirs: b.picks.map((id) => albumIdToName.get(id) || '—'),
        same,
      });
      if (firstDiff === null && a.picks.length > 0 && b.picks.length > 0 && !same) {
        firstDiff = { step: i + 1, label: a.label };
      }
    }
  }

  return {
    shareCode: src.shareCode,
    albumCount: (src.albumIds || []).length,
    participants,
    championAgree,
    firstDiff,
    steps,
    rival: otherBattle
      ? {
          nickname:
            otherBattle.userId?.nickname ||
            (String(otherBattle._id) === String(src._id) ? '发起方' : '好友'),
        }
      : null,
  };
}

export async function listMyBattles(userId, query) {
  const { page, pageSize, skip, limit } = parsePagination(query);
  const filter = { userId };
  if (query.status) filter.status = query.status;
  const [list, total] = await Promise.all([
    Battle.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Battle.countDocuments(filter),
  ]);

  // 「我的对决」列表缩略图：取每场对决第一场比赛的左侧专辑封面。
  // 批量查（一次 BattleMatch + 一次 Album），避免 N+1；某场还没生成对阵时为 null。
  const battleIds = list.map((b) => b._id);
  const coverByBattle = new Map();
  if (battleIds.length) {
    const firstMatches = await BattleMatch.find({ battleId: { $in: battleIds } })
      .sort({ matchOrder: 1 })
      .select('battleId leftAlbumId');
    for (const m of firstMatches) {
      const key = String(m.battleId);
      if (!coverByBattle.has(key) && m.leftAlbumId) coverByBattle.set(key, String(m.leftAlbumId));
    }
    const albumIds = [...new Set([...coverByBattle.values()])];
    if (albumIds.length) {
      const albums = await Album.find({ _id: { $in: albumIds } }).select('artworkUrl');
      const artMap = new Map(albums.map((a) => [String(a._id), a.artworkUrl]));
      for (const [key, albumId] of coverByBattle) coverByBattle.set(key, artMap.get(albumId) || null);
    }
  }
  const withCover = list.map((b) => {
    const obj = b.toObject();
    obj.coverUrl = coverByBattle.get(String(b._id)) || null;
    return obj;
  });

  return { list: withCover, page, pageSize, total };
}

export async function deleteBattle(battleId, userId) {
  await loadOwnedBattle(battleId, userId);
  // 级联清理：只删 Battle 会留下孤儿票与孤儿分组，
  // 而榜单是按 Vote 统计的 → 删掉的对决仍会算进榜单（2026-09-17 修复）
  await Promise.all([
    BattleMatch.deleteMany({ battleId }),
    BattleGroup.deleteMany({ battleId }),
    Vote.deleteMany({ battleId }),
  ]);
  await Battle.deleteOne({ _id: battleId });
  return true;
}

/** 取下一个个全局场序，保证新生成轮次的 matchOrder 连续 */
async function nextMatchOrder(battleId) {
  const last = await BattleMatch.findOne({ battleId }).sort({ matchOrder: -1 }).select('matchOrder');
  return (last?.matchOrder || 0) + 1;
}

/**
 * 生成复活赛首轮：各组第二名（共 4 张）两两配对，产生 2 场。
 * 由 B-05 主动调用，或在启用复活赛且小组赛结束时自动调用（避免赛程卡住）。
 */
async function generateRevivalRound1(battle) {
  const groupMatches = await BattleMatch.find({ battleId: battle._id, roundName: 'group' });
  const groupNos = [...new Set(groupMatches.map((m) => m.groupNo))].sort((a, b) => a - b);
  const runnersUp = [];
  for (const no of groupNos) {
    const rows = bracket.computeStandings(groupMatches.filter((m) => m.groupNo === no));
    if (rows[1]) runnersUp.push({ _id: rows[1].albumId });
  }
  if (runnersUp.length < 2) return 0;

  const order = await nextMatchOrder(battle._id);
  const matches = bracket.buildKnockoutMatches(runnersUp, 'revival', {
    roundIndex: 1,
    startOrder: order,
    isRevival: true,
  });
  await BattleMatch.insertMany(matches.map((m) => ({ ...m, battleId: battle._id })));
  return matches.length;
}

/** B-05 复活赛：按需（或自动）生成复活赛首轮 2 场 */
export async function createRevival(battleId, userId) {
  const battle = await loadOwnedBattle(battleId, userId);
  if (isCrossArtistScope(battle.scopeType)) {
    throw new BadRequestError('多歌手／流派／年代模式下不提供复活赛：复活赛会让同一歌手的专辑互相对决');
  }
  const groupMatches = await BattleMatch.find({ battleId, roundName: 'group' });
  if (!groupMatches.length || !groupMatches.every((m) => m.isBye || m.winnerAlbumId)) {
    throw new BadRequestError('小组赛尚未结束，暂不能开启复活赛');
  }
  const existing = await BattleMatch.countDocuments({ battleId, roundName: 'revival' });
  if (existing) throw new BadRequestError('复活赛已生成');

  const created = await generateRevivalRound1(battle);
  if (!created) throw new BadRequestError('可进入复活赛的专辑不足');

  battle.withRevival = true;
  await battle.save();
  return { created };
}

/** 单场胜负判定：票多者胜；平票按"本轮累计得票 → 发行年份较早"裁决 */
async function decideWinner(match, battle) {
  if (match.leftVotes > match.rightVotes) return match.leftAlbumId;
  if (match.rightVotes > match.leftVotes) return match.rightAlbumId;

  // 平票：先比本轮累计得票
  const roundMatches = await BattleMatch.find({
    battleId: battle._id,
    roundName: match.roundName,
    roundIndex: match.roundIndex,
  });
  const tally = new Map();
  for (const m of roundMatches) {
    tally.set(String(m.leftAlbumId), (tally.get(String(m.leftAlbumId)) || 0) + m.leftVotes);
    if (m.rightAlbumId) {
      tally.set(String(m.rightAlbumId), (tally.get(String(m.rightAlbumId)) || 0) + m.rightVotes);
    }
  }
  const leftTotal = tally.get(String(match.leftAlbumId)) || 0;
  const rightTotal = tally.get(String(match.rightAlbumId)) || 0;
  if (leftTotal !== rightTotal) return leftTotal > rightTotal ? match.leftAlbumId : match.rightAlbumId;

  // 最终兜底：发行年份较早者
  const albums = await Album.find({ _id: { $in: [match.leftAlbumId, match.rightAlbumId] } });
  const byId = new Map(albums.map((a) => [String(a._id), a]));
  const leftDate = byId.get(String(match.leftAlbumId))?.releaseDate;
  const rightDate = byId.get(String(match.rightAlbumId))?.releaseDate;
  const lt = leftDate ? new Date(leftDate).getTime() : Number.MAX_SAFE_INTEGER;
  const rt = rightDate ? new Date(rightDate).getTime() : Number.MAX_SAFE_INTEGER;
  return lt <= rt ? match.leftAlbumId : match.rightAlbumId;
}

export { decideWinner };

/**
 * 取综合排序前 needed 名（四强候选）。
 * 先取各组第一名并按综合排序；若不足 needed（小组数不足 4 时），
 * 再按综合排序在全部参赛专辑中补足。
 */
async function rankedTop(battleId, needed, { onePerArtist = false } = {}) {
  const groupMatches = await BattleMatch.find({ battleId, roundName: 'group' });
  const groupNos = [...new Set(groupMatches.map((m) => m.groupNo))].sort((a, b) => a - b);
  const all = [];
  const firsts = [];
  for (const no of groupNos) {
    const rows = bracket.computeStandings(groupMatches.filter((m) => m.groupNo === no));
    rows.forEach((row, idx) =>
      all.push({ albumId: row.albumId, wins: row.wins, votes: row.votes, rankInGroup: idx, groupNo: no }),
    );
    if (rows[0]) {
      firsts.push({ albumId: rows[0].albumId, wins: rows[0].wins, votes: rows[0].votes, rankInGroup: 0, groupNo: no });
    }
  }
  const byStrength = (a, b) =>
    b.wins - a.wins || b.votes - a.votes || a.rankInGroup - b.rankInGroup || a.groupNo - b.groupNo;

  if (onePerArtist) {
    // 跨歌手淘汰赛：每位歌手至多 1 张（取该歌手成绩最好的专辑），
    // 这样无论投票结果如何，后续每场都是跨歌手对阵。
    const ordered = [...all].sort(byStrength);
    const albums = await Album.find({ _id: { $in: ordered.map((r) => r.albumId) } }).select('artistExternalId');
    const artistByAlbum = new Map(albums.map((a) => [String(a._id), String(a.artistExternalId)]));
    return bracket
      .pickOnePerArtist(ordered, (r) => artistByAlbum.get(String(r.albumId)), needed)
      .map((r) => ({ _id: r.albumId }));
  }

  firsts.sort(byStrength);
  if (firsts.length >= needed) return firsts.slice(0, needed).map((r) => ({ _id: r.albumId }));

  const rest = all.filter((r) => !firsts.some((f) => f.albumId === r.albumId)).sort(byStrength);
  return [...firsts, ...rest].slice(0, needed).map((r) => ({ _id: r.albumId }));
}

/** 生成一轮淘汰赛场次（ranked 必须已按综合排序） */
async function createRound(battle, ranked, roundName) {
  if (!ranked.length) return [];
  const order = await nextMatchOrder(battle._id);
  const matches = bracket.buildKnockoutMatches(ranked, roundName, { roundIndex: 1, startOrder: order });
  await BattleMatch.insertMany(matches.map((m) => ({ ...m, battleId: battle._id })));
  return matches;
}

/**
 * 推进对决：某一轮全部决出后自动生成下一轮；决赛结束则写冠军。
 * 由投票服务在每票落库后调用。
 *
 * 赛制（见《系统设计文档》4.5）：
 *   小组赛结束 → 不启用复活赛：四强 = 4 个小组第一 → 半决赛 → 决赛
 *                启用复活赛：复活赛首轮 2 场 → 复活决赛 1 场 →
 *                            四强 = 小组第一综合排序前 3 + 复活冠军 → 半决赛 → 决赛
 */
export async function progressBattle(battle) {
  // 新赛制（version=2）：先判断淘汰赛是否已生成，再决定走淘汰赛推进还是小组/复活推进
  if (battle.tournamentVersion === 2) {
    const koExists = await BattleMatch.exists({ battleId: battle._id, roundName: { $in: KO_NAMES } });
    if (koExists) return progressKnockoutV2(battle);
    return progressGroupRevivalV2(battle);
  }

  const matches = await BattleMatch.find({ battleId: battle._id }).sort({ matchOrder: 1 });
  const decided = (m) => m.isBye || Boolean(m.winnerAlbumId);

  if (battle.scopeType === 'aligned' || battle.scopeType === 'duel') {
    if (matches.every(decided)) {
      await finishBattle(battle, matches);
      return { advanced: true, finished: true };
    }
    return { advanced: false };
  }

  if (isCrossArtistScope(battle.scopeType)) {
    // 跨歌手赛制：小组赛 → （半决赛）→ 决赛；每一场都是不同歌手之间。
    const groupMatches = matches.filter((m) => m.roundName === 'group');
    const semiMatches = matches.filter((m) => m.roundName === 'semi');
    const finalMatches = matches.filter((m) => m.roundName === 'final');
    const advanceOf = (m) => m.winnerAlbumId || (m.isBye ? m.leftAlbumId : null);

    // 小组赛结束 → 取出每位歌手成绩最好的专辑（至多四强席位）
    if (groupMatches.length && groupMatches.every(decided) && !semiMatches.length && !finalMatches.length) {
      const field = await rankedTop(battle._id, bracket.KNOCKOUT_SIZE, { onePerArtist: true });
      if (field.length < 2) {
        await finishBattle(battle, matches);
        return { advanced: true, finished: true };
      }
      if (field.length === 2) {
        // 只有 2 位歌手：跨歌手对局只能是一场，直接决赛
        await createRound(battle, field, 'final');
        battle.currentRound = 2;
        await battle.save();
        return { advanced: true, round: 'final' };
      }
      await createRound(battle, field, 'semi');
      battle.currentRound = 2;
      await battle.save();
      return { advanced: true, round: 'semi' };
    }

    // 半决赛结束 → 决赛（轮空者直接进入决赛）
    if (semiMatches.length && semiMatches.every(decided) && !finalMatches.length) {
      const winners = semiMatches.map((m) => ({ _id: advanceOf(m) })).filter((w) => w._id);
      await createRound(battle, winners, 'final');
      battle.currentRound = 3;
      await battle.save();
      return { advanced: true, round: 'final' };
    }

    // 决赛结束 → 写冠军
    if (finalMatches.length && finalMatches.every(decided)) {
      await finishBattle(battle, matches);
      return { advanced: true, finished: true };
    }
    return { advanced: false };
  }

  const groupMatches = matches.filter((m) => m.roundName === 'group');
  const revivalR1 = matches.filter((m) => m.roundName === 'revival' && m.roundIndex === 1);
  const revivalFinal = matches.filter((m) => m.roundName === 'revival' && m.roundIndex === 2);
  const semiMatches = matches.filter((m) => m.roundName === 'semi');
  const finalMatches = matches.filter((m) => m.roundName === 'final');

  const groupsDone = groupMatches.length > 0 && groupMatches.every(decided);

  // 小组赛结束
  if (groupsDone && semiMatches.length === 0) {
    if (!battle.withRevival) {
      const four = await rankedTop(battle._id, bracket.KNOCKOUT_SIZE);
      await createRound(battle, four, 'semi');
      battle.currentRound = 2;
      await battle.save();
      return { advanced: true, round: 'semi' };
    }
    if (revivalR1.length === 0) {
      // 启用复活赛：自动生成首轮（也可由 B-05 提前生成），避免赛程卡住
      const created = await generateRevivalRound1(battle);
      if (created) return { advanced: true, round: 'revival' };
      const four = await rankedTop(battle._id, bracket.KNOCKOUT_SIZE);
      await createRound(battle, four, 'semi');
      return { advanced: true, round: 'semi' };
    }
  }

  // 复活赛首轮结束 → 复活决赛
  if (revivalR1.length && revivalR1.every(decided) && revivalFinal.length === 0) {
    const winners = revivalR1.map((m) => ({ _id: m.winnerAlbumId })).filter((w) => w._id);
    const order = await nextMatchOrder(battle._id);
    const finals = bracket.buildKnockoutMatches(winners, 'revival', {
      roundIndex: 2,
      startOrder: order,
      isRevival: true,
    });
    await BattleMatch.insertMany(finals.map((m) => ({ ...m, battleId: battle._id })));
    return { advanced: true, round: 'revival-final' };
  }

  // 复活决赛结束 → 四强 = 小组第一综合排序前 3 + 复活冠军
  if (revivalFinal.length && revivalFinal.every(decided) && semiMatches.length === 0) {
    const champion = revivalFinal.map((m) => m.winnerAlbumId).filter(Boolean)[0] || null;
    const seeded = await rankedTop(battle._id, champion ? bracket.KNOCKOUT_SIZE - 1 : bracket.KNOCKOUT_SIZE);
    const four = [...seeded, ...(champion ? [{ _id: champion }] : [])];
    await createRound(battle, four, 'semi');
    battle.currentRound = 2;
    await battle.save();
    return { advanced: true, round: 'semi' };
  }

  // 半决赛结束 → 决赛
  if (semiMatches.length && semiMatches.every(decided) && finalMatches.length === 0) {
    const winners = semiMatches.map((m) => ({ _id: m.winnerAlbumId })).filter((w) => w._id);
    await createRound(battle, winners, 'final');
    battle.currentRound = 3;
    await battle.save();
    return { advanced: true, round: 'final' };
  }

  // 决赛结束 → 写冠军
  if (finalMatches.length && finalMatches.every(decided)) {
    await finishBattle(battle, matches);
    return { advanced: true, finished: true };
  }

  return { advanced: false };
}

async function finishBattle(battle, matches) {
  let championAlbumId = null;
  if (battle.scopeType === 'aligned' || battle.scopeType === 'duel') {
    // 对位赛 / 指定对决不产生单一冠军，结果以逐行对照表呈现
    championAlbumId = null;
  } else {
    const finalMatch = matches.find((m) => m.roundName === 'final');
    championAlbumId = finalMatch?.winnerAlbumId || null;
  }
  battle.status = 'finished';
  battle.championAlbumId = championAlbumId;
  await battle.save();
}

/** B-06 结果：标准赛制给夺冠路径；对位赛给逐行对照表 */
export async function getResult(battleId, userId) {
  const battle = await loadOwnedBattle(battleId, userId);
  const matches = await BattleMatch.find({ battleId }).sort({ matchOrder: 1 });
  const albumDocs = await Album.find({ _id: { $in: battle.albumIds } });
  const albumMap = new Map(albumDocs.map((a) => [String(a._id), a]));

  if (battle.scopeType === 'aligned' || battle.scopeType === 'duel') {
    // 逐行对照表：每行一组对位 + 比分 + 胜者（对位赛与指定对决共用）
    const rows = matches.map((m) => {
      const winner = m.winnerAlbumId ? albumMap.get(String(m.winnerAlbumId)) : null;
      return {
        alignIndex: m.roundIndex,
        left: musicService.serializeAlbum(albumMap.get(String(m.leftAlbumId))),
        right: m.rightAlbumId ? musicService.serializeAlbum(albumMap.get(String(m.rightAlbumId))) : null,
        leftVotes: m.leftVotes,
        rightVotes: m.rightVotes,
        // 胜者使用「外部专辑标识」，与 left / right 的 albumId 同口径，便于前端比对
        winnerAlbumId: winner ? winner.albumId : null,
      };
    });

    // 胜场积分：按歌手累计
    const scoreByArtist = new Map();
    for (const m of matches) {
      if (!m.winnerAlbumId) continue;
      const winner = albumMap.get(String(m.winnerAlbumId));
      if (!winner) continue;
      const key = winner.artistExternalId;
      scoreByArtist.set(key, (scoreByArtist.get(key) || 0) + 1);
    }
    const points = [...scoreByArtist.entries()]
      .map(([artistExternalId, wins]) => ({ artistExternalId, wins }))
      .sort((a, b) => b.wins - a.wins);

    return { battle, type: 'aligned', rows, points };
  }

  const champion = battle.championAlbumId ? albumMap.get(String(battle.championAlbumId)) : null;
  // 夺冠路径：冠军参与过的全部场次按轮次顺序
  const path = [];
  if (battle.championAlbumId) {
    const involved = matches
      .filter(
        (m) =>
          String(m.leftAlbumId) === String(battle.championAlbumId) ||
          String(m.rightAlbumId) === String(battle.championAlbumId),
      )
      .sort((a, b) => a.matchOrder - b.matchOrder);
    for (const m of involved) {
      if (m.isBye) {
        // 轮空：无对手、无比分，标记为"直接晋级"，不再渲染成"战胜 — 0 : 0"（2026-09-16 修复）
        path.push({
          roundName: m.roundName,
          roundIndex: m.roundIndex,
          opponent: null,
          score: null,
          won: true,
          isBye: true,
        });
        continue;
      }
      const isLeft = String(m.leftAlbumId) === String(battle.championAlbumId);
      const opponent = albumMap.get(String(isLeft ? m.rightAlbumId : m.leftAlbumId)) || null;
      path.push({
        roundName: m.roundName,
        roundIndex: m.roundIndex,
        opponent: opponent ? musicService.serializeAlbum(opponent) : null,
        score: isLeft ? `${m.leftVotes} : ${m.rightVotes}` : `${m.rightVotes} : ${m.leftVotes}`,
        won: String(m.winnerAlbumId) === String(battle.championAlbumId),
        isBye: false,
      });
    }
  }

  // 新赛制：补充小组赛 / 遗珠复活的分组与晋级信息，供结果页展示"小组赛第 X 组晋级"
  let groupsSummary = null;
  if (battle.tournamentVersion === 2) {
    const bgroups = await BattleGroup.find({ battleId }).sort({ groupNo: 1, roundName: 1 });
    const allIds = bgroups.flatMap((g) => [...g.albumIds, ...g.pickedAlbumIds]);
    const balbumDocs = await Album.find({ _id: { $in: allIds } });
    const bamap = new Map(balbumDocs.map((a) => [String(a._id), a]));
    const ser = (id) => {
      const a = bamap.get(String(id));
      return a ? musicService.serializeAlbum(a) : null;
    };
    groupsSummary = bgroups.map((g) => ({
      groupNo: g.groupNo,
      roundName: g.roundName,
      advanceCount: g.advanceCount,
      albums: g.albumIds.map(ser),
      advanced: g.pickedAlbumIds.map(ser),
    }));
  }

  return {
    battle,
    type: 'standard',
    champion: champion ? musicService.serializeAlbum(champion) : null,
    path,
    groupsSummary,
  };
}

/** 榜单用：冠军专辑被回溯（battle_matches.winnerAlbumId 索引） */
export async function championPathsFor(albumObjectId) {
  const matches = await BattleMatch.find({ winnerAlbumId: albumObjectId }).sort({ createdAt: 1 });
  return matches;
}

export default {
  resolvePool,
  createBattle,
  getBattleDetail,
  getNextMatch,
  getNextStep,
  castGroupVote,
  listMyBattles,
  deleteBattle,
  createRevival,
  progressBattle,
  getResult,
};
