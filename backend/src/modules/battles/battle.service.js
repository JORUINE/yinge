/**
 * 对决服务
 * ------------------------------------------------------------
 * 对应接口：B-01 创建 / B-02 详情 / B-03 下一场 / B-05 复活赛 / B-06 结果 / B-07 我的对决 / B-08 删除
 * 赛制规则见《系统设计文档》第四章；本文件只做编排，赛制数学在 bracket.js。
 */
import { Battle, BattleMatch, Album, Artist } from '../../models/index.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/http.js';
import * as musicService from '../music/music.service.js';
import * as bracket from './bracket.js';

const byReleaseThenId = (a, b) => {
  const ta = a.releaseDate ? new Date(a.releaseDate).getTime() : Number.MAX_SAFE_INTEGER;
  const tb = b.releaseDate ? new Date(b.releaseDate).getTime() : Number.MAX_SAFE_INTEGER;
  return ta - tb || a.albumId - b.albumId;
};

/** 取某歌手的合格专辑（已缓存优先，必要时同步） */
async function eligibleAlbumsOf(artistExternalId) {
  const { albums } = await musicService.getArtistAlbums(artistExternalId);
  return albums.filter((a) => a.isEligible).sort(byReleaseThenId);
}

/** 依据范围模式解析参赛池 */
export async function resolvePool(payload) {
  const { scopeType } = payload;

  if (scopeType === 'artist') {
    const list = await eligibleAlbumsOf(payload.artistId);
    return { albums: list, artists: [{ artistId: Number(payload.artistId), albumCount: list.length }] };
  }

  if (scopeType === 'multi-artist') {
    const picked = [];
    const artists = [];
    for (const item of payload.artists) {
      const list = await eligibleAlbumsOf(item.artistId);
      const take = item.albumCount ? list.slice(0, item.albumCount) : list;
      picked.push(...take);
      artists.push({ artistId: Number(item.artistId), albumCount: take.length });
    }
    return { albums: picked, artists };
  }

  if (scopeType === 'custom') {
    const list = await Album.find({ albumId: { $in: payload.albumIds.map(Number) } });
    if (list.length !== payload.albumIds.length) throw new BadRequestError('存在无效的专辑标识');
    return { albums: list.sort(byReleaseThenId), artists: [] };
  }

  if (scopeType === 'genre') {
    const matched = await Artist.find({ genre: new RegExp(payload.genre, 'i') }).select('artistId');
    const ids = matched.map((a) => a.artistId);
    if (!ids.length) throw new BadRequestError('该流派下暂无已缓存的歌手，请先搜索歌手');
    const list = await Album.find({ artistExternalId: { $in: ids }, isEligible: true }).sort({ releaseDate: 1 });
    return { albums: list, artists: ids.map((id) => ({ artistId: id, albumCount: 0 })) };
  }

  if (scopeType === 'era') {
    const filter = { isEligible: true };
    if (payload.startYear || payload.endYear) {
      filter.releaseDate = {};
      if (payload.startYear) filter.releaseDate.$gte = new Date(`${payload.startYear}-01-01`);
      if (payload.endYear) filter.releaseDate.$lte = new Date(`${payload.endYear}-12-31`);
    }
    const list = await Album.find(filter).sort({ releaseDate: 1 });
    return { albums: list, artists: [] };
  }

  if (scopeType === 'aligned') {
    const perArtist = [];
    const artists = [];
    for (const item of payload.artists) {
      const list = await eligibleAlbumsOf(item.artistId);
      const take = list.slice(0, payload.alignCount);
      perArtist.push(take);
      artists.push({ artistId: Number(item.artistId), albumCount: take.length, name: '' });
    }
    return { albums: perArtist.flat(), artists, alignedLists: perArtist };
  }

  throw new BadRequestError(`不支持的范围模式：${scopeType}`);
}

