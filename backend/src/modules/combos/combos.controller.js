/**
 * 歌手组合控制器
 */
import * as service from './combos.service.js';
import { ok } from '../../shared/response.js';

export async function list(req, res) {
  return ok(res, await service.listCombos(req.user));
}

export async function create(req, res) {
  return ok(res, await service.createCombo(req.user, req.validated.body), '组合已保存');
}

export async function update(req, res) {
  return ok(res, await service.updateCombo(req.user, req.validated.params.id, req.validated.body), '组合已更新');
}

export async function remove(req, res) {
  await service.deleteCombo(req.user, req.validated.params.id);
  return ok(res, null, '组合已删除');
}
