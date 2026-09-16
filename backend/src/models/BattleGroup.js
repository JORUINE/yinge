/**
 * 小组 / 复活轮 battle_groups
 * ------------------------------------------------------------
 * 新赛制（battle.tournamentVersion = 2）用来承载"一次多选晋级"的环节：
 *   · 小组赛：每 4 张一组 → 一次勾选 2 张晋级
 *   · 遗珠复活：把落选专辑放一起 → 一次捞回 revivalNeed 张
 * 旧赛制（version = 1）不产生本集合数据 —— 它的小组赛是"组内两两对决"，
 * 落在 battle_matches 里，两套数据互不干扰。
 * 索引：(battleId, groupNo) 复合；battleId + roundName 普通。
 */
import mongoose from 'mongoose';

/** 多选环节的两种类型 */
export const GROUP_ROUNDS = ['group', 'revival'];

const battleGroupSchema = new mongoose.Schema(
  {
    battleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Battle', required: true },
    roundName: { type: String, enum: GROUP_ROUNDS, required: true, default: 'group' },
    groupNo: { type: Number, required: true },
    /** 本组参赛专辑（小组赛 4 张；复活轮 = 全部落选专辑） */
    albumIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Album', required: true },
    /** 需要选出几张晋级 */
    advanceCount: { type: Number, required: true },
    /** 用户勾选晋级的专辑（提交后写入） */
    pickedAlbumIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Album', default: [] },
    pickedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

battleGroupSchema.index({ battleId: 1, groupNo: 1 });
battleGroupSchema.index({ battleId: 1, roundName: 1 });

/** 是否已提交选择 */
battleGroupSchema.methods.isPicked = function isPicked() {
  return this.pickedAt != null;
};

export const BattleGroup = mongoose.model('BattleGroup', battleGroupSchema);
export default BattleGroup;