export async function createBattle(userId, payload) {
  const { albums, artists, alignedLists } = await resolvePool(payload);

  if (payload.scopeType === 'aligned') {
    const n = Math.min(...alignedLists.map((l) => l.length));
    if (n < 1) throw new BadRequestError('所选歌手的正式专辑不足以对位');
    const matches = bracket.buildAlignedMatches(alignedLists);
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
      matchTotal: bracket.computeAlignedTotal(alignedLists.length, n),
      hasBye: false,
      albumIds: albums.map((a) => a._id),
    });
    await BattleMatch.insertMany(matches.map((m) => ({ ...m, battleId: battle._id })));
    return battle;
  }

  // 标准赛制：创建时至少 4 张
  if (albums.length < 4) throw new BadRequestError('参赛专辑不得少于 4 张');

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

  return {
    battle,
    matches: matches.map((m) => serializeMatch(m, albumMap)),
    standings,
  };
}

function serializeMatch(match, albumMap) {
  const left = albumMap.get(String(match.leftAlbumId));
  const right = match.rightAlbumId ? albumMap.get(String(match.rightAlbumId)) : null;
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
    winnerAlbumId: match.winnerAlbumId ? String(match.winnerAlbumId) : null,
    isBye: match.isBye,
    isRevival: match.isRevival,
  };
}

