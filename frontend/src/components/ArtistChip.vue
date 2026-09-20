<template>
  <button
    class="chip artistchip"
    :class="{ on, busy }"
    type="button"
    :disabled="busy"
    @click="$emit('pick', artist)"
  >
    <span class="ava">
      <img v-if="artist.artworkUrl" :src="artist.artworkUrl" :alt="artist.name" loading="lazy" />
      <i v-else>{{ initial }}</i>
    </span>
    <span class="tx">
      <b>{{ name }}</b>
      <em>{{ brief }}</em>
    </span>
    <span v-if="action" class="act">{{ busy ? '请稍候…' : action }}</span>
  </button>
</template>

<script setup>
/**
 * 歌手候选卡（带头像 + 简介）
 * ------------------------------------------------------------
 * 用户 P1 需求："搜索结果这里空着"，要歌手图片与介绍。
 * iTunes Search API 不返回歌手头像，后端用「代表作封面代位」补上了 artworkUrl，
 * 这里只负责展示；简介全部来自真实字段（流派 / 正式专辑数 / 年代跨度 / 代表作），
 * 不编任何"著名歌手"之类的空话。
 */
import { computed } from 'vue';

const props = defineProps({
  artist: { type: Object, required: true },
  /** 已加入（高亮） */
  on: { type: Boolean, default: false },
  /** 正在加载其专辑 */
  busy: { type: Boolean, default: false },
  /** 右侧动作文案，如"加入" */
  action: { type: String, default: '' },
});

defineEmits(['pick']);

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
