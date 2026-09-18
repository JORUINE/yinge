/**
 * 收藏状态（跨页面共享）
 * ------------------------------------------------------------
 * 收藏接口（POST / DELETE /favorites）用的是「专辑的本地 ObjectId」，
 * 所以后端 serializeAlbum 已补出 `id`。这里维护「当前用户已收藏的 id 集合」，
 * 让各页面的收藏按钮能即时切换状态，而不必每次重新问后端。
 *
 * 注意：收藏必须登录（后端 favorites 路由挂了 authenticate）。
 */
import { defineStore } from 'pinia';
import { favoriteApi } from '@/api';
import { useAuthStore } from './auth';

export const useFavoritesStore = defineStore('favorites', {
  state: () => ({
    ids: new Set(),
    loaded: false,
    loading: false,
  }),
  getters: {
    has: (state) => (targetId) => state.ids.has(String(targetId ?? '')),
  },
  actions: {
    async load(force = false) {
      const auth = useAuthStore();
      if (!auth.isLoggedIn) {
        this.ids = new Set();
        this.loaded = false;
        return;
      }
      if (this.loading) return;
      if (this.loaded && !force) return;
      this.loading = true;
      try {
        const data = await favoriteApi.list({ page: 1, pageSize: 100 });
        this.ids = new Set((data.list || []).map((f) => String(f.targetId)));
        this.loaded = true;
      } catch {
        /* 拉不到就当作没有收藏，不打断页面 */
      } finally {
        this.loading = false;
      }
    },

    /** 切换收藏；返回 true = 已收藏，false = 已取消 */
    async toggle(item, targetType = 'album') {
      const targetId = String(item?.id ?? item?._id ?? '');
      if (!targetId) throw new Error('这个条目暂时无法收藏');
      if (this.ids.has(targetId)) {
        try {
          await favoriteApi.remove(targetId);
        } catch (err) {
          // 服务端其实没有这条收藏（本地状态过期）→ 当作已取消，别弹红字
          if (err?.code !== 1002) throw err;
        }
        this.ids.delete(targetId);
        this.loaded = true;
        return false;
      }
      try {
        await favoriteApi.add({ targetType, targetId });
      } catch (err) {
        // 服务端其实已经有了（本地状态没同步）→ 当作已收藏，别弹红字
        // 3001 = 重复；后端现在已改成幂等，这里只是兜底老接口
        if (err?.code !== 3001) throw err;
      }
      this.ids.add(targetId);
      this.loaded = true;
      return true;
    },

    /** 退出登录时清空 */
    reset() {
      this.ids = new Set();
      this.loaded = false;
    },

    /** 本地同步：在收藏页取消后，让排行榜/结果页的按钮立即回到未收藏态 */
    forget(targetId) {
      this.ids.delete(String(targetId ?? ''));
    },
  },
});
