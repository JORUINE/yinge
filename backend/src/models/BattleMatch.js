/**
 * 对战场次 battle_matches
 * 数据字典：系统设计文档 5.5.2
 * 索引：(battleId, matchOrder) 复合 —— 按对决取下一场；winnerAlbumId（普通）
 * 说明：roundIndex 含义随赛制变化：
 *         小组赛 = 组内场序；淘汰赛 = 轮次编号；对位赛 = 对位序号（第 k 张专辑）。
 */
import mongoose from 'mongoose';

export const ROUND_NAMES = ['group', 'revival', 'semi', 'final'];

const battleMatchSchema = new mongoose.Schema(
  {
    battleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Battle', required: true },
    roundIndex: { type: Number, required: true },
    roundName: { type: String, enum: ROUND_NAMES, required: true },
    groupNo: { type: Number, default: null },
    matchOrder: { type: Number, required: true },
    leftAlbumId: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
    rightAlbumId: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', default: null },
    leftVotes: { type: Number, required: true, default: 0 },
    rightVotes: { type: Number, required: true, default: 0 },
    winnerAlbumId: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', default: null },
    isBye: { type: Boolean, required: true, default: false },
    isRevival: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

battleMatchSchema.index({ battleId: 1, matchOrder: 1 });
battleMatchSchema.index({ winnerAlbumId: 1 });

export const BattleMatch = mongoose.model('BattleMatch', battleMatchSchema);
export default BattleMatch;
