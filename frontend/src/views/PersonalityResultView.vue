<template>
  <div class="container narrow">
    <div v-if="loading" class="state muted">正在生成你的音乐人格卡…</div>

    <template v-else-if="result">
      <section class="card card-top">
        <p class="eyebrow">你的音乐人格</p>
        <h1>{{ result.typeName }}</h1>
        <p class="desc muted">{{ result.typeDescription }}</p>
        <div class="code-row">
          <span class="code num">{{ result.typeCode }}</span>
          <span class="date muted small">{{ fmtDate(result.createdAt) }}</span>
        </div>
      </section>

      <section class="card comment">
        <div class="comment-head">
          <h2>专属解读</h2>
          <el-tag size="small" :type="result.aiCommentSource === 'llm' ? 'success' : 'info'" effect="plain">
            {{ result.aiCommentSource === 'llm' ? 'AI 个性化生成' : '模板解读' }}
          </el-tag>
        </div>
        <p class="body">{{ result.aiComment }}</p>
      </section>

      <section v-if="scoreItems.length" class="card scores">
        <h2>你的维度得分</h2>
        <div class="score-list">
          <div v-for="s in scoreItems" :key="s.label" class="score-row">
            <span class="label">{{ s.label }}</span>
            <div class="bar"><span class="fill" :style="{ width: barWidth(s.score) }" /></div>
            <span class="num val">{{ s.score }}</span>
          </div>
        </div>
      </section>

      <section v-if="albums.length" class="rec">
        <h2>为你推荐的 3 张专辑</h2>
        <div class="grid">
          <article v-for="a in albums" :key="a.albumId" class="card album">
            <img :src="a.artworkUrl" :alt="a.name" />
            <p class="name">{{ a.name }}</p>
            <p class="muted small num">{{ year(a.releaseDate) }} · {{ a.trackCount }} 首</p>
          </article>
        </div>
      </section>

      <div class="actions">
        <RouterLink to="/personality/test"><el-button>再测一次</el-button></RouterLink>
        <RouterLink to="/personality/types"><el-button type="primary">看看其他人格</el-button></RouterLink>
      </div>
    </template>

    <div v-else class="state card empty">
      <p class="big">找不到这条测评结果</p>
      <RouterLink to="/personality/test"><el-button type="primary">去测评</el-button></RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { personalityApi } from '@/api';
import { fmtDate } from '@/utils/labels';

const route = useRoute();
const id = route.params.id;
const loading = ref(true);
const result = ref(null);
const albums = ref([]);

const scoreItems = computed(() => {
  const s = result.value?.scores;
  if (!s) return [];
  if (Array.isArray(s)) return s.map((x) => ({ label: x.label ?? x.dim, score: x.score }));
  return Object.entries(s).map(([label, score]) => ({ label, score }));
});

function barWidth(score) {
  const n = Number(score) || 0;
  return `${Math.max(4, Math.min(100, n))}%`;
}
function year(d) {
  return d ? String(d).slice(0, 4) : '';
}

onMounted(async () => {
  try {
    const data = await personalityApi.result(id);
    result.value = data;
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
  max-width: 820px;
  padding-top: var(--sp-7);
  padding-bottom: var(--sp-8);
}
.state {
  padding: var(--sp-8);
  text-align: center;
}
.card-top {
  padding: var(--sp-6);
  text-align: center;
  margin-bottom: var(--sp-4);
}
.eyebrow {
  font-family: var(--font-display);
  font-size: var(--fs-xs);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--brand);
}
.card-top h1 {
  font-size: var(--fs-display);
  margin: var(--sp-2) 0 var(--sp-3);
  background: linear-gradient(90deg, var(--brand-deep), var(--accent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.desc {
  line-height: 1.8;
  max-width: 560px;
  margin: 0 auto;
}
.code-row {
  margin-top: var(--sp-3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
}
.code {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--text-3);
}
.comment {
  padding: var(--sp-5) var(--sp-6);
  margin-bottom: var(--sp-4);
}
.comment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-3);
}
.comment-head h2,
.scores h2,
.rec h2 {
  font-size: var(--fs-h2);
}
.body {
  line-height: 1.9;
}
.scores {
  padding: var(--sp-5) var(--sp-6);
  margin-bottom: var(--sp-4);
}
.score-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin-top: var(--sp-3);
}
.score-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.label {
  width: 96px;
  font-size: var(--fs-sm);
  color: var(--text-2);
  flex-shrink: 0;
}
.bar {
  flex: 1;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--surface-2);
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--brand), var(--accent));
}
.val {
  width: 36px;
  text-align: right;
  font-size: var(--fs-sm);
  color: var(--brand-deep);
}
.rec {
  margin-top: var(--sp-2);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--sp-4);
  margin-top: var(--sp-4);
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
.actions {
  display: flex;
  gap: var(--sp-3);
  justify-content: center;
  margin-top: var(--sp-6);
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
