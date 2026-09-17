/**
 * 赛制计算（纯函数，不碰数据库）
 * ------------------------------------------------------------
 * 对应《系统设计文档》4.4 / 4.5 / 4.6。
 *
 * 以 12 张专辑为例的标准赛制：
 *   分组：每 3 张一组 → 4 组
 *   小组赛：组内单循环 C(3,2)=3 场/组 → 12 场
 *   半决赛：2 场   决赛：1 场
 *   合计：15 场（不含复活赛）
 *
 * 约定说明（设计文档未明确、代码中取确定值，需在文档中回填确认）：
 *   - 半决赛配对：G1×G2、G3×G4（按小组序号相邻配对），保证结果确定且可复现。
 *   - 轮空：某轮参赛数为奇数时安排一张轮空（isBye=true），轮空不计入用户投票场次。
 */

export const GROUP_SIZE = 3;
export const KNOCKOUT_SIZE = 4;

// ============================================================
// 新赛制（2026-09-17）：小组赛「4 选 2」+ 遗珠复活 + 1v1 淘汰
// ------------------------------------------------------------
// 与旧赛制（GROUP_SIZE=3 组内两两对决）并存：旧赛制服务于已创建的历史对决，
// 新赛制由 planTournament 规划，两者互不影响，便于灰度切换。
// ============================================================

/** 小组赛每组张数 */
export const GROUP_PICK_SIZE = 4;
/** 每组晋级张数（4 张组选 2；3 张组选 2；2 张组选 1；1 张组直接晋级） */
export const GROUP_ADVANCE = 2;
/** 单场对决参赛专辑上限 */
export const MAX_POOL = 32;
/** 单歌手模式可选档位（张） */
export const SINGER_SCALES = [8, 12, 16, 24, 32];
/** 多歌手模式"每位歌手"可选档位（张） */
export const PER_ARTIST_SCALES = [4, 6, 8, 10];
export const DEFAULT_SINGER_SCALE = 16;
export const DEFAULT_PER_ARTIST = 8;
export const DEFAULT_ARTIST_COUNT = 3;

/** 某组的晋级张数：≥3 张选 2，2 张选 1，1 张直接晋级 */
function advanceOfGroup(size) {
  return size >= 3 ? GROUP_ADVANCE : 1;
}

/**
 * 解析"目标总张数"：多歌手 = 每位张数 × 歌手数；单歌手 = 所选档位；一律封顶 MAX_POOL。
 * @param {{singerScale?: number, perArtist?: number, artistCount?: number}} opts
 */
export function resolvePoolSize({ singerScale, perArtist, artistCount } = {}) {
  const target =
    perArtist && artistCount ? perArtist * artistCount : Number(singerScale) || DEFAULT_SINGER_SCALE;
  return Math.max(2, Math.min(target, MAX_POOL));
}

/**
 * 赛制规划（纯函数，不碰数据库）：由参赛专辑数算出完整赛程安排。
 *   ① 小组赛：每 4 张一组（末组可为 1~4 张），每组选出 2 张晋级
 *   ② 遗珠复活：把晋级数补齐到"不小于它的最小 2 的幂"，差额靠复活轮一次捞回
 *   ③ 淘汰赛：2 的幂张数 1v1 逐轮减半，共 (knockoutSize − 1) 场
 *   ④ 总步数 = 小组赛组数 +（有复活 ? 1 : 0）+ 淘汰赛场次
 * @param {number} total 参赛专辑数
 */
