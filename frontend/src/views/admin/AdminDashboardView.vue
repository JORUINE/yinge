<template>
  <AdminShell>
    <div class="admhd">
      <div>
        <h3>数据看板</h3>
        <p>全站关键指标的实时快照</p>
      </div>
      <button class="mini" type="button" @click="reload">刷新</button>
    </div>

    <div v-if="loading" class="state muted">加载中…</div>

    <template v-else>
      <div class="kpi4">
        <div class="k4"><b class="num">{{ d.users?.total ?? '—' }}</b><span>注册用户</span><div class="dl">禁用 {{ d.users?.banned ?? 0 }}</div></div>
        <div class="k4"><b class="num">{{ d.battles?.total ?? '—' }}</b><span>对决总数</span></div>
        <div class="k4"><b class="num">{{ d.music?.albums ?? '—' }}</b><span>专辑缓存</span><div class="dl">歌手 {{ d.music?.artists ?? 0 }}</div></div>
        <div class="k4"><b class="num">{{ d.votes?.valid ?? '—' }}</b><span>有效票数</span></div>
      </div>

      <div class="panel">
        <h4>测评结果分布</h4>
        <p class="ps">共 {{ d.results?.total ?? 0 }} 份结果 · 柱高按各类人数</p>
        <div v-if="typeStats.length" class="bars">
          <div v-for="t in typeStats" :key="t.typeCode" class="bc">
            <div class="bv" :style="{ height: barH(t.count) }"></div>
            <span class="bl">{{ t.typeCode }}</span>
          </div>
        </div>
        <p v-else class="muted">还没有测评数据。</p>
      </div>

      <div class="panel">
        <h4>内容概览</h4>
        <p class="ps">缓存规模与投票情况</p>
        <table class="tbl">
          <tbody>
            <tr><td>专辑缓存</td><td class="num">{{ d.music?.albums ?? '—' }}</td></tr>
            <tr><td>歌手缓存</td><td class="num">{{ d.music?.artists ?? '—' }}</td></tr>
            <tr><td>测评结果</td><td class="num">{{ d.results?.total ?? '—' }}</td></tr>
            <tr><td>有效票数</td><td class="num">{{ d.votes?.valid ?? '—' }}</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </AdminShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi } from '@/api';
import AdminShell from '@/layouts/AdminShell.vue';

const loading = ref(true);
const d = ref({});

const typeStats = computed(() => d.value.typeStats || []);
function barH(count) {
  const max = Math.max(1, ...typeStats.value.map((t) => t.count));
  return `${Math.max(4, Math.round((count / max) * 100))}%`;
}

async function reload() {
  loading.value = true;
  try {
    d.value = (await adminApi.dashboard()) || {};
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.state {
  padding: 24px;
  text-align: center;
}
.bars {
  height: 150px;
}
</style>
