/**
 * 投票 votes
 * 数据字典：系统设计文档 5.5.3
 * 索引：(matchId, userId) 唯一 —— 单场次单用户单票，前端被绕过也写不进第二票；
 *       battleId（普通）；(albumId, isInvalid) 复合 —— 榜单只统计有效票。
 * 铁律：所有榜单与人格分布统计口径都必须加上 isInvalid = false 的条件。
 */
import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema(
  {
    // 淘汰赛投票指向某一场；小组 / 复活轮的"多选投票"指向某个多选环节（groupId）。
    // 二者互斥：matchId 有值时 groupId 为空，反之亦然（见下面的部分唯一索引）。
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BattleMatch', default: null },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'BattleGroup', default: null },
    battleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Battle', required: true },
    albumId: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ip: { type: String, default: null },
    deviceHash: { type: String, default: null },
    isInvalid: { type: Boolean, required: true, default: false },
    invalidReason: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// 单场次单用户单票（partial：只对淘汰赛投票生效，避免与 groupId 投票冲突）
voteSchema.index(
  { matchId: 1, userId: 1 },
  { unique: true, name: 'match_user_unique', partialFilterExpression: { matchId: { $type: 'objectId' } } },
);
// 同一多选环节内，同一用户对同一张专辑只能投一次
voteSchema.index(
  { groupId: 1, userId: 1, albumId: 1 },
  { unique: true, name: 'group_user_album_unique', partialFilterExpression: { groupId: { $type: 'objectId' } } },
);
voteSchema.index({ battleId: 1 });
voteSchema.index({ albumId: 1, isInvalid: 1 });

export const Vote = mongoose.model('Vote', voteSchema);
export default Vote;