export function planTournament(total) {
  const t = Math.floor(Number(total) || 0);
  if (t < 2) return null;

  const groupSizes = [];
  for (let i = 0; i < t; i += GROUP_PICK_SIZE) {
    groupSizes.push(Math.min(GROUP_PICK_SIZE, t - i));
  }
  const advancePerGroup = groupSizes.map(advanceOfGroup);
  const qualified = advancePerGroup.reduce((a, b) => a + b, 0);

  let knockoutSize = 1;
  while (knockoutSize < qualified) knockoutSize *= 2;
  const revivalNeed = knockoutSize - qualified;

  const groupSteps = groupSizes.filter((s) => s > 1).length; // 只有 1 张的组无需投票，自动晋级（2026-09-17 修复"从 1 张里选 1 张"的无效步骤）
  const revivalSteps = revivalNeed > 0 ? 1 : 0;
  const knockoutMatches = knockoutSize - 1;

  return {
    total: t,
    groupSizes,
    groupCount: groupSizes.length,
    advancePerGroup,
    qualified,
    revivalNeed,
    knockoutSize,
    groupSteps,
    revivalSteps,
    knockoutMatches,
    totalSteps: groupSteps + revivalSteps + knockoutMatches,
  };
}

/** 淘汰赛轮次名：由该轮参赛张数推出（32/16/8/4/2 → r32/r16/qf/semi/final） */
export function roundNameFor(participants) {
  if (participants >= 32) return 'r32';
  if (participants >= 16) return 'r16';
  if (participants >= 8) return 'qf';
  if (participants >= 4) return 'semi';
  return 'final';
}

/**
 * 按 planTournament 的规划切分小组：已排序的专辑按每 4 张一段切开。
 * @param {Array} albums 参赛专辑（已按强度排序）
 * @returns {Array<{groupNo:number, albumIds:Array, advanceCount:number}>}
 */
export function buildGroupDefs(albums) {
  const defs = [];
  let no = 1;
  for (let i = 0; i < albums.length; i += GROUP_PICK_SIZE) {
    const slice = albums.slice(i, i + GROUP_PICK_SIZE);
    defs.push({
      groupNo: no,
      albumIds: slice.map((a) => (a && a._id ? a._id : a)),
      advanceCount: advanceOfGroup(slice.length),
    });
    no += 1;
  }
  return defs;
}

/**
 * 跨歌手分组（新赛制）：**跨歌手优先** —— 尽量让同一组里的专辑来自不同歌手。
 * 做法：每轮从"剩余专辑最多"的歌手各取一张，凑满 4 张成一组；
 * 只有剩下不足 2 位歌手时，才把余下专辑补进组里（此时才出现同歌手同组）。
 * 对应《赛制升级方案》第六节"跨歌手优先配对"的第 ① 条。
 */
export function buildGroupDefsCrossArtist(albums) {
  const buckets = new Map();
  for (const al of albums) {
    const key = String(al.artistExternalId ?? 'unknown');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(al);
  }
  const availSorted = () =>
    [...buckets.entries()].filter(([, list]) => list.length).sort((a, b) => b[1].length - a[1].length);

  const defs = [];
  let no = 1;
  for (;;) {
    const avail = availSorted();
    if (!avail.length) break;
    const group = [];
    // 第一轮：每位还有专辑的歌手各取一张（跨歌手优先）
    for (const [, list] of avail) {
      if (group.length >= GROUP_PICK_SIZE) break;
      group.push(list.shift());
    }
    // 第二轮：歌手数不足 4 位时，从剩余最多的歌手继续补足
    for (;;) {
      if (group.length >= GROUP_PICK_SIZE) break;
      const more = availSorted();
      if (!more.length) break;
      group.push(more[0][1].shift());
    }
    defs.push({
      groupNo: no,
      albumIds: group.map((a) => (a && a._id ? a._id : a)),
      advanceCount: advanceOfGroup(group.length),
    });
    no += 1;
  }
  return defs;
}

/** 淘汰赛某轮对阵：标准种子配对（第 1 对第 n、第 2 对第 n−1…），轮次名由本轮人数推出 */
export function buildKnockoutRound(seeds, { startOrder = 1 } = {}) {
  const participants = seeds.length;
  return buildKnockoutMatches(seeds, roundNameFor(participants), { roundIndex: 1, startOrder });
}

/**
 * 分组：每 3 张一组，同一歌手的多张专辑尽量分散到不同组。
 * 做法：先按歌手专辑数降序，再按轮转法依次落组。
 */
