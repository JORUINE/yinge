/**
 * 测评结果 personality_results
 * 数据字典：系统设计文档 5.6.3
 * 索引：(userId, createdAt) 复合 —— 我的测评；typeCode（普通）—— 占比统计
 * 说明：answers 保留完整作答明细，是"结果可复核"的实现方式；
 *       aiCommentSource 显式暴露解读来源是否为降级（llm / template）。
 */
import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PersonalityQuestion', required: true },
    optionKey: { type: String, required: true },
  },
  { _id: false },
);

const personalityResultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    typeCode: { type: String, required: true },
    answers: { type: [answerSchema], required: true, default: [] },
    /** 各维度累计得分 */
    scores: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
    aiComment: { type: String, default: null },
    aiCommentSource: { type: String, enum: ['llm', 'template'], required: true, default: 'template' },
    recommendAlbums: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Album' }],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

personalityResultSchema.index({ userId: 1, createdAt: -1 });
personalityResultSchema.index({ typeCode: 1 });

export const PersonalityResult = mongoose.model('PersonalityResult', personalityResultSchema);
export default PersonalityResult;
