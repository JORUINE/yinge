<template>
  <div class="container admin">
    <section class="head">
      <div>
        <p class="eyebrow">后台总览</p>
        <h1>音格管理台</h1>
      </div>
    </section>

    <nav class="subnav">
      <RouterLink to="/admin/questions">题目管理</RouterLink>
      <RouterLink to="/admin/types">人格类型</RouterLink>
      <RouterLink to="/admin/music">音乐数据</RouterLink>
      <RouterLink to="/admin/users">用户管理</RouterLink>
    </nav>

    <div v-if="loading" class="state muted">加载中…</div>

    <template v-else>
      <section class="stats">
        <div v-for="s in statsItems" :key="s.label" class="card stat">
          <strong class="num">{{ s.value }}</strong>
          <span class="muted">{{ s.label }}</span>
        </div>
      </section>

      <section class="card dist">
        <h2>测评结果分布</h2>
        <div v-if="typeStats.length" class="bars">
          <div v-for="t in typeStats" :key="t.typeCode" class="bar-row">
            <span class="code">{{ t.typeCode }}</span>
            <div class="bar"><span class="fill" :style="{ width: barWidth(t.count) }" /></div>
            <span class="num val">{{ t.count }}</span>
          </div>
        </div>
        <p v-else class="muted">还没有测评数据。</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi } from '@/api';

const loading = ref(true);
const data = ref(null);

const statsItems = computed(() => {
  const d = data.value || {};
  return [
    { label: '注册用户', value: d.users?.total ?? '—' },
    { label: '被禁用', value: d.users?.banned ?? '—' },
    { label: '对决总数', value: d.battles?.total ?? '—' },
    { label: '专辑缓存', value: d.music?.albums ?? '—' },
    { label: '歌手缓存', value: d.music?.artists ?? '—' },
    { label: '测评结果', value: d.results?.total ?? '—' },
    { label: '有效票数', value: d.votes?.valid ?? '—' },
  ];
});

const typeStats = computed(() => data.value?.typeStats || []);
function barWidth(count) {
  const max = Math.max(1, ...typeStats.value.map((t) => t.count));
  return `${Math.round((count / max) * 100)}%`;
}

onMounted(async () => {
  try {
    data.value = await adminApi.dashboard();
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.admin {
  padding-top: var(--sp-6);
  padding-bottom: var(--sp-8);
}
.eyebrow {
  font-family: var(--font-display);
  font-size: var(--fs-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand);
}
.head h1 {
  font-size: var(--fs-h1);
  margin-top: var(--sp-2);
}
.subnav {
  display: flex;
  gap: var(--sp-2);
  flex-wrap: wrap;
  margin: var(--sp-4) 0 var(--sp-5);
}
.subnav a {
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--radius-full);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: var(--fs-sm);
}
.subnav a:hover {
  background: var(--brand-soft);
  color: var(--brand-deep);
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--sp-4);
  margin-bottom: var(--sp-5);
}
.stat {
  padding: var(--sp-5);
  text-align: center;
}
.stat strong {
  display: block;
  font-size: var(--fs-display);
  color: var(--brand-deep);
  line-height: 1.1;
}
.stat span {
  font-size: var(--fs-sm);
}
.dist {
  padding: var(--sp-5) var(--sp-6);
}
.dist h2 {
  font-size: var(--fs-h2);
  margin-bottom: var(--sp-4);
}
.bars {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.bar-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.code {
  width: 56px;
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--text-3);
  flex-shrink: 0;
}
.bar {
  flex: 1;
  height: 10px;
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
  width: 40px;
  text-align: right;
  font-size: var(--fs-sm);
  color: var(--brand-deep);
}
.state {
  padding: var(--sp-6);
}
</style>
