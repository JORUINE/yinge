/**
 * 集中配置层
 * ------------------------------------------------------------
 * 所有配置一律来自环境变量，并在进程启动时一次性校验。
 * 缺关键项直接抛错、进程退出（fail fast），避免带着半截配置跑起来。
 * 业务代码只从本模块取配置，禁止在别处散写 process.env。
 */
import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `缺少必需的环境变量：${name}。请复制 backend/.env.example 为 backend/.env 并填写。`,
    );
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function intEnv(name, fallback) {
  const value = process.env[name];
  if (!value || !value.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`环境变量 ${name} 必须是整数，当前值：${value}`);
  }
  return parsed;
}

function listEnv(name, fallback) {
  const value = process.env[name];
  if (!value || !value.trim()) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const nodeEnv = optional('NODE_ENV', 'development');

export const config = {
  env: nodeEnv,
  isProd: nodeEnv === 'production',
  port: intEnv('PORT', 3000),

  mongoUri: required('MONGODB_URI'),

  jwt: {
    secret: required('JWT_SECRET'),
    accessExpiresIn: optional('JWT_ACCESS_EXPIRES_IN', '2h'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '7d'),
  },

  corsOrigins: listEnv('CORS_ORIGINS', ['http://localhost:5173', 'http://127.0.0.1:5173']),

  qwen: {
    apiKey: optional('DASHSCOPE_API_KEY', ''),
    model: optional('QWEN_MODEL', 'qwen-plus'),
    baseUrl: optional('QWEN_BASE_URL', 'https://dashscope.aliyuncs.com/compatible-mode/v1'),
  },

  itunes: {
    country: optional('ITUNES_COUNTRY', 'hk'),
    countryFallback: listEnv('ITUNES_COUNTRY_FALLBACK', ['hk', 'tw', 'us', 'cn']),
    timeoutMs: intEnv('ITUNES_TIMEOUT_MS', 8000),
  },

  cache: {
    freshDays: intEnv('CACHE_FRESH_DAYS', 30),
    staleDays: intEnv('CACHE_STALE_DAYS', 25),
  },

  vote: {
    // 轻度限流：只拦"脚本式疯狂点击"，不拦正常手速（2026-09-16 修复误拦）。
    // 300ms ≈ 上限每秒 3 票；熟练用户连续快速投票不会再被误判为"操作过于频繁"。
    minIntervalMs: intEnv('VOTE_MIN_INTERVAL_MS', 300),
    perMinuteLimit: intEnv('VOTE_PER_MINUTE_LIMIT', 120),
    perDayLimit: intEnv('VOTE_PER_DAY_LIMIT', 800),
  },
};

export default config;
