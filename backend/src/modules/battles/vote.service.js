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

/** 违规累计处理（设计文档 4.7）：1 次警告 → 2 次限流 48h → 3 次停权 24h → 5 次长期禁用 */
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

/** 中度异常判定：返回原因或 null */
async function detectMediumFraud(user, match) {
  // 连续 15 场总投同一侧
  const recent = await Vote.find({ userId: user._id }).sort({ createdAt: -1 }).limit(15).populate('matchId');
  if (recent.length === 15) {
    const sides = recent
      .filter((v) => v.matchId)
      .map((v) => (String(v.albumId) === String(v.matchId.leftAlbumId) ? 'L' : 'R'));
    if (sides.length === 15 && sides.every((s) => s === sides[0])) return '连续多场投向同一侧';
  }
  // 注册不足 1 小时已投 50 场以上
  const ageMs = Date.now() - new Date(user.createdAt).getTime();
  if (ageMs < 60 * MINUTE) {
    const count = await Vote.countDocuments({ userId: user._id });
    if (count >= 50) return '新账号短时间内大量投票';
  }
  return null;
}

export async function castVote({ battleId, matchId, albumId, user, meta = {} }) {
  const battle = await Battle.findById(battleId);
  if (!battle) throw new NotFoundError('对决');
  if (String(battle.userId) !== String(user._id)) throw new ForbiddenError('无权在该对决中投票');
  if (battle.status !== 'playing') throw new BadRequestError('该对决已结束');

  // 校验 1：场次属于该对决
  const match = await BattleMatch.findOne({ _id: matchId, battleId });
  if (!match) throw new NotFoundError('该场次');

  // 校验 2：专辑确实在本场对阵中
  const inMatch =
    String(match.leftAlbumId) === String(albumId) || String(match.rightAlbumId) === String(albumId);
  if (!inMatch) throw new BadRequestError('该专辑不在本场对阵中');

  // 校验 3：本场未结束
  if (match.winnerAlbumId) throw new DuplicateError('本场已决出结果');

  // 校验 4：该用户对该场次无历史投票（数据库唯一索引兜底）
  const existing = await Vote.exists({ matchId, userId: user._id });
  if (existing) throw new DuplicateError('您已投过这一场');

  // 轻度限流：不计违规
  await checkLightRate(user._id);

  // 中度异常：票作废 + 记违规，不参与统计
  const mediumReason = await detectMediumFraud(user, match);
  if (mediumReason) {
    await Vote.create({
      matchId,
      battleId,
      albumId,
      userId: user._id,
      ip: meta.ip || null,
      deviceHash: meta.deviceHash || null,
      isInvalid: true,
      invalidReason: mediumReason,
    });
    const result = await applyViolation(user);
    return {
      invalid: true,
      reason: mediumReason,
      violation: result,
      message: '该票被判定为异常，已作废且不计入统计',
    };
  }

  // 正常投票：落库 + 累加比分
  const vote = await Vote.create({
    matchId,
    battleId,
    albumId,
    userId: user._id,
    ip: meta.ip || null,
    deviceHash: meta.deviceHash || null,
    isInvalid: false,
  });

  const isLeft = String(match.leftAlbumId) === String(albumId);
  if (isLeft) match.leftVotes += 1;
  else match.rightVotes += 1;

  // 判定胜负（票多者胜；平票按规则裁决）
  match.winnerAlbumId = await decideWinner(match, battle);
  await match.save();

  // 推进赛程
  const progress = await progressBattle(battle);

  return {
    invalid: false,
    voteId: String(vote._id),
    match: {
      matchId: String(match._id),
      leftVotes: match.leftVotes,
      rightVotes: match.rightVotes,
      winnerAlbumId: match.winnerAlbumId ? String(match.winnerAlbumId) : null,
    },
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
