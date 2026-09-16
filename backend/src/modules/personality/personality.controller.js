/**
 * 人格测评控制器
 * 对应接口：P-01 ~ P-07
 */
import * as service from './personality.service.js';
import { ok, paginated } from '../../shared/response.js';

export async function questions(req, res) {
  return ok(res, { list: await service.getQuestions() });
}

export async function submit(req, res) {
  const { answers } = req.validated.body;
  const result = await service.submit(req.user._id, answers);
  const data = await service.getResult(String(result._id), req.user._id);
  return ok(res, data, '测评完成');
}

export async function result(req, res) {
  const { id } = req.validated.params;
  return ok(res, await service.getResult(id, req.user._id));
}

export async function listMine(req, res) {
  const { list, page, pageSize, total } = await service.listMyResults(req.user._id, req.validated.query);
  return ok(res, paginated(list, total, page, pageSize));
}

export async function types(req, res) {
  return ok(res, { list: await service.listTypes() });
}

export async function typeDetail(req, res) {
  const { code } = req.validated.params;
  return ok(res, await service.getTypeByCode(code));
}

export async function stats(req, res) {
  return ok(res, await service.stats());
}
