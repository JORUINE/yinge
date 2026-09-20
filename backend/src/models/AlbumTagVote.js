/**
 * 专辑归类投票 album_tag_votes
 * ------------------------------------------------------------
 * 玩法（2026-09-20 新增）：让用户看一张专辑，判断"它更像哪一型"，
 * 为「人格类型 → 推荐专辑」收集**真实用户数据**，后台采纳后再进推荐池。
 * 设计取舍：
 *   · 一个用户对同一张专辑只保留最新一票（唯一索引 userId+albumId + upsert）→ 允许改主意但不刷票；
 *   · 存 **typeCode**（MEL/RHY/…）而不是类型 _id：类型重建时票不会失效，聚合也简单；
 *   · 只存本地 albumId（ObjectId）：推荐池用的是本地专辑。
 */
import mongoose from 'mongoose';

const albumTagVoteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    albumId: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
    typeCode: { type: String, required: true },
  },
  { timestamps: true },
);

/** 同一用户对同一张专辑只留一票（改投就覆盖） */
albumTagVoteSchema.index({ userId: 1, albumId: 1 }, { unique: true });
/** 聚合用：某张专辑的各型票数 */
albumTagVoteSchema.index({ albumId: 1, typeCode: 1 });
/** 批次抽取用：避免重复给同一个人推同一批 */
albumTagVoteSchema.index({ userId: 1, createdAt: -1 });

export const AlbumTagVote = mongoose.model('AlbumTagVote', albumTagVoteSchema);
export default AlbumTagVote;
