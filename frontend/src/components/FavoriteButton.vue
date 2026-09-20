<template>
  <button
    class="favbtn"
    :class="{ on: active, icon: iconOnly, sm: small }"
    type="button"
    :disabled="busy"
    :title="active ? '取消收藏' : '收藏'"
    @click.stop.prevent="onClick"
  >
    <svg
      viewBox="0 0 24 24"
      :fill="active ? 'currentColor' : 'none'"
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linejoin="round"
    >
      <path d="M12 4.6l2.35 4.76 5.25.77-3.8 3.7.9 5.23L12 16.59l-4.7 2.47.9-5.23-3.8-3.7 5.25-.77z" />
    </svg>
    <span v-if="!iconOnly">{{ active ? '已收藏' : '收藏' }}</span>
  </button>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { useFavoritesStore } from '@/stores/favorites';

const props = defineProps({
  /** 专辑（或人格类型）对象；需要带本地 id —— serializeAlbum 已补出 `id` */
  album: { type: Object, required: true },
  targetType: { type: String, default: 'album' },
  /** 只显示星星，不显示文字（卡片角落用） */
  iconOnly: { type: Boolean, default: false },
  small: { type: Boolean, default: false },
});

const auth = useAuthStore();
const fav = useFavoritesStore();
const router = useRouter();
const route = useRoute();
const busy = ref(false);

const targetId = computed(() => String(props.album?.id ?? props.album?._id ?? ''));
/** 有些接口（对位赛战报行等）只给外部 albumId —— 收藏时先换成本地 id，见 store.toggle */
const externalId = computed(() => props.album?.albumId ?? '');
const active = computed(() => fav.has(targetId.value));

onMounted(() => {
  // 游客也要能收藏 → 有令牌（含游客令牌）就拉一次收藏列表
  if (auth.isLoggedIn) fav.load();
});

async function onClick() {
  /**
   * ⚠️ 2026-09-21 用户报："对位赛收藏还是不行"（第二次）
   * 原来这里把**游客**也拦下来了（游客≠正式注册 → 弹提示 + 跳登录页）。
   * 但项目硬规则是「**不注册也要能玩全部主线**」，而"收藏专辑"就是主线的一环 ——
   * 游客号本身就是真实账号（role=guest）+ 正式 JWT，后端 favorites 完全认它，
   * 所以这里不再拦游客，让游客也能收藏（数据在他本机这个游客号上，注册时自动迁移过去）。
   * 真正没登录（连游客身份都没有）时才去领一个游客身份或跳登录。
   */
  if (!auth.isLoggedIn) {
    try {
      await auth.ensureGuest();
    } catch {
      ElMessage.info('先登录一下才能收藏');
      router.push({ name: 'login', query: { redirect: route.fullPath } });
      return;
    }
  }
  if (!targetId.value && !externalId.value) {
    ElMessage.error('这个条目暂时无法收藏');
    return;
  }
  busy.value = true;
  try {
    const nowFav = await fav.toggle(props.album, props.targetType);
    ElMessage.success(nowFav ? '已加入收藏' : '已取消收藏');
  } catch (err) {
    ElMessage.error(err?.message || '操作失败');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.favbtn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  padding: 6px 13px;
  border-radius: 999px;
  border: 1px solid var(--gbd);
  background: var(--glass2);
  color: var(--text2);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.favbtn:hover:not(:disabled) {
  color: var(--brand-deep);
  border-color: var(--brand);
}
.favbtn.on {
  color: #b4792f;
  border-color: rgba(224, 135, 0, 0.5);
  background: rgba(224, 135, 0, 0.14);
}
.favbtn:disabled {
  opacity: 0.6;
  cursor: default;
}
.favbtn svg {
  width: 14px;
  height: 14px;
}
.favbtn.icon {
  padding: 6px;
}
.favbtn.sm {
  font-size: 13px;
  padding: 4px 10px;
}
.favbtn.sm.icon {
  padding: 5px;
}
</style>
