/**
 * 收藏 favorites
 * 数据字典：系统设计文档 5.3.2
 * 索引：(userId, targetType, targetId) 唯一 —— 重复收藏由数据库层直接拒绝
 */
import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['album', 'personality_type'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

favoriteSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });

export const Favorite = mongoose.model('Favorite', favoriteSchema);
export default Favorite;
