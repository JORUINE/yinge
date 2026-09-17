/**
 * 登录态
 */
import { defineStore } from 'pinia';
import { authApi } from '@/api';
import { getToken, setToken } from '@/api/client';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken(),
    user: null,
    loaded: false,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token),
    isAdmin: (state) => state.user?.role === 'admin',
    /** 免注册可玩：游客身份（数据只保存在本机浏览器） */
    isGuest: (state) => state.user?.role === 'guest',
    nickname: (state) => state.user?.nickname || '未登录',
  },
  actions: {
    async login(payload) {
      const data = await authApi.login(payload);
      this.applySession(data);
      return data;
    },
    async register(payload) {
      const data = await authApi.register(payload);
      this.applySession(data);
      return data;
    },
    /**
     * 免注册可玩（需求文档）：没有登录态时自动领一个游客身份。
     * 游客 = 真实账号（role=guest）+ 正式 JWT，所以对决归属 / 每人一票 / 防刷全部复用现有逻辑。
     */
    async ensureGuest() {
      if (this.token) return this.user;
      const data = await authApi.guest();
      this.applySession(data);
      return this.user;
    },
    applySession({ token, user }) {
      this.token = token;
      setToken(token);
      this.user = user;
      this.loaded = true;
    },
    async fetchMe() {
      if (!this.token) {
        this.loaded = true;
        return null;
      }
      try {
        this.user = await authApi.me();
      } catch {
        this.clear();
      } finally {
        this.loaded = true;
      }
      return this.user;
    },
    async logout() {
      try {
        await authApi.logout();
      } catch {
        /* 退出失败也要清本地态 */
      }
      this.clear();
    },
    clear() {
      this.token = '';
      this.user = null;
      setToken('');
    },
  },
});