/** B-03 下一场：返回当前应投的场次 */
export async function getNextMatch(battleId, userId) {
  await loadOwnedBattle(battleId, userId);
  const match = await BattleMatch.findOne({
    battleId,
    isBye: false,
    winnerAlbumId: null,
  }).sort({ matchOrder: 1 });
  if (!match) return null;

  const albumDocs = await Album.find({
    _id: { $in: [match.leftAlbumId, match.rightAlbumId].filter(Boolean) },
  });
  const albumMap = new Map(albumDocs.map((a) => [String(a._id), a]));
  const decidedCount = await BattleMatch.countDocuments({ battleId, winnerAlbumId: { $ne: null } });
  const votableTotal = await BattleMatch.countDocuments({ battleId, isBye: false });

  return {
    match: serializeMatch(match, albumMap),
    progress: { decided: decidedCount, total: votableTotal },
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
  return { list, page, pageSize, total };
}

export async function deleteBattle(battleId, userId) {
  await loadOwnedBattle(battleId, userId);
  await BattleMatch.deleteMany({ battleId });
  await Battle.deleteOne({ _id: battleId });
  return true;
}

/** B-05 复活赛：各组第二名两两配对，生成复活赛场次 */
export async function createRevival(battleId, userId) {
  const battle = await loadOwnedBattle(battleId, userId);
  const groupMatches = await BattleMatch.find({ battleId, roundName: 'group' });
  if (!groupMatches.every((m) => m.isBye || m.winnerAlbumId)) {
    throw new BadRequestError('小组赛尚未结束，暂不能开启复活赛');
  }
  const existing = await BattleMatch.countDocuments({ battleId, roundName: 'revival' });
  if (existing) throw new BadRequestError('复活赛已生成');

  const groupNos = [...new Set(groupMatches.map((m) => m.groupNo))].sort((a, b) => a - b);
  const runnersUp = [];
  for (const no of groupNos) {
    const rows = bracket.computeStandings(groupMatches.filter((m) => m.groupNo === no));
    if (rows[1]) runnersUp.push({ _id: rows[1].albumId });
  }
  if (runnersUp.length < 2) throw new BadRequestError('可进入复活赛的专辑不足');

  const matches = bracket.buildKnockoutMatches(runnersUp, 'revival').map((m) => ({ ...m, isRevival: true }));
  await BattleMatch.insertMany(matches.map((m) => ({ ...m, battleId: battle._id })));
  battle.withRevival = true;
  await battle.save();
  return { created: matches.length };
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

async function computeGroupWinners(battleId) {
  const groupMatches = await BattleMatch.find({ battleId, roundName: 'group' });
  const groupNos = [...new Set(groupMatches.map((m) => m.groupNo))].sort((a, b) => a - b);
  const winners = [];
  for (const no of groupNos) {
    const rows = bracket.computeStandings(groupMatches.filter((m) => m.groupNo === no));
    if (rows[0]) winners.push({ _id: rows[0].albumId });
  }
  return winners;
}

/**
 * 推进对决：某一轮全部决出后自动生成下一轮；决赛结束则写冠军。
 * 由投票服务在每票落库后调用。
 */
export async function progressBattle(battle) {
  const matches = await BattleMatch.find({ battleId: battle._id }).sort({ matchOrder: 1 });
  const decided = (m) => m.isBye || Boolean(m.winnerAlbumId);

  if (battle.scopeType === 'aligned') {
    if (matches.every(decided)) {
      await finishBattle(battle, matches);
      return { advanced: true, finished: true };
    }
    return { advanced: false };
  }

  const groupMatches = matches.filter((m) => m.roundName === 'group');
  const revivalMatches = matches.filter((m) => m.roundName === 'revival');
  const semiMatches = matches.filter((m) => m.roundName === 'semi');
  const finalMatches = matches.filter((m) => m.roundName === 'final');

  if (groupMatches.length && groupMatches.every(decided) && semiMatches.length === 0) {
    const winners = await computeGroupWinners(battle._id);
    const semis = bracket.buildKnockoutMatches(winners, 'semi');
    await BattleMatch.insertMany(semis.map((m) => ({ ...m, battleId: battle._id })));
    battle.currentRound = 2;
    await battle.save();
    return { advanced: true, round: 'semi' };
  }

  if (semiMatches.length && semiMatches.every(decided) && finalMatches.length === 0) {
    const winners = semiMatches.map((m) => ({ _id: m.winnerAlbumId })).filter((w) => w._id);
    const finals = bracket.buildKnockoutMatches(winners, 'final');
    await BattleMatch.insertMany(finals.map((m) => ({ ...m, battleId: battle._id })));
    battle.currentRound = 3;
    await battle.save();
    return { advanced: true, round: 'final' };
  }

  if (finalMatches.length && finalMatches.every(decided)) {
    await finishBattle(battle, matches);
    return { advanced: true, finished: true };
  }

  // 复活赛已全部决出但淘汰赛尚未开始：以各组第一 + 复活胜者重组四强
  if (
    revivalMatches.length &&
    revivalMatches.every(decided) &&
    semiMatches.length === 0 &&
    groupMatches.every(decided)
  ) {
    const winners = await computeGroupWinners(battle._id);
    const revivalWinners = revivalMatches.map((m) => ({ _id: m.winnerAlbumId })).filter((w) => w._id);
    const four = [...winners, ...revivalWinners].slice(0, bracket.KNOCKOUT_SIZE);
    const semis = bracket.buildKnockoutMatches(four, 'semi');
    await BattleMatch.insertMany(semis.map((m) => ({ ...m, battleId: battle._id })));
    battle.currentRound = 2;
    await battle.save();
    return { advanced: true, round: 'semi' };
  }

  return { advanced: false };
}

async function finishBattle(battle, matches) {
  let championAlbumId = null;
  if (battle.scopeType === 'aligned') {
    // 对位赛不产生单一冠军，结果以逐行对照表呈现
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

  if (battle.scopeType === 'aligned') {
    // 逐行对照表：每行一组对位 + 比分 + 胜者
    const rows = matches.map((m) => ({
      alignIndex: m.roundIndex,
      left: musicService.serializeAlbum(albumMap.get(String(m.leftAlbumId))),
      right: m.rightAlbumId ? musicService.serializeAlbum(albumMap.get(String(m.rightAlbumId))) : null,
      leftVotes: m.leftVotes,
      rightVotes: m.rightVotes,
      winnerAlbumId: m.winnerAlbumId ? String(m.winnerAlbumId) : null,
    }));

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
      const isLeft = String(m.leftAlbumId) === String(battle.championAlbumId);
      const opponent = albumMap.get(String(isLeft ? m.rightAlbumId : m.leftAlbumId)) || null;
      path.push({
        roundName: m.roundName,
        roundIndex: m.roundIndex,
        opponent: opponent ? musicService.serializeAlbum(opponent) : null,
        score: isLeft ? `${m.leftVotes} : ${m.rightVotes}` : `${m.rightVotes} : ${m.leftVotes}`,
        won: String(m.winnerAlbumId) === String(battle.championAlbumId),
      });
    }
  }

  return {
    battle,
    type: 'standard',
    champion: champion ? musicService.serializeAlbum(champion) : null,
    path,
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
  listMyBattles,
  deleteBattle,
  createRevival,
  progressBattle,
  getResult,
};
