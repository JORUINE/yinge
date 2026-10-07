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
    /**
     * 2026-10-07 第三十一批：详情页要"更丰满的人物描述"。
     * evidence —— 可查的公开研究结论（每条一句话 + 出处），让描述有据可依而不是"我们编的"；
     * dailyUse —— 这个人格**在什么时候/什么场合**听（音乐心理学里"功能使用"的实证结论）。
     * ⚠️ 措辞守则：音乐偏好与人格是**相关**，不是因果或诊断。所以内容统一写成
     *   "偏好 X 的人往往/更可能…"，不要写成"这类人就是…"。 */
    /** 2026-10-07 第三十二批：详情页「他们的特征」（4 条，面向用户的口吻） */
    traits: { type: [String], default: [] },
    /* evidence / dailyUse 曾是第三十一批加的"研究怎么说"素材，用户明确不要那一块
       （"不是让你加一个研究怎么说，你这些专业数据放在最底下的注释那种就好"）⇒ 已停用。
       字段保留只是为了不破坏库里已有数据。 */
    evidence: { type: [String], default: [] },
    dailyUse: { type: String, default: null },
    listeningProfile: { type: String, default: null },
    albumHints: { type: [String], default: [] },
    recommendAlbumIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Album' }],
  },
  { timestamps: true },
);

export const PersonalityType = mongoose.model('PersonalityType', personalityTypeSchema);
export default PersonalityType;
