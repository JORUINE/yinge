/**
 * 投票服务
 * ------------------------------------------------------------
 * 对应接口：B-04 投票。规则见《系统设计文档》4.7。
 * 五道校验 + 三级异常判定（轻度限流 / 中度警告 / 重度复核）。
 * 铁律：被判定异常的票不计入排行榜与人格分布统计（isInvalid=true）。
 */
import { Battle, BattleMatch, Vote, Album } from '../../models/index.js';
import { BadRequestError, NotFoundError, ForbiddenError, TooFrequentError, DuplicateError } from '../../shared/errors.js';
import config from '../../config/index.js';
import { decideWinner, progressBattle } from './battle.service.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/**
 * 违规累计处理（设计文档 4.7）：1 次警告 → 2 次限流 48h → 3 次停权 24h → 5 次长期禁用。
 * ⚠️ 2026-09-18 起**投票流程不再调用它**：本作是单人对决，"投得多 / 连续投同一侧"属正常游玩，
 *    惩罚玩家（限流、封号）会直接砍掉主线玩法，用户明确要求"不能失去主要功能"。
 *    保留该函数，供后台人工处置与未来风控使用。
 */
async function applyViolation(user) {
  user.violationCount = (user.violationCount || 0) + 1;
  const count = user.violationCount;
  let action = 'warn';
  if (count >= 5) {
    user.status = 'banned';
    user.bannedReason = 'vote_fraud';
    user.bannedNote = `违规累计 ${count} 次，自动长期禁用`;
    user.bannedAt = new Date();
    action = 'banned';
  } else if (count >= 3) {
    user.restrictUntil = new Date(Date.now() + 24 * 60 * MINUTE);
    action = 'restrict24h';
  } else if (count >= 2) {
    user.restrictUntil = new Date(Date.now() + 48 * 60 * MINUTE);
    action = 'restrict48h';
  }
  await user.save();
  return { action, violationCount: count };
}

/** 轻度限流判定：间隔过短 / 每分钟过多 / 每天过多 —— 返回提示，不计违规 */
async function checkLightRate(userId) {
  const now = Date.now();
  const last = await Vote.findOne({ userId }).sort({ createdAt: -1 }).select('createdAt');
  if (last && now - new Date(last.createdAt).getTime() < config.vote.minIntervalMs) {
    throw new TooFrequentError('操作过于频繁，请稍后再试');
  }
  const [perMinute, perDay] = await Promise.all([
    Vote.countDocuments({ userId, createdAt: { $gte: new Date(now - MINUTE) } }),
    Vote.countDocuments({ userId, createdAt: { $gte: new Date(now - DAY) } }),
  ]);
  if (perMinute >= config.vote.perMinuteLimit) throw new TooFrequentError('操作过于频繁，请稍后再试');
  if (perDay >= config.vote.perDayLimit) throw new TooFrequentError('今日投票次数已达上限');
}

/**
 * 中度异常判定：返回原因或 null
 * ⚠️ 本作是「单人对决」——同一个人要从头把整场赛程投完（最多 100 张 → 约 70 场），
 *    所以"投得多"是正常游玩特征，不是作弊。以下判据只用于把异常票**排除出排行榜统计**，
 *    且**对游客一律不判定**：游客天生就是新账号、数据只留本机，误判会把正常游玩卡死（2026-09-18 修）。
 */
async function detectMediumFraud(user, match) {
  if (user.role === 'guest') return null;
  // 连续 40 场总投同一侧（阈值放宽：有人就是偏爱某一边）
  const recent = await Vote.find({ userId: user._id }).sort({ createdAt: -1 }).limit(40).populate('matchId');
  if (recent.length === 40) {
    const sides = recent
      .filter((v) => v.matchId)
      .map((v) => (String(v.albumId) === String(v.matchId.leftAlbumId) ? 'L' : 'R'));
    if (sides.length === 40 && sides.every((s) => s === sides[0])) return '连续多场投向同一侧';
  }
  // 注册不足 1 小时已投 300 场以上（阈值放宽：一场大型对决就可能上百票）
  const ageMs = Date.now() - new Date(user.createdAt).getTime();
  if (ageMs < 60 * MINUTE) {
    const count = await Vote.countDocuments({ userId: user._id });
    if (count >= 300) return '新账号短时间内大量投票';
  }
  return null;
}

