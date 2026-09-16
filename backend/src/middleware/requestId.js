/**
 * 请求标识中间件
 * ------------------------------------------------------------
 * 每个请求分配唯一 requestId，写回响应头，供日志串联排查。
 */
import { randomUUID } from 'node:crypto';

export function requestId(req, res, next) {
  req.id = String(req.headers['x-request-id'] || randomUUID());
  res.setHeader('X-Request-Id', req.id);
  next();
}

export default requestId;
