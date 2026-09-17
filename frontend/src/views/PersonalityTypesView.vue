<template>
  <div class="types">
    <div class="hd" style="margin-top: 22px">
      <b class="big">音乐人格图鉴</b>
      <span>{{ items.length }} 种人格 · 已有 {{ stats.total || 0 }} 人完成测评 · 数据每日更新</span>
    </div>

    <div v-if="loading" class="state muted">加载中…</div>

    <div v-else-if="!items.length" class="state g-card">
      <h2>类型库还是空的</h2>
      <p class="muted">需要管理员先在后台导入人格类型与题目。</p>
    </div>

    <template v-else>
      <div class="atlas">
        <div
          v-for="it in items"
          :key="it.code"
          class="at"
          :style="{ '--tc': typeColor(it.code) }"
          @click="$router.push({ name: 'personality-type', params: { code: it.code } })"
        >
          <div class="num">{{ it.code }}</div>
          <div class="nm">{{ it.name }}</div>
          <div class="ds">{{ it.description }}</div>
          <div class="pct">{{ pct(it.ratio) }} · {{ it.count }} 人</div>
        </div>
      </div>

      <div class="dist">
        <h4>各种人格的分布情况</h4>
        <div v-for="it in sorted" :key="it.code" class="dr">
          <b>{{ it.name }}</b>
          <span class="bb2"><i :style="{ width: Math.max(2, Math.round((it.ratio || 0) * 100)) + '%', background: typeColor(it.code) }"></i></span>
          <span class="vv">{{ pct(it.ratio) }}</span>
        </div>
      </div>

      <p class="note">
        <b>说明：</b>图鉴的作用不只是"展示分类"，而是让用户<b>看到自己在人群中的位置</b> —— 每张卡上都写着占比与人数。
        这些数字来自真实用户作答的累计，清空数据库就会归零。
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { personalityApi } from '@/api';
import { typeColor } from '@/utils/personality.js';

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
    return { ...t, count: s.count || 0, ratio: s.ratio || 0 };
  }),
);

const sorted = computed(() => items.value.slice().sort((a, b) => (b.ratio || 0) - (a.ratio || 0)));

function pct(ratio) {
  return `${Math.round((ratio || 0) * 100)}%`;
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
.types {
  padding-bottom: var(--sp-7);
}
.big {
  font-size: 20px;
  letter-spacing: -0.3px;
}
.state {
  margin: var(--sp-7) auto;
  padding: var(--sp-6);
  max-width: 520px;
  text-align: center;
}
@media (max-width: 860px) {
  .atlas {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .atlas {
    grid-template-columns: 1fr;
  }
}
</style>
