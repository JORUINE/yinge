/**
 * 曲目 tracks
 * 数据字典：系统设计文档 5.4.3
 * 索引：trackId（唯一）、albumExternalId（普通）
 * 实测约束：曲目只能按 artistId 批量拉取后再按 albumExternalId 归组；
 *          按 albumId 查询接口不会展开曲目列表，编码时不可想当然。
 */
import mongoose from 'mongoose';

const trackSchema = new mongoose.Schema(
  {
    trackId: { type: Number, required: true, unique: true },
    albumId: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
    albumExternalId: { type: Number, required: true },
    artistExternalId: { type: Number, required: true },
    name: { type: String, required: true, trim: true },
    previewUrl: { type: String, default: null },
    duration: { type: Number, default: null },
    discNumber: { type: Number, default: null },
    trackNumber: { type: Number, default: null },
    cachedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

trackSchema.index({ albumExternalId: 1 });

export const Track = mongoose.model('Track', trackSchema);
export default Track;
