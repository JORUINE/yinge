/**
 * 统一响应封装
 * ------------------------------------------------------------
 * 所有接口（含错误）统一返回 { code, message, data }：
 *   code    —— 业务状态码，0 表示成功，非 0 失败（见 errors.js 的 BizCode）
 *   message —— 提示信息，失败时为可直接展示给用户的文案
 *   data    —— 业务数据，失败时为 null
 */
import { BizCode } from './errors.js';

export function ok(res, data = null, message = 'ok') {
  return res.status(200).json({ code: BizCode.OK, message, data });
}

export function fail(res, { code = BizCode.INTERNAL, message = '服务器内部错误', httpStatus = 200, data = null }) {
  return res.status(httpStatus).json({ code, message, data });
}

/** 分页结果的统一结构（与接口文档 2.5 节一致） */
export function paginated(list, total, page, pageSize) {
  return {
    list,
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

export default { ok, fail, paginated };
