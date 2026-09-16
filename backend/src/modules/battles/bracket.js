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
    if (!stat.has(key)) stat.set(key, { albumId: key, wins: 0, losses: 0, votes: 0, matches: 0 });
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

  return [...stat.values()].sort((a, b) => b.wins - a.wins || b.votes - a.votes);
}

/** 半决赛配对：按小组序号相邻配对 G1×G2、G3×G4；奇数参赛数时末位轮空 */
export function buildKnockoutMatches(winners, roundName) {
  const matches = [];
  const list = [...winners];
  let order = 1;

  // 轮空：奇数时最后一张直接晋级
  let byeAlbumId = null;
  if (list.length % 2 === 1) byeAlbumId = list.pop();

  for (let i = 0; i < list.length; i += 2) {
    matches.push({
      roundName,
      roundIndex: order,
      matchOrder: order++,
      leftAlbumId: list[i]._id ?? list[i],
      rightAlbumId: list[i + 1] ? list[i + 1]._id ?? list[i + 1] : null,
      isBye: false,
      isRevival: false,
    });
  }

  if (byeAlbumId) {
    matches.push({
      roundName,
      roundIndex: order,
      matchOrder: order,
      leftAlbumId: byeAlbumId._id ?? byeAlbumId,
      rightAlbumId: null,
      isBye: true,
      isRevival: false,
    });
  }
  return matches;
}

/** 标准赛制总场次（由赛制唯一确定，不允许手工填写） */
export function computeStandardTotal(groupMatchCount, withRevival = false) {
  // 小组赛 + 半决赛 2 + 决赛 1
  return groupMatchCount + 2 + 1 + (withRevival ? 2 : 0);
}

/** 对位赛总场次 = C(A,2) × N */
export function computeAlignedTotal(artistCount, alignCount) {
  return ((artistCount * (artistCount - 1)) / 2) * alignCount;
}

export default {
  GROUP_SIZE,
  groupAlbums,
  roundRobinPairs,
  buildGroupMatches,
  buildAlignedMatches,
  computeStandings,
  buildKnockoutMatches,
  computeStandardTotal,
  computeAlignedTotal,
};
