/**
 * 对决 battles
 * 数据字典：系统设计文档 5.5.1
 * 索引：(userId, createdAt) 复合 —— 我的对决按时间倒序；status（普通）
 * 说明：matchTotal 由赛制计算得出，不允许手工填写；
 *       对位赛复用 alignCount 存每位歌手取前几张，不新增表。
 */
import mongoose from 'mongoose';

/** 六种范围模式（设计文档 4 章） */
export const SCOPE_TYPES = ['artist', 'multi-artist', 'genre', 'era', 'custom', 'aligned', 'duel'];

const battleArtistSchema = new mongoose.Schema(
  {
    artistId: { type: Number, required: true },
    name: { type: String, required: true },
    albumCount: { type: Number, default: 0 },
  },
  { _id: false },
);

const battleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    scopeType: { type: String, enum: SCOPE_TYPES, required: true },
    scopeKey: { type: String, default: null },
    artists: { type: [battleArtistSchema], default: undefined },
    alignCount: { type: Number, default: null },
    withRevival: { type: Boolean, required: true, default: false },
    status: { type: String, enum: ['playing', 'finished'], required: true, default: 'playing' },
    groupCount: { type: Number, required: true },
    roundCount: { type: Number, required: true },
    currentRound: { type: Number, required: true, default: 1 },
    matchTotal: { type: Number, required: true },
    hasBye: { type: Boolean, required: true, default: false },
    // ---- 新赛制字段（2026-09-17）----
    // tournamentVersion: 1 = 旧赛制（组内两两对决 + 半决赛/决赛）；2 = 新赛制（4 选 2 + 遗珠复活 + 1v1 淘汰）
    tournamentVersion: { type: Number, enum: [1, 2], required: true, default: 1 },
    poolTarget: { type: Number, default: null }, // 目标参赛张数
    knockoutSize: { type: Number, default: null }, // 淘汰赛规模（2 的幂）
    revivalNeed: { type: Number, default: null }, // 遗珠复活需捞回的张数（0 = 无复活轮）
    stepTotal: { type: Number, default: null }, // 新赛制总步数 = 组数 + 复活轮 + 淘汰赛场次
    albumIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Album' }],
    championAlbumId: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', default: null },
  },
  { timestamps: true },
);

battleSchema.index({ userId: 1, createdAt: -1 });
battleSchema.index({ status: 1 });

export const Battle = mongoose.model('Battle', battleSchema);
export default Battle;
