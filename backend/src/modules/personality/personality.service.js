/**
 * 人格测评服务
 * 对应接口：P-01 ~ P-07
 */
import { PersonalityQuestion, PersonalityType, PersonalityResult, Album } from '../../models/index.js';
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

export default { getQuestions, submit, getResult, listMyResults, listTypes, getTypeByCode, stats };