export function groupAlbums(albums) {
  const total = albums.length;
  const groupCount = Math.max(1, Math.ceil(total / GROUP_SIZE));
  const groups = Array.from({ length: groupCount }, () => []);

  const byArtist = new Map();
  for (const album of albums) {
    const key = String(album.artistExternalId ?? 'unknown');
    if (!byArtist.has(key)) byArtist.set(key, []);
    byArtist.get(key).push(album);
  }
  const buckets = [...byArtist.values()].sort((a, b) => b.length - a.length);

  let offset = 0;
  for (const bucket of buckets) {
    bucket.forEach((album, index) => {
      const g = (offset + index) % groupCount;
      groups[g].push(album);
    });
    offset = (offset + bucket.length) % groupCount;
  }
  return { groups, groupCount };
}

/**
 * 跨歌手分组：保证「同一歌手的专辑不落在同一组」（《系统设计文档》4.4 规则 2）。
 * 组容量 = min(GROUP_SIZE, 歌手数)，因此每组至多含每位歌手一张，组内单循环产生的
 * 对局必然全部是跨歌手对局。
 * 落组策略：每轮从「剩余专辑最多」的若干位歌手各取一张组成一组，使各组歌手互不相同
 * 且专辑分布均衡；结果只由入参决定，可复现（4.4 规则 4）。
 * 若只剩一位歌手仍有剩余（专辑数多于其他歌手可配对的数量），这些专辑没有跨歌手对手，
 * 归入 unpaired 不参与对阵——这是"同一歌手不互相对决"规则的必然结果。
 * @param {Array} albums 参赛专辑（含 artistExternalId）
 * @param {number} artistCount 歌手数
 */
export function groupAlbumsCrossArtist(albums, artistCount) {
  const size = Math.max(1, Math.min(GROUP_SIZE, Math.max(1, artistCount)));
  const buckets = new Map();
  for (const album of albums) {
    const key = String(album.artistExternalId ?? 'unknown');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(album);
  }

  const groups = [];
  const unpaired = [];
  for (;;) {
    const avail = [...buckets.entries()]
      .filter(([, list]) => list.length)
      .sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
    if (avail.length < 2) {
      if (avail.length === 1) unpaired.push(...avail[0][1]);
      break;
    }
    groups.push(avail.slice(0, size).map(([, list]) => list.shift()));
  }
  return { groups, groupCount: groups.length, groupSize: size, unpaired };
}

/**
 * 跨歌手淘汰赛取人：按综合排序（ranked 需已排序）选出至多 needed 张，
 * 且每位歌手至多 1 张，从而保证淘汰赛阶段半决赛、决赛同样是跨歌手对阵。
 * @param {Array} ranked 已排序的专辑项（元素可为 ObjectId 或 { _id }）
 * @param {(item:any)=>any} artistOf 取该项歌手标识的函数
 * @param {number} needed 名额上限
 */
export function pickOnePerArtist(ranked, artistOf, needed) {
  const picked = [];
  const used = new Set();
  for (const item of ranked) {
    if (picked.length >= needed) break;
    const key = String(artistOf(item) ?? 'unknown');
    if (used.has(key)) continue;
    used.add(key);
    picked.push(item);
  }
  return picked;
}

/** 组内单循环：返回所有两两组合 */
export function roundRobinPairs(list) {
  const pairs = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) pairs.push([list[i], list[j]]);
  }
  return pairs;
}

/** 生成小组赛场次。roundIndex = 组内场序，matchOrder = 全局播放顺序 */
export function buildGroupMatches(groups) {
  const matches = [];
  let matchOrder = 1;
  groups.forEach((group, groupIdx) => {
    roundRobinPairs(group).forEach((pair, pairIdx) => {
      matches.push({
        roundName: 'group',
        roundIndex: pairIdx + 1,
        groupNo: groupIdx + 1,
        matchOrder: matchOrder++,
        leftAlbumId: pair[0]._id,
        rightAlbumId: pair[1]._id,
        isBye: false,
        isRevival: false,
      });
    });
  });
  return matches;
}

/**
 * 对位赛对阵：第 k 张 vs 第 k 张。
 * roundIndex = 对位序号 k；组内两两配对即 C(歌手数,2)。
 * 总场次 = C(A,2) × N（A 歌手数，N 对位张数）。
 */
