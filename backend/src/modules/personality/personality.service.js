/**
 * 人格测评服务
 * 对应接口：P-01 ~ P-07
 */
import { PersonalityQuestion, PersonalityType, PersonalityResult, Album, AlbumTagVote } from '../../models/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/http.js';
import * as musicService from '../music/music.service.js';
import { computeScores, matchType, buildTemplateComment } from './scoring.js';
import { generateComment } from './qwen.client.js';

export async function getQuestions() {
  const list = await PersonalityQuestion.find().sort({ order: 1 });
  return list.map((q) => ({
    questionId: String(q._id),
    order: q.order,
    type: q.type,
    title: q.title,
    audioRef: q.audioRef,
    dims: q.dims,
    options: (q.options || []).map((o) => ({ key: o.key, label: o.label })),
  }));
}

export async function submit(userId, answers) {
  const questions = await PersonalityQuestion.find().sort({ order: 1 });
  if (!questions.length) throw new BadRequestError('题库为空，请先由后台导入题目');

  // 校验：必须覆盖全部题目（设计文档 5.9(6)）
  const answered = new Set(answers.map((a) => String(a.questionId)));
  const missing = questions.filter((q) => !answered.has(String(q._id)));
  if (missing.length) {
    throw new BadRequestError(`还有 ${missing.length} 道题未作答，请答完再提交`);
  }

  const scores = computeScores(questions, answers);
  const types = await PersonalityType.find();
  if (!types.length) throw new BadRequestError('人格类型库为空，请先由后台导入类型');

  const matched = matchType(scores, types);

  // AI 解读：失败静默降级
  let aiComment = await generateComment({
    typeName: matched.name,
    description: matched.description,
    scores,
    nickname: null,
  });
  let source = 'llm';
  if (!aiComment) {
    aiComment = buildTemplateComment({
      typeName: matched.name,
      description: matched.description,
      scores,
    });
    source = 'template';
  }

  const result = await PersonalityResult.create({
    userId,
    typeCode: matched.code,
    answers: answers.map((a) => ({ questionId: a.questionId, optionKey: a.optionKey })),
    scores,
    aiComment,
    aiCommentSource: source,
    recommendAlbums: matched.recommendAlbumIds || [],
  });

  return result;
}

export async function getResult(resultId, userId) {
  const result = await PersonalityResult.findById(resultId);
  if (!result) throw new NotFoundError('测评结果');
  if (String(result.userId) !== String(userId)) throw new NotFoundError('测评结果');
  const type = await PersonalityType.findOne({ code: result.typeCode });
  const albums = await Album.find({ _id: { $in: result.recommendAlbums || [] } });

  return {
    resultId: String(result._id),
    userId: String(result.userId),
    typeCode: result.typeCode,
    typeName: type?.name || result.typeCode,
    typeDescription: type?.description || '',
    scores: result.scores,
    aiComment: result.aiComment,
    aiCommentSource: result.aiCommentSource,
    answers: result.answers.map((a) => ({ questionId: String(a.questionId), optionKey: a.optionKey })),
    recommendAlbums: albums.map(musicService.serializeAlbum),
    createdAt: result.createdAt,
  };
}

export async function listMyResults(userId, query) {
  const { page, pageSize, skip, limit } = parsePagination(query);
  const filter = { userId };
  const [list, total] = await Promise.all([
    PersonalityResult.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PersonalityResult.countDocuments(filter),
  ]);
  return {
    list: list.map((r) => ({
      resultId: String(r._id),
      typeCode: r.typeCode,
      aiCommentSource: r.aiCommentSource,
      createdAt: r.createdAt,
    })),
    page,
    pageSize,
    total,
  };
}

export async function listTypes() {
  const types = await PersonalityType.find().sort({ code: 1 });
  return types.map((t) => ({
    code: t.code,
    name: t.name,
    description: t.description,
    dims: t.dims,
  }));
}

export async function getTypeByCode(code) {
  const type = await PersonalityType.findOne({ code });
  if (!type) throw new NotFoundError('人格类型');
  const albums = await Album.find({ _id: { $in: type.recommendAlbumIds || [] } });
  return {
    code: type.code,
    name: type.name,
    description: type.description,
    dims: type.dims,
    recommendAlbums: albums.map(musicService.serializeAlbum),
  };
}

