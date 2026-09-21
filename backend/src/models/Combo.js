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
    /**
     * 2026-09-21 新增：对位赛组合要连「配对方式」一起记住。
     * 之前只存了 alignCount（张数），配对方式（同序号 ordinal / 年代就近 chrono）没落库，
     * 前端 applyCombo 读 c.alignMode 恒为 undefined → 装填后一律退回默认的「同序号」，
     * 用户选的「年代就近」白选。模型补字段 + 路由补 schema + serialize 补回传，三处一起改。
     */
    alignMode: {
      type: String,
      enum: ['ordinal', 'chrono'],
      default: 'ordinal',
    },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

comboSchema.index({ ownerId: 1, createdAt: -1 });
comboSchema.index({ isSystem: 1 });

export const Combo = mongoose.model('Combo', comboSchema);
export default Combo;
