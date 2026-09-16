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
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'BattleMatch', required: true },
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

voteSchema.index({ matchId: 1, userId: 1 }, { unique: true });
voteSchema.index({ battleId: 1 });
voteSchema.index({ albumId: 1, isInvalid: 1 });

export const Vote = mongoose.model('Vote', voteSchema);
export default Vote;
