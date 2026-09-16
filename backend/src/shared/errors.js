/**
 * 类型化错误层级 + 业务状态码
 * ------------------------------------------------------------
 * 业务状态码与《音格 · API 接口文档》2.3 节完全一致，前端只需判断 code。
 * 抛错一律抛这里的子类，禁止抛裸 Error('...')。
 */

/** 业务状态码（与接口文档 2.3 节一一对应） */
export const BizCode = {
  OK: 0,
  PARAM_INVALID: 1001,
  NOT_FOUND: 1002,
  TOO_FREQUENT: 1003,
  UNAUTHORIZED: 2001,
  FORBIDDEN: 2002,
  ACCOUNT_BANNED: 2003,
  DUPLICATE: 3001,
  EXTERNAL_MUSIC_ERROR: 4001,
  LLM_ERROR: 4002,
  INTERNAL: 5000,
};

export class AppError extends Error {
  /**
   * @param {string} message 可直接展示给用户的文案
   * @param {object} options
   * @param {number} options.bizCode   业务状态码（BizCode）
   * @param {number} options.httpStatus HTTP 状态码
   * @param {boolean} [options.isOperational] 是否为可预期的业务错误
   * @param {object} [options.detail]  附加信息（如字段级错误列表）
   */
  constructor(message, { bizCode = BizCode.INTERNAL, httpStatus = 500, isOperational = true, detail = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.bizCode = bizCode;
    this.httpStatus = httpStatus;
    this.isOperational = isOperational;
    this.detail = detail;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = '请求参数有误') {
    super(message, { bizCode: BizCode.PARAM_INVALID, httpStatus: 400 });
  }
}

export class ValidationError extends AppError {
  constructor(message = '字段校验未通过', detail = null) {
    super(message, { bizCode: BizCode.PARAM_INVALID, httpStatus: 422, detail });
  }
}

export class NotFoundError extends AppError {
  constructor(resource = '资源') {
    super(`${resource}不存在`, { bizCode: BizCode.NOT_FOUND, httpStatus: 404 });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '未登录或登录已过期') {
    super(message, { bizCode: BizCode.UNAUTHORIZED, httpStatus: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '权限不足') {
    super(message, { bizCode: BizCode.FORBIDDEN, httpStatus: 403 });
  }
}

/** 账号被禁用：携带禁用原因与判定说明，供前台禁用提醒展示 */
export class AccountBannedError extends AppError {
  constructor({ reason = null, note = null } = {}) {
    super('账号已被禁用', {
      bizCode: BizCode.ACCOUNT_BANNED,
      httpStatus: 403,
      detail: { bannedReason: reason, bannedNote: note },
    });
  }
}

export class DuplicateError extends AppError {
  constructor(message = '重复操作', detail = null) {
    super(message, { bizCode: BizCode.DUPLICATE, httpStatus: 409, detail });
  }
}

export class TooFrequentError extends AppError {
  constructor(message = '操作过于频繁，请稍后再试') {
    super(message, { bizCode: BizCode.TOO_FREQUENT, httpStatus: 429 });
  }
}

export class ExternalMusicError extends AppError {
  constructor(message = '外部音乐接口异常，已尝试使用缓存数据') {
    super(message, { bizCode: BizCode.EXTERNAL_MUSIC_ERROR, httpStatus: 502 });
  }
}

export class LlmError extends AppError {
  constructor(message = '文本生成服务异常') {
    super(message, { bizCode: BizCode.LLM_ERROR, httpStatus: 502 });
  }
}
