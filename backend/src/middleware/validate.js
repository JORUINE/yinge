/**
 * 入参校验中间件（zod）
 * ------------------------------------------------------------
 * 在边界处校验，校验通过的干净数据挂到 req.validated[source]，
 * 控制器只读校验后的数据，不直接信任客户端原始入参。
 */
import { ValidationError } from '../shared/errors.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.message,
      }));
      return next(new ValidationError('字段校验未通过', errors));
    }
    if (!req.validated) req.validated = {};
    req.validated[source] = result.data;
    return next();
  };
}

export default validate;
