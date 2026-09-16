<template>
  <div class="container admin">
    <section class="head">
      <div>
        <p class="eyebrow">后台管理</p>
        <h1>音乐数据管理</h1>
        <p class="muted">歌手与专辑来自 iTunes Search API，本地做缓存。可按歌手名搜索并拉取，或刷新已缓存歌手。</p>
      </div>
    </section>

    <section class="card search">
      <el-input v-model="term" placeholder="输入歌手名搜索（例如 周杰伦）" @keyup.enter="search">
        <template #append>
          <el-button :loading="searching" @click="search">搜索</el-button>
        </template>
      </el-input>
      <div v-if="results.length" class="results">
        <div v-for="r in results" :key="r.artistId" class="res">
          <span>{{ r.name }} <em class="muted small">#{{ r.artistId }}</em></span>
          <el-button size="small" type="primary" :loading="refreshing === r.artistId" @click="refresh(r.artistId)">
            拉取 / 刷新
          </el-button>
        </div>
      </div>
    </section>

    <section class="card table-wrap">
      <h2>已缓存歌手</h2>
      <div v-if="loading" class="state muted">加载中…</div>
      <table v-else class="tbl">
        <thead>
          <tr>
            <th>歌手</th>
            <th>地区</th>
            <th>专辑数</th>
            <th>缓存状态</th>
            <th>缓存时间</th>
            <th class="op">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in list" :key="a.artistId">
            <td>{{ a.name }}</td>
            <td class="muted">{{ a.region || '—' }}</td>
            <td class="num">{{ a.albumCount }}</td>
            <td><el-tag size="small" :type="freshType(a.freshness)" effect="light">{{ freshLabel(a.freshness) }}</el-tag></td>
            <td class="muted small">{{ fmtDate(a.cachedAt) }}</td>
            <td class="op">
              <el-button text type="primary" :loading="refreshing === a.artistId" @click="refresh(a.artistId)">刷新</el-button>
            </td>
          </tr>
          <tr v-if="!list.length">
            <td colspan="6" class="muted center">暂无缓存</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi, musicApi } from '@/api';
import { fmtDate } from '@/utils/labels';

const loading = ref(true);
const list = ref([]);
const term = ref('');
const searching = ref(false);
const results = ref([]);
const refreshing = ref(null);

const FRESH = {
  fresh: { label: '新鲜', type: 'success' },
  stale: { label: '将过期', type: 'warning' },
  expired: { label: '已过期', type: 'danger' },
};
function freshLabel(f) {
  return (FRESH[f] || { label: f || '—' }).label;
}
function freshType(f) {
  return (FRESH[f] || { type: 'info' }).type;
}

async function search() {
  const t = term.value.trim();
  if (!t) return;
  searching.value = true;
  results.value = [];
  try {
    const data = await musicApi.searchArtists({ term: t, limit: 10 });
    results.value = data || [];
  } catch (err) {
    ElMessage.error(err?.message || '搜索失败');
  } finally {
    searching.value = false;
  }
}

async function refresh(artistId) {
  refreshing.value = artistId;
  try {
    const res = await adminApi.refreshMusic(artistId);
    ElMessage.success(`已拉取 ${res.albums} 张专辑`);
    await reload();
  } catch (err) {
    ElMessage.error(err?.message || '刷新失败');
  } finally {
    refreshing.value = null;
  }
}

async function reload() {
  loading.value = true;
  try {
    const data = await adminApi.listMusic({ pageSize: 100 });
    list.value = data.list || [];
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
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
.head {
  margin-bottom: var(--sp-5);
}
.head h1 {
  font-size: var(--fs-h1);
  margin-top: var(--sp-2);
}
.head .muted {
  margin-top: var(--sp-2);
  max-width: 600px;
}
.search {
  padding: var(--sp-4) var(--sp-5);
  margin-bottom: var(--sp-5);
}
.results {
  margin-top: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.res {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-2) var(--sp-3);
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}
.table-wrap {
  padding: var(--sp-4) var(--sp-5);
}
.table-wrap h2 {
  font-size: var(--fs-h2);
  margin-bottom: var(--sp-3);
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}
.tbl th,
.tbl td {
  padding: var(--sp-3) var(--sp-2);
  text-align: left;
  border-bottom: 1px solid var(--border);
}
.tbl th {
  color: var(--text-3);
  font-weight: 500;
}
.tbl .op {
  text-align: right;
}
.small {
  font-size: var(--fs-sm);
}
.center {
  text-align: center;
  padding: var(--sp-5);
}
.state {
  padding: var(--sp-5);
  text-align: center;
}
</style>