export function buildAlignedMatches(alignedLists) {
  const matches = [];
  let matchOrder = 1;
  const n = Math.min(...alignedLists.map((list) => list.length));
  for (let k = 0; k < n; k += 1) {
    for (let i = 0; i < alignedLists.length; i += 1) {
      for (let j = i + 1; j < alignedLists.length; j += 1) {
        matches.push({
          roundName: 'group', // 对位赛不淘汰，全部视为同轮次内的对阵
          roundIndex: k + 1, // 对位序号：第 k+1 张
          groupNo: k + 1,
          matchOrder: matchOrder++,
          leftAlbumId: alignedLists[i][k]._id,
          rightAlbumId: alignedLists[j][k]._id,
          isBye: false,
          isRevival: false,
        });
      }
    }
  }
  return matches;
}

/** 分组积分/战绩表（胜场 → 总票数），用于小组晋级判定与前端小组战绩展示 */
export function computeStandings(groupMatches) {
  const stat = new Map();
  const ensure = (id) => {
    const key = String(id);
    if (!stat.has(key)) {
      stat.set(key, { albumId: key, wins: 0, losses: 0, votes: 0, matches: 0, seq: stat.size });
    }
    return stat.get(key);
  };

  for (const match of groupMatches) {
    const left = ensure(match.leftAlbumId);
    left.matches += 1;
    left.votes += match.leftVotes || 0;

    if (match.isBye) {
      if (match.winnerAlbumId) ensure(match.winnerAlbumId).wins += 1;
      continue;
    }
    if (!match.rightAlbumId) continue;

    const right = ensure(match.rightAlbumId);
    right.matches += 1;
    right.votes += match.rightVotes || 0;

    if (match.winnerAlbumId) {
      ensure(match.winnerAlbumId).wins += 1;
      const loserId =
        String(match.winnerAlbumId) === String(match.leftAlbumId) ? match.rightAlbumId : match.leftAlbumId;
      if (loserId) ensure(loserId).losses += 1;
    }
  }

  // 综合排序：胜场数 → 总得票数 → 组内序号（seq 即专辑在小组内的固定次序）
  return [...stat.values()].sort((a, b) => b.wins - a.wins || b.votes - a.votes || a.seq - b.seq);
}

/**
 * 淘汰赛对阵生成（标准种子配对）。
 * 传入的 ranked 必须已按综合排序排好；本函数按「第 1 对第 n、第 2 对第 n-1……」配对，
 * 使成绩最好者对上成绩最差者；轮空给排序最前的一张。
 * @param {Array} ranked 已排序的参赛对象（元素可为 ObjectId 或 { _id }）
 * @param {string} roundName 'revival' | 'semi' | 'final'
 * @param {{roundIndex?: number, startOrder?: number, isRevival?: boolean}} options
 */
export function buildKnockoutMatches(ranked, roundName, options = {}) {
  const { roundIndex = 1, startOrder = 1, isRevival = roundName === 'revival' } = options;
  const list = [...ranked];
  const toId = (x) => (x && x._id ? x._id : x);
  const matches = [];
  let order = startOrder;

  // 轮空：奇数时取排序最前的一张直接进入下一轮
  let bye = null;
  if (list.length % 2 === 1) bye = list.shift();

  const n = list.length;
  for (let i = 0; i < Math.floor(n / 2); i += 1) {
    matches.push({
      roundName,
      roundIndex,
      matchOrder: order++,
      leftAlbumId: toId(list[i]),
      rightAlbumId: toId(list[n - 1 - i]),
      isBye: false,
      isRevival,
    });
  }

  if (bye) {
    matches.push({
      roundName,
      roundIndex,
      matchOrder: order++,
      leftAlbumId: toId(bye),
      rightAlbumId: null,
      isBye: true,
      isRevival: false,
    });
  }
  return matches;
}

/**
 * 标准赛制总场次（由赛制唯一确定，不允许手工填写）
 * = 小组赛场次 + 半决赛 2 + 决赛 1 +（启用复活赛 ? 复活赛 3 : 0）
 */
