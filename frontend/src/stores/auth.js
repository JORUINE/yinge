/**
 * 登录态
 */
import { defineStore } from 'pinia';
import { ElMessage } from 'element-plus';
import { authApi } from '@/api';
import { getToken, setToken } from '@/api/client';

/** 记住本机游客账号的标识，等用户注册 / 登录后把它的数据迁移过去（A-07） */
const GUEST_ID_KEY = 'yinge_guest_id';
function readGuestId() {
  try {
    return localStorage.getItem(GUEST_ID_KEY) || '';
  } catch {
    return '';
  }
}
function writeGuestId(v) {
  try {
    if (v) localStorage.setItem(GUEST_ID_KEY, String(v));
    else localStorage.removeItem(GUEST_ID_KEY);
  } catch {
    /* 隐私模式可能不可用，忽略 */
  }
}

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
      const guestId = readGuestId();
      const data = await authApi.login(payload);
      this.applySession(data);
      await this.migrateGuest(guestId);
      return data;
    },
    async register(payload) {
      const guestId = readGuestId();
      const data = await authApi.register(payload);
      this.applySession(data);
      await this.migrateGuest(guestId);
      return data;
    },
    /**
     * A-07 游客数据迁移：登录 / 注册成功后，把本机游客账号的对决 / 票 / 测评 / 收藏转到当前账号。
     * 迁移失败不影响登录本身（只静默跳过）。
     */
    async migrateGuest(guestId) {
      if (!guestId) return;
      try {
        const r = await authApi.claimGuest(guestId);
        if (r?.migrated) {
          const m = r.moved || {};
          ElMessage.success(`已把游客数据迁移到本账号（对决 ${m.battles || 0} · 票 ${m.votes || 0}）`);
        }
      } catch {
        /* 迁移失败不阻塞登录 */
      } finally {
        writeGuestId('');
      }
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
      // 游客身份：记下它的 id，等用户注册 / 登录时把数据迁过去（A-07）
      if (user?.role === 'guest') writeGuestId(user.id || user.userId || user._id);
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
