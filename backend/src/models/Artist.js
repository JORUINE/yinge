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
    /**
     * 歌手本人照片（2026-09-20 新增）
     * ------------------------------------------------------------
     * iTunes Search 的 musicArtist 结果里**没有头像**；头像从 Apple Music 艺术家页的
     * og:image 取（实测只有 cn 商店front 的页面带真图，其余只给通用 logo），见 itunes.client.artistPhoto。
     * `imageFetchedAt` 用来避免"没有图就每次重抓"：30 天内不再重复请求。
     */
    imageUrl: { type: String, default: null },
    imageFetchedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Artist = mongoose.model('Artist', artistSchema);
export default Artist;
