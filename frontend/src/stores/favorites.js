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
import { favoriteApi, musicApi } from '@/api';
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
      /**
       * ⚠️ 2026-09-21 用户报："对位赛收藏还是不行"
       * 根因：只认 `id` / `_id`（本地 ObjectId）。对位赛战报行左边这些接口返回的对象
       * 里带的是**外部 albumId**（数字串），本地 id 字段没进来 → targetId 为空 →
       * 直接抛「这个条目暂时无法收藏」，按钮看着能点、点了就报错。
       * 兜底：拿不到本地 id 但拿得到外部 albumId 时，先去后端换成本地 id 再收藏。
       */
      let localId = targetId;
      if (!localId) {
        const externalId = item?.albumId;
        if (externalId == null) throw new Error('这个条目暂时无法收藏');
        try {
          const res = await musicApi.getAlbum(externalId);
          // getAlbum 直接把 serializeAlbum 的结果当 data 返回，本地 id 就在 `id`
          localId = String(res?.id ?? res?._id ?? '');
        } catch {
          localId = '';
        }
        if (!localId) throw new Error('这张专辑还没进曲库，暂时无法收藏');
      }
      if (this.ids.has(localId)) {
        try {
          await favoriteApi.remove(localId);
        } catch (err) {
          // 服务端其实没有这条收藏（本地状态过期）→ 当作已取消，别弹红字
          if (err?.code !== 1002) throw err;
        }
        this.ids.delete(localId);
        this.loaded = true;
        return false;
      }
      try {
        await favoriteApi.add({ targetType, targetId: localId });
      } catch (err) {
        // 服务端其实已经有了（本地状态没同步）→ 当作已收藏，别弹红字
        // 3001 = 重复；后端现在已改成幂等，这里只是兜底老接口
        if (err?.code !== 3001) throw err;
      }
      this.ids.add(localId);
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
