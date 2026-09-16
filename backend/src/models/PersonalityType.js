/**
 * 人格类型 personality_types
 * 数据字典：系统设计文档 5.6.2
 * 索引：code（唯一）
 */
import mongoose from 'mongoose';

const personalityTypeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    /** 该类型的维度特征，用于与用户得分做匹配，如 { energy: 0.8, social: 0.3 } */
    dims: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
    recommendAlbumIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Album' }],
  },
  { timestamps: true },
);

export const PersonalityType = mongoose.model('PersonalityType', personalityTypeSchema);
export default PersonalityType;
