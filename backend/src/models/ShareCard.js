/**
 * 分享图记录 share_cards
 * 数据字典：系统设计文档 5.3.3
 * 索引：(userId, createdAt) 复合 —— 分享记录列表
 * 说明：只存图片地址，不存二进制内容。
 */
import mongoose from 'mongoose';

const shareCardSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['bracket', 'champion', 'personality'], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true },
    imageUrl: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

shareCardSchema.index({ userId: 1, createdAt: -1 });

export const ShareCard = mongoose.model('ShareCard', shareCardSchema);
export default ShareCard;
