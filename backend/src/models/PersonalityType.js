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
    /** 该类型的维度特征，用于与用户得分做匹配（2026-09-22 起为 6 维计分向量） */
    dims: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
    /**
     * 2026-09-22 新增三字段：让"这个类型凭什么这样定义"可追溯。
     * theory           —— 对应的心理学出处（Rentfrow & Gosling 2003 / Greenberg 2016 / Juslin 2008…）
     * listeningProfile —— 这类听众在音乐社区里的画像（一句话）
     * albumHints       —— 该型推荐专辑的挑选原则（给绑定脚本与后台采纳用）
     */
    theory: { type: String, default: null },
    listeningProfile: { type: String, default: null },
    albumHints: { type: [String], default: [] },
    recommendAlbumIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Album' }],
  },
  { timestamps: true },
);

export const PersonalityType = mongoose.model('PersonalityType', personalityTypeSchema);
export default PersonalityType;