export async function castVote({ battleId, matchId, albumId, user, meta = {} }) {
  const battle = await Battle.findById(battleId);
  if (!battle) throw new NotFoundError('对决');
  if (String(battle.userId) !== String(user._id)) throw new ForbiddenError('无权在该对决中投票');
  if (battle.status !== 'playing') throw new BadRequestError('该对决已结束');

  // 入参 albumId 是「外部专辑标识」（数字或数字字符串，见接口文档 5.4），先解析为本地专辑
  const albumDoc = await Album.findOne({ albumId: Number(albumId) });
  if (!albumDoc) throw new BadRequestError('专辑不存在');
  const albumObjectId = albumDoc._id;

  // 校验 1：场次属于该对决
  const match = await BattleMatch.findOne({ _id: matchId, battleId });
  if (!match) throw new NotFoundError('该场次');

  // 校验 2：专辑确实在本场对阵中（按本地标识比对）
  const inMatch =
    String(match.leftAlbumId) === String(albumObjectId) ||
    String(match.rightAlbumId) === String(albumObjectId);
  if (!inMatch) throw new BadRequestError('该专辑不在本场对阵中');

  // 校验 3：本场未结束
  if (match.winnerAlbumId) throw new DuplicateError('本场已决出结果');

  // 校验 4：该用户对该场次无历史投票（数据库唯一索引兜底）
  const existing = await Vote.exists({ matchId, userId: user._id });
  if (existing) throw new DuplicateError('您已投过这一场');

  // 轻度限流：不计违规
  await checkLightRate(user._id);

  // 中度异常：票**记为异常**（不进排行榜统计），但**仍然推进赛程**。
  // ⚠️ 关键：以前这里直接 return、不推进本场，导致"本场永远决不出胜负 + 该用户再投被唯一索引挡住"，
  //    用户被彻底卡死（2026-09-18 修复：异常票也决定胜负、推进赛程，只是不计入统计）。
  const mediumReason = await detectMediumFraud(user, match);

  await Vote.create({
    matchId,
    battleId,
    albumId: albumObjectId,
    userId: user._id,
    ip: meta.ip || null,
    deviceHash: meta.deviceHash || null,
    isInvalid: Boolean(mediumReason),
    invalidReason: mediumReason || null,
  });

  const isLeft = String(match.leftAlbumId) === String(albumObjectId);
  if (isLeft) match.leftVotes += 1;
  else match.rightVotes += 1;

  // 判定胜负（票多者胜；平票按规则裁决）
  match.winnerAlbumId = await decideWinner(match, battle);
  await match.save();

  // 推进赛程
  const progress = await progressBattle(battle);

  // 返回外部专辑标识（与接口文档 5.4 一致）
  const winnerDoc = match.winnerAlbumId ? await Album.findById(match.winnerAlbumId).select('albumId') : null;

  if (mediumReason) {
    // ⚠️ 只把这一票排除出排行榜统计，**不**累计违规、**不**限流/封号。
    //    理由：本作是「单人对决」，一个人要从头投到尾；"连续投同一侧 / 投得多"是正常游玩特征，
    //    不是作弊。用户明确要求"不能因为玩这个就失去主要功能"，所以这里绝不惩罚玩家。
    return {
      invalid: true,
      reason: mediumReason,
      violation: null,
      matchId: String(match._id),
      winnerAlbumId: winnerDoc?.albumId ?? null,
      leftVotes: match.leftVotes,
      rightVotes: match.rightVotes,
      progress,
      message: '这一票已记录（被判为异常，不计入排行榜）',
    };
  }

  return {
    invalid: false,
    matchId: String(match._id),
    winnerAlbumId: winnerDoc?.albumId ?? null,
    leftVotes: match.leftVotes,
    rightVotes: match.rightVotes,
    progress,
  };
}

/** 榜单统计使用：某专辑的有效票数 */
export async function validVoteCount(albumObjectId) {
  return Vote.countDocuments({ albumId: albumObjectId, isInvalid: false });
}

/** 供榜单聚合：全站有效票 Top 专辑 */
export async function topAlbumsByVotes(limit = 20) {
  return Vote.aggregate([
    { $match: { isInvalid: false } },
    { $group: { _id: '$albumId', votes: { $sum: 1 } } },
    { $sort: { votes: -1 } },
    { $limit: limit },
    { $lookup: { from: 'albums', localField: '_id', foreignField: '_id', as: 'album' } },
    { $unwind: '$album' },
  ]);
}

export default { castVote, validVoteCount, topAlbumsByVotes };
