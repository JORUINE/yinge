/**
 * HTTP 层小工具
 */

/** 包裹异步控制器，自动把 reject 转交给全局错误处理中间件 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** 从请求中解析分页参数（page 从 1 开始，pageSize 上限 100） */
export function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const rawSize = Number.parseInt(query.pageSize, 10) || 20;
  const pageSize = Math.min(100, Math.max(1, rawSize));
  return { page, pageSize, skip: (page - 1) * pageSize, limit: pageSize };
}

/** 采集投票风控所需的来源标识 */
export function clientMeta(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) || req.ip || '';
  const deviceHash = String(req.headers['x-device-id'] || '').slice(0, 128) || null;
  return { ip, deviceHash };
}
