/**
 * 测评题目 personality_questions
 * 数据字典：系统设计文档 5.6.1
 * 索引：order（唯一）
 * 说明：分值写在选项对象里，后台改题即可调整计分模型，无需改代码重新部署。
 */
import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    /** 各维度加分对象，如 { energy: 2, social: 1 } */
    score: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
  },
  { _id: false },
);

const questionSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true, unique: true },
    type: { type: String, enum: ['choice', 'audio'], required: true, default: 'choice' },
    title: { type: String, required: true },
    audioRef: { type: String, default: null },
    /**
     * 主维度（2026-09-22 新增）
     * 抽题时按它配平：每次抽 20 道里，每个维度各占固定名额，
     * 这样"随机"只影响抽到哪几道，不会让某一维度的题整体偏多 → 分数才可比。
     */
    primary: { type: String, default: null },
    dims: { type: [String], required: true, default: [] },
    options: { type: [optionSchema], required: true, default: [] },
  },
  { timestamps: true },
);

export const PersonalityQuestion = mongoose.model('PersonalityQuestion', questionSchema);
export default PersonalityQuestion;
