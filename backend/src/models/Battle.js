/**
 * 对决 battles
 * 数据字典：系统设计文档 5.5.1
 * 索引：(userId, createdAt) 复合 —— 我的对决按时间倒序；status（普通）
 * 说明：matchTotal 由赛制计算得出，不允许手工填写；
 *       对位赛复用 alignCount 存每位歌手取前几张，不新增表。
 */
import mongoose from 'mongoose';

/** 五种范围模式（设计文档 4 章） */
export const SCOPE_TYPES = ['artist', 'multi-artist', 'genre', 'era', 'custom', 'aligned'];

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
    albumIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Album' }],
    championAlbumId: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', default: null },
  },
  { timestamps: true },
);

battleSchema.index({ userId: 1, createdAt: -1 });
battleSchema.index({ status: 1 });

export const Battle = mongoose.model('Battle', battleSchema);
export default Battle;
