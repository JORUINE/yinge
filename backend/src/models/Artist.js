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
    /**
     * 别名 / 白名单写法（2026-09-24 第十三批）
     * ------------------------------------------------------------
     * 由 `seed-whitelist-artists.mjs` 在按「人工白名单」灌库时回写：
     * 白名单写 `BTS` / `The Weeknd` / `房東的貓`，而 iTunes **hk 区**存下来的是
     * `防彈少年團` / `威肯` / `房东的猫`（本地化 + 繁简差异）——只比 `name` 会漏，
     * 于是"白名单面板说未入库、别处却说已入库 168 张"（用户报的自相矛盾）。
     * 有了它，`artistMatchesWhitelistName()` 就能把两边判定统一起来。
     */
    aliases: { type: [String], default: [] },
    /**
     * 管理员手动归入的流派（2026-09-24 第十七批）
     * ------------------------------------------------------------
     * 用户："在管理员后台加上我可以给每个流派手动添加歌手然后把它的专辑入库"。
     * 存**规范键**（如 `舞曲`），组池/名单时与白名单合并 —— 不改静态白名单数据文件。
     */
    curatedGenres: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const Artist = mongoose.model('Artist', artistSchema);
export default Artist;
