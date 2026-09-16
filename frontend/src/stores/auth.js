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
