/**
 * 歌手 artists
 * 数据字典：系统设计文档 5.4.1
 * 索引：artistId（唯一）—— 按外部标识判重与更新
 */
import mongoose from 'mongoose';

const artistSchema = new mongoose.Schema(
  {
    artistId: { type: Number, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    genre: { type: String, default: null },
    region: { type: String, default: null },
    albumCount: { type: Number, default: 0 },
    cachedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const Artist = mongoose.model('Artist', artistSchema);
export default Artist;
