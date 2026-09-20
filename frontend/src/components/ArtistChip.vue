<template>
  <button
    class="chip artistchip"
    :class="{ on, busy, taken }"
    type="button"
    :disabled="busy || taken"
    @click="$emit('pick', artist)"
  >
    <span class="ava">
      <img v-if="photo" :src="photo" :alt="artist.name" loading="lazy" />
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
import { computed } from 'vue';

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

const photo = computed(() => props.artist.photoUrl || props.artist.artworkUrl || null);
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
