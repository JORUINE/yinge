/**
 * HTTP 客户端
 * ------------------------------------------------------------
 * 与后端约定：所有响应都是 { code, message, data }。
 *   - code === 0  → 直接把 data 交给调用方
 *   - code !== 0  → 抛出 { code, message, data }，由调用方或全局提示处理
 *   - 2001 未登录 → 触发登出回调（跳登录页）
 *   - 2003 账号被禁用 → 触发禁用回调（前台禁用提醒）
 * 令牌按接口文档 2.4 存本地存储，并在每次请求自动附带。
 */
import axios from 'axios';

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

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'yinge_token';

export const http = axios.create({ baseURL, timeout: 15000 });

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

let handlers = { onUnauthorized: null, onBanned: null };
export function registerAuthHandlers(next) {
  handlers = { ...handlers, ...next };
}

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function normalize(body) {
  if (body.code === BizCode.UNAUTHORIZED) handlers.onUnauthorized?.();
  if (body.code === BizCode.ACCOUNT_BANNED) handlers.onBanned?.(body.data, body.message);
  return body;
}

http.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body.code === 'number') {
      if (body.code !== BizCode.OK) return Promise.reject(normalize(body));
      return body.data;
    }
    return body;
  },
  (error) => {
    const body = error.response?.data;
    if (body && typeof body.code === 'number') return Promise.reject(normalize(body));
    return Promise.reject({ code: -1, message: '网络异常，请稍后重试', data: null });
  },
);

export default http;
