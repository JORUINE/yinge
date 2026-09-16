/**
 * 结构化 JSON 日志
 * ------------------------------------------------------------
 * 只输出 JSON 行，便于云端（Render）日志检索与告警。
 * 禁止在业务代码里用 console.log。
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const threshold = (() => {
  const configured = process.env.LOG_LEVEL;
  if (configured && configured in LEVELS) return LEVELS[configured];
  return process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug;
})();

function emit(level, msg, meta) {
  if (LEVELS[level] > threshold) return;
  const entry = { ts: new Date().toISOString(), level, msg, ...meta };
  const line = `${JSON.stringify(entry)}\n`;
  if (level === 'error' || level === 'warn') process.stderr.write(line);
  else process.stdout.write(line);
}

export const logger = {
  error: (msg, meta = {}) => emit('error', msg, meta),
  warn: (msg, meta = {}) => emit('warn', msg, meta),
  info: (msg, meta = {}) => emit('info', msg, meta),
  debug: (msg, meta = {}) => emit('debug', msg, meta),
};

export default logger;
