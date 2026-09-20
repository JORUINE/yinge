<template>
  <button
    class="chip artistchip"
    :class="{ on, busy, taken }"
    type="button"
    :disabled="busy || taken"
    @click="$emit('pick', artist)"
  >
    <span class="ava">
      <img v-if="shown" :key="shown" :src="shown" :alt="artist.name" decoding="async" />
      <i v-else>{{ initial }}</i>
    </span>
    <span class="tx">
      <b>{{ name }}</b>
      <em>{{ brief }}</em>
    </span>
    <span v-if="taken || action" class="act">{{ taken ? '已加入' : busy ? '请稍候…' : action }}</span>
  </button>
</template>

<script setup>
/**
 * 歌手候选卡（带头像 + 简介）
 * ------------------------------------------------------------
 * 头像优先级：① Apple Music 艺术家页拿到的**歌手本人照片**（photoUrl）
 *            ② 退化为代表作专辑封面（后端补的 artworkUrl）
 *            ③ 都没有 → 首字母占位（不显示裂图）
 * 简介全部来自真实字段（流派 / 正式专辑数 / 年代跨度 / 代表作），不编"著名歌手"这类空话。
 * `taken`：已在池子里 —— 仍然显示（**不要静默过滤掉**，否则用户以为"这位大牌搜不出来"）。
 */
import { computed, ref, watch } from 'vue';

const props = defineProps({
  artist: { type: Object, required: true },
  /** 已加入（高亮） */
  on: { type: Boolean, default: false },
  /** 已在池子里（不可再点） */
  taken: { type: Boolean, default: false },
  /** 正在加载其专辑 */
  busy: { type: Boolean, default: false },
  /** 右侧动作文案，如"加入" */
  action: { type: String, default: '' },
});

defineEmits(['pick']);

/**
 * 头像显示逻辑（2026-09-20 用户："搜索出歌手她会卡一下再从专辑封面变成歌手本人头像"）
 * ------------------------------------------------------------------
 * 原因：真图是异步补上来的，`src` 直接被替换 → 浏览器要重新解码，中间会闪一下空白/旧图，
 *      看起来就是"卡一下"。
 * 修法：**先把新图预载（`new Image()` + onload）**，解码完成后再换；
 *      换的时候 `:key` 变化会让元素重建，配一个 280ms 的淡入动画 → 平滑过渡，不闪不卡。
 * 兜底：预载失败就保持当前图（绝不显示裂图）。
 */
const shown = ref(null);
const fallbackSrc = computed(() => props.artist.photoUrl || props.artist.artworkUrl || null);

watch(
  fallbackSrc,
  (next) => {
    if (!next || next === shown.value) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      shown.value = next; // 解码完再换 → 无空白帧
    };
    img.onerror = () => {
      if (!shown.value) shown.value = null; // 保持现状（显示首字母占位）
    };
    img.src = next;
  },
  { immediate: true },
);

const name = computed(() => (props.busy ? '加载中…' : props.artist.name || '未知歌手'));
const initial = computed(() => (props.artist.name || '?').slice(0, 1));

/** 一句话简介：流派 · 正式专辑数 · 年代跨度 · 代表作（能拿到哪个写哪个） */
const brief = computed(() => {
  const a = props.artist;
  const parts = [];
  if (a.genre) parts.push(a.genre);
  if (a.cached && a.albumCount) {
    parts.push(`曲库 ${a.albumCount} 张正式专辑`);
    if (a.yearFrom && a.yearTo && a.yearFrom !== a.yearTo) parts.push(`${a.yearFrom}–${a.yearTo}`);
    else if (a.yearFrom) parts.push(`${a.yearFrom}`);
  } else if (a.topAlbum) {
    parts.push(`代表作《${a.topAlbum}》`);
    parts.push('未入库');
  } else {
    parts.push('未入库 · 点一下即可拉取专辑');
  }
  return parts.join(' · ');
});
</script>