/** 类型占比统计（图鉴） */
export async function stats() {
  const rows = await PersonalityResult.aggregate([
    { $group: { _id: '$typeCode', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return {
    total,
    list: rows.map((r) => ({
      typeCode: r._id,
      count: r.count,
      ratio: total ? Number((r.count / total).toFixed(4)) : 0,
    })),
  };
}

/* ============================================================
 * 专辑归类投票（众包给「人格推荐池」喂数据）
 * ------------------------------------------------------------
 * 玩法：用户看一张专辑 → 判断"它更像哪一型" → 沉淀为真实用户数据；
 *      后台按票数采纳进推荐池。这样推荐专辑就不是纯拍脑袋，而是有人投过票的。
 * ============================================================ */

/** 6 型选项（投票界面用） */
async function tagTypeOptions() {
  const types = await PersonalityType.find().sort({ code: 1 }).select('code name description').lean();
  return types.map((t) => ({ code: t.code, name: t.name, description: t.description }));
}

/**
 * 下一张待投票的专辑。
 * 策略：先排除用户已投过的 → 随机抽 40 张 → 按**已有票数升序**取最少的那张。
 * 这样既保证多样性（随机），又不会一直推那几张热门专辑（票少先上）。
 */
export async function nextTagAlbum(userId) {
  const types = await tagTypeOptions();
  const voted = await AlbumTagVote.find({ userId }).select('albumId').lean();
  const votedIds = voted.map((v) => v.albumId);
  const pool = await Album.aggregate([
    { $match: { isEligible: true, _id: { $nin: votedIds } } },
    { $sample: { size: 40 } },
  ]);
  if (!pool.length) return { album: null, types, votedCount: votedIds.length, allDone: true };

  const counts = await AlbumTagVote.aggregate([
    { $match: { albumId: { $in: pool.map((p) => p._id) } } },
    { $group: { _id: '$albumId', n: { $sum: 1 } } },
  ]);
  const nById = new Map(counts.map((c) => [String(c._id), c.n]));
  pool.sort((a, b) => (nById.get(String(a._id)) || 0) - (nById.get(String(b._id)) || 0));

  return {
    album: musicService.serializeAlbum(pool[0]),
    types,
    votedCount: votedIds.length,
    allDone: false,
  };
}

/** 投一票（同一用户对同一张专辑只留最新一票） */
export async function voteAlbumTag(userId, albumId, typeCode) {
  const album = await Album.findById(albumId).select('_id').lean();
  if (!album) throw new NotFoundError('专辑');
  const type = await PersonalityType.findOne({ code: typeCode }).select('code').lean();
  if (!type) throw new BadRequestError('人格类型不存在');
  await AlbumTagVote.findOneAndUpdate(
    { userId, albumId },
    { $set: { typeCode } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  const votedCount = await AlbumTagVote.countDocuments({ userId });
  return { votedCount };
}

/** 聚合统计：每型票数最高的若干张（后台"采纳进推荐池"用） */
export async function albumTagStats(limit = 8) {
  const rows = await AlbumTagVote.aggregate([
    { $group: { _id: { albumId: '$albumId', typeCode: '$typeCode' }, votes: { $sum: 1 } } },
    { $sort: { votes: -1 } },
  ]);
  const albumIds = [...new Set(rows.map((r) => r._id.albumId))];
  const albums = albumIds.length ? await Album.find({ _id: { $in: albumIds } }).select('name artistName artworkUrl').lean() : [];
  const byId = new Map(albums.map((a) => [String(a._id), a]));
  const byType = {};
  for (const r of rows) {
    const code = r._id.typeCode;
    if (!byType[code]) byType[code] = [];
    if (byType[code].length >= limit) continue;
    const a = byId.get(String(r._id.albumId));
    if (!a) continue;
    byType[code].push({
      id: String(a._id),
      name: a.name,
      artistName: a.artistName,
      artworkUrl: a.artworkUrl,
      votes: r.votes,
    });
  }
  const total = await AlbumTagVote.estimatedDocumentCount();
  const voters = await AlbumTagVote.distinct('userId');
  return { total, voters: voters.length, byType };
}

export default {
  getQuestions,
  submit,
  getResult,
  listMyResults,
  listTypes,
  getTypeByCode,
  stats,
  nextTagAlbum,
  voteAlbumTag,
  albumTagStats,
};
