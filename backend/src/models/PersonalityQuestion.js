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
    dims: { type: [String], required: true, default: [] },
    options: { type: [optionSchema], required: true, default: [] },
  },
  { timestamps: true },
);

export const PersonalityQuestion = mongoose.model('PersonalityQuestion', questionSchema);
export default PersonalityQuestion;