export function computeStandardTotal(groupMatchCount, withRevival = false) {
  return groupMatchCount + 3 + (withRevival ? 3 : 0);
}

/** 对位赛总场次 = C(A,2) × N */
export function computeAlignedTotal(artistCount, alignCount) {
  return ((artistCount * (artistCount - 1)) / 2) * alignCount;
}

/**
 * 对位赛「年代就近」配对：把各歌手专辑排到同一条发行时间轴，
 * 每轮取时间最接近、且来自不同歌手的两张配成一组（一对一、不重复）。
 * 各歌手专辑数相等时，总场次与「同序号」一致，仍为 C(A,2) × N。
 */
export function buildAlignedChronoMatches(alignedLists) {
  const dateOf = (a) => (a?.releaseDate ? new Date(a.releaseDate).getTime() : Number.MAX_SAFE_INTEGER);
  const pools = alignedLists.map((list) => [...list]);
  const matches = [];
  let matchOrder = 1;
  let groupNo = 0;

  const nonEmpty = () => pools.filter((p) => p.length).length;

  while (nonEmpty() >= 2) {
    groupNo += 1;
    // 取当前最早发行的一张作为锚点
    let anchorPool = -1;
    let best = Infinity;
    pools.forEach((p, pi) => {
      if (p.length && dateOf(p[0]) < best) {
        best = dateOf(p[0]);
        anchorPool = pi;
      }
    });
    const anchor = pools[anchorPool].shift();
    const anchorTime = dateOf(anchor);
    const group = [{ pool: anchorPool, album: anchor }];

    // 其他歌手各取与锚点发行时间最接近的一张
    for (let pi = 0; pi < pools.length; pi += 1) {
      if (pi === anchorPool || !pools[pi].length) continue;
      let bi = 0;
      let bd = Infinity;
      pools[pi].forEach((al, ai) => {
        const d = Math.abs(dateOf(al) - anchorTime);
        if (d < bd) {
          bd = d;
          bi = ai;
        }
      });
      group.push({ pool: pi, album: pools[pi].splice(bi, 1)[0] });
    }

    group.sort((x, y) => x.pool - y.pool);
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        matches.push({
          roundName: 'group',
          roundIndex: groupNo,
          groupNo,
          matchOrder: matchOrder++,
          leftAlbumId: group[i].album._id,
          rightAlbumId: group[j].album._id,
          isBye: false,
          isRevival: false,
        });
      }
    }
  }
  return matches;
}

/**
 * 指定对决对阵：由用户逐行指定对位组，每组两张专辑直接单挑。
 * roundIndex / groupNo = 对位组序号；组数即用户指定的组数。
 */
export function buildDuelMatches(duelPairs) {
  return duelPairs.map((pair, idx) => ({
    roundName: 'duel',
    roundIndex: idx + 1,
    groupNo: idx + 1,
    matchOrder: idx + 1,
    leftAlbumId: pair[0]._id,
    rightAlbumId: pair[1]._id,
    isBye: false,
    isRevival: false,
  }));
}

export default {
  GROUP_SIZE,
  KNOCKOUT_SIZE,
  GROUP_PICK_SIZE,
  GROUP_ADVANCE,
  MAX_POOL,
  SINGER_SCALES,
  PER_ARTIST_SCALES,
  DEFAULT_SINGER_SCALE,
  DEFAULT_PER_ARTIST,
  DEFAULT_ARTIST_COUNT,
  resolvePoolSize,
  planTournament,
  roundNameFor,
  buildGroupDefs,
  buildGroupDefsCrossArtist,
  buildKnockoutRound,
  groupAlbums,
  groupAlbumsCrossArtist,
  pickOnePerArtist,
  roundRobinPairs,
  buildGroupMatches,
  buildAlignedMatches,
  buildAlignedChronoMatches,
  buildDuelMatches,
  computeStandings,
  buildKnockoutMatches,
  computeStandardTotal,
  computeAlignedTotal,
};
