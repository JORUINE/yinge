/**
 * 对决控制器
 * 对应接口：B-01 ~ B-08
 */
import * as battleService from './battle.service.js';
import * as voteService from './vote.service.js';
import { ok, paginated } from '../../shared/response.js';
import { clientMeta } from '../../shared/http.js';

function serializeBattle(battle) {
  return {
    battleId: String(battle._id),
    userId: String(battle.userId),
    scopeType: battle.scopeType,
    scopeKey: battle.scopeKey,
    artists: battle.artists || [],
    alignCount: battle.alignCount,
    withRevival: battle.withRevival,
    status: battle.status,
    // 列表缩略图：「我的对决」用它显示封面（其它接口不带则为 null）
    coverUrl: battle.coverUrl || null,
    groupCount: battle.groupCount,
    roundCount: battle.roundCount,
    currentRound: battle.currentRound,
    matchTotal: battle.matchTotal,
    hasBye: battle.hasBye,
    championAlbumId: battle.championAlbumId ? String(battle.championAlbumId) : null,
    // 新赛制字段（2026-09-17）
    tournamentVersion: battle.tournamentVersion || 1,
    poolTarget: battle.poolTarget || null,
    knockoutSize: battle.knockoutSize || null,
    revivalNeed: battle.revivalNeed || 0,
    stepTotal: battle.stepTotal || null,
    // 好友一起玩（2026-09-18）
    shareCode: battle.shareCode || null,
    originBattleId: battle.originBattleId ? String(battle.originBattleId) : null,
    createdAt: battle.createdAt,
  };
}

/** B-10 生成「同款签表」邀请码（和好友一起玩的入口） */
export async function createInvite(req, res) {
  const { id } = req.validated.params;
  const data = await battleService.createInvite(req.user._id, id);
  return ok(res, data, '邀请已生成');
}

/** B-11 查看同款签表（好友点开链接后看到的介绍） */
export async function getInvite(req, res) {
  const { code } = req.validated.params;
  return ok(res, await battleService.getInvite(code));
}

/** B-12 接龙开局：用同一批专辑开一局自己的 */
export async function joinInvite(req, res) {
  const { code } = req.validated.params;
  const battle = await battleService.joinInvite(req.user._id, code);
  return ok(res, serializeBattle(battle), '同款对决已开局');
}

/** B-13 同款签表对比：冠军是否一致 / 从第几步开始分歧 */
export async function getInviteCompare(req, res) {
  const { code } = req.validated.params;
  return ok(res, await battleService.getInviteCompare(code, req.user._id));
}

export async function create(req, res) {
  const battle = await battleService.createBattle(req.user._id, req.validated.body);
  return ok(res, serializeBattle(battle), '对决创建成功');
}

export async function detail(req, res) {
  const { id } = req.validated.params;
  const { battle, matches, standings, groups } = await battleService.getBattleDetail(id, req.user._id);
  return ok(res, { ...serializeBattle(battle), matches, standings, groups });
}

export async function nextMatch(req, res) {
  const { id } = req.validated.params;
  const result = await battleService.getNextMatch(id, req.user._id);
  return ok(res, result);
}

export async function nextStep(req, res) {
  const { id } = req.validated.params;
  const result = await battleService.getNextStep(id, req.user._id);
  return ok(res, result);
}

export async function groupVote(req, res) {
  const { id, groupId } = req.validated.params;
  const { pickedAlbumIds } = req.validated.body;
  const result = await battleService.castGroupVote(id, groupId, pickedAlbumIds, req.user._id);
  return ok(res, result, result.invalid ? result.message : '投票成功');
}

export async function vote(req, res) {
  const { id, matchId } = req.validated.params;
  const { albumId } = req.validated.body;
  const result = await voteService.castVote({
    battleId: id,
    matchId,
    albumId,
    user: req.user,
    meta: clientMeta(req),
  });
  return ok(res, result, result.invalid ? result.message : '投票成功');
}

export async function revival(req, res) {
  const { id } = req.validated.params;
  const result = await battleService.createRevival(id, req.user._id);
  return ok(res, result, '复活赛已生成');
}

export async function result(req, res) {
  const { id } = req.validated.params;
  const data = await battleService.getResult(id, req.user._id);
  return ok(res, { ...data, battle: serializeBattle(data.battle) });
}

/** B-09 撤销上一步：把最后一票撤回，并把由此推进出来的场次一起退回去 */
export async function undo(req, res) {
  const { id } = req.validated.params;
  const result = await battleService.undoLastStep(id, req.user._id);
  return ok(res, result, `已撤销「${result.undone}」`);
}

export async function listMine(req, res) {
  const { list, page, pageSize, total } = await battleService.listMyBattles(req.user._id, req.validated.query);
  return ok(res, paginated(list.map(serializeBattle), total, page, pageSize));
}

export async function remove(req, res) {
  const { id } = req.validated.params;
  await battleService.deleteBattle(id, req.user._id);
  return ok(res, null, '已删除');
}
