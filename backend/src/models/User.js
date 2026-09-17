/**
 * 用户 users
 * 数据字典：系统设计文档 5.3.1
 * 索引：account（唯一）、nickname（唯一）
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/** 禁用原因枚举：必须与前台禁用提醒、后台禁用操作三处一致（设计文档 5.3.1） */
export const BANNED_REASONS = [
  'vote_fraud', // 刷票行为
  'spam_content', // 昵称或账号名含广告、违规、攻击性内容
  'abuse_request', // 绕过前端高频调用接口
  'self_request', // 用户本人申请注销
  'appeal_overturned', // 误判申诉成立（恢复启用）
];

const userSchema = new mongoose.Schema(
  {
    account: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    nickname: { type: String, required: true, unique: true, trim: true },
    // guest = 免注册可玩的游客身份（发正式 JWT，对决归属/每人一票/防刷全部复用现有逻辑；
    // 数据绑定本机浏览器，换设备或清缓存会丢 —— 需求文档「不注册也能玩」的实现载体）
    role: { type: String, enum: ['user', 'admin', 'guest'], default: 'user', required: true },
    status: { type: String, enum: ['active', 'banned'], default: 'active', required: true },

    bannedReason: { type: String, enum: [...BANNED_REASONS, null], default: null },
    bannedNote: { type: String, default: null },
    bannedAt: { type: Date, default: null },
    bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    violationCount: { type: Number, default: 0, required: true },
    restrictUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/** 对外安全视图：绝不外泄 passwordHash */
userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: String(this._id),
    account: this.account,
    nickname: this.nickname,
    role: this.role,
    status: this.status,
    bannedReason: this.bannedReason,
    bannedNote: this.bannedNote,
    bannedAt: this.bannedAt,
    restrictUntil: this.restrictUntil,
    violationCount: this.violationCount,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
export default User;
