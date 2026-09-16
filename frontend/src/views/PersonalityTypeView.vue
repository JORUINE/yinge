<template>
  <div class="container narrow">
    <RouterLink to="/personality/types" class="back">← 返回图鉴</RouterLink>

    <div v-if="loading" class="state muted">加载中…</div>

    <template v-else-if="type">
      <section class="card head">
        <span class="code">{{ type.code }}</span>
        <h1>{{ type.name }}</h1>
        <p class="desc muted">{{ type.description }}</p>
        <div v-if="dims.length" class="dims">
          <span v-for="d in dims" :key="d.label" class="dim">
            <strong class="num">{{ d.score }}</strong>{{ d.label }}
          </span>
        </div>
      </section>

      <section v-if="albums.length" class="rec">
        <h2>这个人格常听的专辑</h2>
        <div class="grid">
          <article v-for="a in albums" :key="a.albumId" class="card album">
            <img :src="a.artworkUrl" :alt="a.name" />
            <p class="name">{{ a.name }}</p>
            <p class="muted small num">{{ year(a.releaseDate) }} · {{ a.trackCount }} 首</p>
          </article>
        </div>
      </section>
      <p v-else class="muted none">这个类型暂时还没有推荐专辑。</p>
    </template>

    <div v-else class="state card empty">
      <p class="big">找不到这个人格类型</p>
      <RouterLink to="/personality/types"><el-button type="primary">回图鉴</el-button></RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { personalityApi } from '@/api';

const route = useRoute();
const code = route.params.code;
const loading = ref(true);
const type = ref(null);
const albums = ref([]);

const dims = computed(() => {
  const d = type.value?.dims || [];
  return Array.isArray(d) ? d : Object.entries(d).map(([label, score]) => ({ label, score }));
});

function year(d) {
  return d ? String(d).slice(0, 4) : '';
}

onMounted(async () => {
  try {
    const data = await personalityApi.typeDetail(code);
    type.value = data;
    albums.value = data.recommendAlbums || [];
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.narrow {
  max-width: 880px;
  padding-top: var(--sp-7);
  padding-bottom: var(--sp-8);
}
.back {
  display: inline-block;
  color: var(--brand-deep);
  font-size: var(--fs-sm);
  margin-bottom: var(--sp-4);
}
.head {
  padding: var(--sp-6);
  margin-bottom: var(--sp-5);
}
.code {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--text-3);
}
.head h1 {
  font-size: var(--fs-display);
  margin: var(--sp-2) 0 var(--sp-3);
}
.desc {
  line-height: 1.8;
}
.dims {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-4);
  margin-top: var(--sp-4);
}
.dim {
  font-size: var(--fs-sm);
  color: var(--text-2);
}
.dim strong {
  color: var(--brand-deep);
  font-size: var(--fs-h3);
  margin-right: 4px;
}
.rec h2 {
  font-size: var(--fs-h2);
  margin-bottom: var(--sp-4);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--sp-4);
}
.album {
  padding: var(--sp-3);
  text-align: center;
}
.album img {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius);
  object-fit: cover;
  margin-bottom: var(--sp-2);
}
.album .name {
  font-size: var(--fs-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.small {
  font-size: var(--fs-sm);
}
.none {
  padding-bottom: var(--sp-6);
}
.state {
  padding: var(--sp-6);
  text-align: center;
}
.empty {
  max-width: 460px;
  margin: var(--sp-5) auto;
}
.empty .big {
  font-size: var(--fs-h2);
  margin-bottom: var(--sp-3);
}
</style>
