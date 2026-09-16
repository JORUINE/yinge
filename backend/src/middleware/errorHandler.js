/**
 * 全局错误处理
 * ------------------------------------------------------------
 * 统一把各类异常翻译成 { code, message, data } 结构：
 *   - 业务错误（AppError 子类）→ 记录 warn 日志，按自身 bizCode 返回
 *   - Mongo 唯一索引冲突 → 3001 重复操作
 *   - 字段校验 / 类型转换失败 → 1001 参数校验失败
 *   - 其余未知错误 → 5000，只记日志，不向客户端暴露堆栈
 */
import mongoose from 'mongoose';
import { AppError, BizCode } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ code: BizCode.NOT_FOUND, message: '接口不存在', data: null });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError && err.isOperational) {
    logger.warn('业务错误', {
      requestId: req.id,
      path: req.originalUrl,
      method: req.method,
      code: err.bizCode,
      message: err.message,
    });
    return res.status(err.httpStatus).json({
      code: err.bizCode,
      message: err.message,
      data: err.detail ?? null,
    });
  }

  // Mongo 唯一索引冲突（如重复投票、重复收藏、账号重名）
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {}).join(', ');
    logger.warn('唯一索引冲突', { requestId: req.id, path: req.originalUrl, field });
    return res.status(409).json({
      code: BizCode.DUPLICATE,
      message: '记录已存在，请勿重复操作',
      data: { field },
    });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return res.status(422).json({ code: BizCode.PARAM_INVALID, message: '字段校验未通过', data: errors });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      code: BizCode.PARAM_INVALID,
      message: `参数格式不正确：${err.path}`,
      data: null,
    });
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ code: BizCode.PARAM_INVALID, message: '请求体不是合法 JSON', data: null });
  }

  logger.error('未预期错误', {
    requestId: req.id,
    path: req.originalUrl,
    method: req.method,
    error: err?.message,
    stack: err?.stack,
  });
  return res.status(500).json({ code: BizCode.INTERNAL, message: '服务器内部错误', data: null });
}

export default errorHandler;
