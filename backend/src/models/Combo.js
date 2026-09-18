/**
 * 歌手组合 combos
 * ------------------------------------------------------------
 * 用途：创建页的「常用组合 / 我收藏组合」不再写死，改为数据驱动。
 *   · isSystem = true（ownerId = null）→ 系统组合：管理员在后台增删改，所有人可见
 *   · isSystem = false（ownerId = 用户）→ 用户自建组合：只本人可见 / 可删（"我收藏组合"）
 * 索引：(ownerId, createdAt) —— 拉"我的组合"；isSystem 用于取系统组合。
 */
import mongoose from 'mongoose';

const comboArtistSchema = new mongoose.Schema(
  {
    artistId: { type: Number, required: true },
    name: { type: String, required: true, trim: true },
    albumCount: { type: Number, default: 8 },
  },
  { _id: false },
);

const comboSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 40 },
    scopeType: { type: String, default: 'multi-artist' },
    artists: { type: [comboArtistSchema], default: [] },
    perArtist: { type: Number, default: 8 },
    alignCount: { type: Number, default: null },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

comboSchema.index({ ownerId: 1, createdAt: -1 });
comboSchema.index({ isSystem: 1 });

export const Combo = mongoose.model('Combo', comboSchema);
export default Combo;
