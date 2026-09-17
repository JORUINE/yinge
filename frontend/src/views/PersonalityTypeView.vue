<template>
  <div class="detail">
    <RouterLink to="/personality/types" class="back">← 返回图鉴</RouterLink>

    <div v-if="loading" class="state muted">加载中…</div>

    <template v-else-if="type">
      <div class="ptcard" :style="{ '--pc': pc, '--pc2': pc2 }">
        <div class="glowc"></div>
        <div class="pthd">
          <div>
            <div class="ptcode">{{ type.code }}</div>
            <div class="ptname">{{ type.name }}</div>
            <div class="accent2"></div>
            <p class="ptdesc">{{ type.description }}</p>
            <div class="btns">
              <RouterLink to="/personality/test" class="btn pri">测测我是哪种</RouterLink>
              <RouterLink to="/personality/types" class="btn ghost">看看其他人格</RouterLink>
            </div>
          </div>
          <div>
            <div v-for="d in dims" :key="d.label" class="dim2">
              <div class="lb"><span>{{ d.label }}</span><span>{{ d.ten }} / 10</span></div>
              <div class="bar2"><i :style="{ width: d.ratio + '%' }"></i></div>
            </div>
            <p v-if="!dims.length" class="hint muted">这个类型没有配置维度特征</p>
          </div>
        </div>
      </div>

      <div class="hd" style="margin-top: 26px">
        <b>这个人格常听的专辑</b><span>来自该类型的推荐池</span>
      </div>

      <div v-if="albums.length" class="recs">
        <div v-for="a in albums" :key="a.albumId" class="alb" :style="accentStyle(a)">
          <div class="art albc"><img :src="a.artworkUrl" :alt="a.name" loading="lazy" /></div>
          <b>{{ a.name }}</b>
          <div class="accent"></div>
          <div class="ar"><i></i>{{ a.artistName || '—' }}</div>
          <div class="mt num">{{ year(a.releaseDate) }} · {{ a.trackCount }} 首</div>
        </div>
      </div>
      <p v-else class="note">
        这个类型还没有推荐专辑 —— 后台 `recommendAlbumIds` 为空。管理员在「人格类型管理」里绑几张即可。
      </p>
    </template>

    <div v-else class="state g-card">
      <h2>找不到这个人格类型</h2>
      <RouterLink to="/personality/types" class="btn ghost">回图鉴</RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { personalityApi } from '@/api';
import { typeColor, normalizeScores } from '@/utils/personality.js';
import { accentStyleOf, ensureAlbumAccent } from '@/utils/coverColor.js';

const route = useRoute();
const code = route.params.code;

const loading = ref(true);
const type = ref(null);
const albums = ref([]);

const pc = computed(() => typeColor(type.value?.code || code));
const pc2 = computed(() => {
  const c = pc.value;
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.3)`;
  }
  return 'rgba(14,165,233,.3)';
});
const dims = computed(() => normalizeScores(type.value?.dims));

const year = (d) => (d ? String(d).slice(0, 4) : '');
/** 专辑主色走 coverColor（读封面真色），不再用 albumId 满饱和哈希色（守则规则 ⑤） */
function accentStyle(album) {
  return accentStyleOf(album);
}
function primeAccents() {
  for (const a of albums.value.slice(0, 6)) ensureAlbumAccent(a).catch(() => {});
}

onMounted(async () => {
  try {
    const data = await personalityApi.typeDetail(code);
    type.value = data;
    albums.value = data.recommendAlbums || [];
    primeAccents();
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.detail {
  padding-bottom: var(--sp-7);
}
.back {
  display: inline-block;
  color: var(--brand-deep);
  font-size: var(--fs-sm);
  margin: var(--sp-5) 0 var(--sp-4);
}
.state {
  margin: var(--sp-7) auto;
  padding: var(--sp-6);
  max-width: 520px;
  text-align: center;
}
.btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.hint {
  font-size: var(--fs-sm);
}
@media (max-width: 860px) {
  .pthd {
    grid-template-columns: 1fr;
  }
  .recs {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
