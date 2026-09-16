<template>
  <div class="container">
    <section class="head">
      <div>
        <p class="eyebrow">人格图鉴</p>
        <h1>全站都在测的几种音乐人格</h1>
        <p class="muted">下面是类型库，条形是按当前全站测评结果统计的占比。</p>
      </div>
      <RouterLink to="/personality/test"><el-button type="primary">去测我自己</el-button></RouterLink>
    </section>

    <div v-if="loading" class="state muted">加载中…</div>

    <div v-else-if="!items.length" class="state card empty">
      <p class="big">类型库还是空的</p>
      <p class="muted">需要管理员先在后台导入人格类型与题目。</p>
    </div>

    <div v-else class="grid">
      <RouterLink
        v-for="it in items"
        :key="it.code"
        :to="{ name: 'personality-type', params: { code: it.code } }"
        class="card item"
      >
        <div class="top">
          <span class="code">{{ it.code }}</span>
          <span class="pct num">{{ pctText(it.ratio) }}</span>
        </div>
        <h3>{{ it.name }}</h3>
        <p class="desc muted">{{ it.description }}</p>
        <div class="bar">
          <span class="fill" :style="{ width: pctText(it.ratio) }" />
        </div>
        <p class="count muted small">已有 {{ it.count }} 人测出</p>
      </RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { personalityApi } from '@/api';

const loading = ref(true);
const types = ref([]);
const stats = ref({ total: 0, list: [] });

const statMap = computed(() => {
  const m = new Map();
  for (const s of stats.value.list || []) m.set(s.typeCode, s);
  return m;
});

const items = computed(() =>
  (types.value || []).map((t) => {
    const s = statMap.value.get(t.code) || { count: 0, ratio: 0 };
    return { ...t, count: s.count, ratio: s.ratio };
  }),
);

function pctText(ratio) {
  const pct = Math.round((ratio || 0) * 100);
  return `${pct}%`;
}

onMounted(async () => {
  loading.value = true;
  try {
    const [t, s] = await Promise.all([personalityApi.types(), personalityApi.stats()]);
    types.value = t.list || [];
    stats.value = s || { total: 0, list: [] };
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-7) 0 var(--sp-5);
}
.head h1 {
  font-size: var(--fs-h1);
  margin-top: var(--sp-2);
}
.head .muted {
  margin-top: var(--sp-2);
}
.eyebrow {
  font-family: var(--font-display);
  font-size: var(--fs-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand);
}
.state {
  padding: var(--sp-6);
  text-align: center;
}
.empty {
  max-width: 460px;
  margin: var(--sp-5) auto var(--sp-8);
}
.empty .big {
  font-size: var(--fs-h2);
  margin-bottom: var(--sp-2);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--sp-4);
  padding-bottom: var(--sp-8);
}
.item {
  padding: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  transition: transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out);
}
.item:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-2);
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.code {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.pct {
  color: var(--accent);
  font-weight: 600;
}
.item h3 {
  font-size: var(--fs-h2);
}
.desc {
  font-size: var(--fs-sm);
  line-height: 1.6;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.bar {
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--surface-2);
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--brand), var(--accent));
}
.small {
  font-size: var(--fs-sm);
}
</style>
