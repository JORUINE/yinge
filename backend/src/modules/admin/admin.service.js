/**
 * 后台管理服务
 * 对应接口：D-01 ~ D-14
 */
import {
  User,
  PersonalityQuestion,
  PersonalityType,
  Artist,
  Album,
  Battle,
  PersonalityResult,
  Vote,
} from '../../models/index.js';
import { BANNED_REASONS } from '../../models/User.js';
import { ForbiddenError, NotFoundError, BadRequestError, DuplicateError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/http.js';
import * as authService from '../auth/auth.service.js';
import * as musicService from '../music/music.service.js';

export async function login({ account, password }) {
  const result = await authService.login({ account, password });
  const user = await User.findOne({ account: account.toLowerCase() });
  if (user.role !== 'admin') throw new ForbiddenError('该账号不是管理员');
  return result;
}

export async function dashboard() {
  const [userTotal, bannedTotal, battleTotal, albumTotal, artistTotal, resultTotal, voteTotal] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ status: 'banned' }),
    Battle.countDocuments(),
    Album.countDocuments(),
    Artist.countDocuments(),
    PersonalityResult.countDocuments(),
    Vote.countDocuments({ isInvalid: false }),
  ]);
  const typeRows = await PersonalityResult.aggregate([
    { $group: { _id: '$typeCode', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 8 },
  ]);
  return {
    users: { total: userTotal, banned: bannedTotal },
    battles: { total: battleTotal },
    music: { artists: artistTotal, albums: albumTotal },
    results: { total: resultTotal },
    votes: { valid: voteTotal },
    typeStats: typeRows.map((r) => ({ typeCode: r._id, count: r.count })),
  };
}

// ---- 题目管理 ----
export async function listQuestions() {
  const list = await PersonalityQuestion.find().sort({ order: 1 });
  return list;
}

export async function createQuestion(data) {
  const exists = await PersonalityQuestion.exists({ order: data.order });
  if (exists) throw new DuplicateError(`题号 ${data.order} 已存在`);
  return PersonalityQuestion.create(data);
}

export async function updateQuestion(id, data) {
  const doc = await PersonalityQuestion.findByIdAndUpdate(id, { $set: data }, { new: true });
  if (!doc) throw new NotFoundError('题目');
  return doc;
}

export async function deleteQuestion(id) {
  const res = await PersonalityQuestion.deleteOne({ _id: id });
  if (!res.deletedCount) throw new NotFoundError('题目');
  return true;
}

// ---- 人格类型管理 ----
export async function listTypes() {
  return PersonalityType.find().sort({ code: 1 });
}

export async function createType(data) {
  const exists = await PersonalityType.exists({ code: data.code });
  if (exists) throw new DuplicateError(`类型码 ${data.code} 已存在`);
  return PersonalityType.create(data);
}

export async function updateType(id, data) {
  const doc = await PersonalityType.findByIdAndUpdate(id, { $set: data }, { new: true });
  if (!doc) throw new NotFoundError('人格类型');
  return doc;
}

export async function deleteType(id) {
  const res = await PersonalityType.deleteOne({ _id: id });
  if (!res.deletedCount) throw new NotFoundError('人格类型');
  return true;
}

// ---- 音乐数据管理 ----
export async function listMusic(query) {
  const { page, pageSize, skip, limit } = parsePagination(query);
  const filter = {};
  if (query.keyword) filter.name = new RegExp(String(query.keyword), 'i');
  const [list, total] = await Promise.all([
    Artist.find(filter).sort({ cachedAt: -1 }).skip(skip).limit(limit),
    Artist.countDocuments(filter),
  ]);
  return {
    list: list.map((a) => ({
      artistId: a.artistId,
      name: a.name,
      genre: a.genre,
      region: a.region,
      albumCount: a.albumCount,
      cachedAt: a.cachedAt,
      freshness: musicService.freshness(a.cachedAt),
    })),
    page,
    pageSize,
    total,
  };
}

export async function refreshMusic({ artistId }) {
  const result = await musicService.syncArtist(artistId);
  return { artistId: Number(artistId), albums: result.albums.length, stats: result.stats };
}

// ---- 用户管理 ----
export async function listUsers(query) {
  const { page, pageSize, skip, limit } = parsePagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.keyword) {
    const re = new RegExp(String(query.keyword), 'i');
    filter.$or = [{ account: re }, { nickname: re }];
  }
  const [list, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return {
    list: list.map((u) => u.toSafeJSON()),
    page,
    pageSize,
    total,
    bannedReasons: BANNED_REASONS,
  };
}

export async function updateUserStatus(id, { status, bannedReason = null, bannedNote = null }, adminId) {
  const user = await User.findById(id);
  if (!user) throw new NotFoundError('用户');
  if (status === 'banned') {
    if (bannedReason && !BANNED_REASONS.includes(bannedReason)) {
      throw new BadRequestError('禁用原因不在允许的枚举范围内');
    }
    user.status = 'banned';
    user.bannedReason = bannedReason;
    user.bannedNote = bannedNote;
    user.bannedAt = new Date();
    user.bannedBy = adminId;
  } else {
    user.status = 'active';
    user.bannedReason = null;
    user.bannedNote = null;
    user.bannedAt = null;
    user.bannedBy = null;
    user.restrictUntil = null;
  }
  await user.save();
  return user.toSafeJSON();
}

export default {
  login,
  dashboard,
  listQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  listTypes,
  createType,
  updateType,
  deleteType,
  listMusic,
  refreshMusic,
  listUsers,
  updateUserStatus,
};
