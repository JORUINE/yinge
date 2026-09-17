/**
 * 专辑 albums
 * 数据字典：系统设计文档 5.4.2
 * 索引：albumId（唯一）、artistId（普通）
 * 说明：isEligible / excludeReason 让"删除原因对用户可见"由数据直接支撑。
 *       releaseDate 用于对位赛按发行日期升序计算对位序号；序号不单独落库。
 */
import mongoose from 'mongoose';

const albumSchema = new mongoose.Schema(
  {
    albumId: { type: Number, required: true, unique: true },
    artistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artist', required: true },
    artistExternalId: { type: Number, required: true },
    // 冗余存一份歌手名：卡片要显示「周杰伦 · 2001」，避免每次都联表查询
    artistName: { type: String, default: '', trim: true },
    name: { type: String, required: true, trim: true },
    artworkUrl: { type: String, required: true },
    trackCount: { type: Number, required: true },
    releaseDate: { type: Date, default: null },
    isEligible: { type: Boolean, required: true, default: true },
    excludeReason: { type: String, default: null },
    cachedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

albumSchema.index({ artistId: 1 });

export const Album = mongoose.model('Album', albumSchema);
export default Album;
