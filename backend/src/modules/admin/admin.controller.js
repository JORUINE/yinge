/**
 * 后台管理控制器
 * 对应接口：D-01 ~ D-14
 */
import * as service from './admin.service.js';
import { ok, paginated } from '../../shared/response.js';

export async function login(req, res) {
  return ok(res, await service.login(req.validated.body), '登录成功');
}

export async function dashboard(req, res) {
  return ok(res, await service.dashboard());
}

export async function listQuestions(req, res) {
  return ok(res, { list: await service.listQuestions() });
}

export async function createQuestion(req, res) {
  return ok(res, await service.createQuestion(req.validated.body), '题目已创建');
}

export async function updateQuestion(req, res) {
  const { id } = req.validated.params;
  return ok(res, await service.updateQuestion(id, req.validated.body), '题目已更新');
}

export async function deleteQuestion(req, res) {
  const { id } = req.validated.params;
  await service.deleteQuestion(id);
  return ok(res, null, '题目已删除');
}

export async function listTypes(req, res) {
  return ok(res, { list: await service.listTypes() });
}

export async function createType(req, res) {
  return ok(res, await service.createType(req.validated.body), '类型已创建');
}

export async function updateType(req, res) {
  const { id } = req.validated.params;
  return ok(res, await service.updateType(id, req.validated.body), '类型已更新');
}

export async function deleteType(req, res) {
  const { id } = req.validated.params;
  await service.deleteType(id);
  return ok(res, null, '类型已删除');
}

export async function listMusic(req, res) {
  const { list, page, pageSize, total } = await service.listMusic(req.validated.query);
  return ok(res, paginated(list, total, page, pageSize));
}

export async function refreshMusic(req, res) {
  return ok(res, await service.refreshMusic(req.validated.body), '已触发刷新');
}

export async function addGenreArtist(req, res) {
  return ok(res, await service.addGenreArtist(req.validated.body), '已加入该流派并同步专辑');
}

export async function listGenreArtists(req, res) {
  return ok(res, await service.listGenreArtists(req.validated.query));
}

export async function listUsers(req, res) {
  const { list, page, pageSize, total, bannedReasons } = await service.listUsers(req.validated.query);
  return ok(res, { ...paginated(list, total, page, pageSize), bannedReasons });
}

export async function updateUserStatus(req, res) {
  const { id } = req.validated.params;
  const data = await service.updateUserStatus(id, req.validated.body, req.user._id);
  return ok(res, data, '用户状态已更新');
}
