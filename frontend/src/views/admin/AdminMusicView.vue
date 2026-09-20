<template>
  <AdminShell>
    <div class="admhd">
      <div>
        <h3>音乐数据</h3>
        <p>
          歌手与专辑来自 iTunes Search API，本地做缓存。可按歌手名搜索并拉取，或刷新已缓存歌手
          —— 刷新会把该歌手的专辑按准入规则重算一遍。
        </p>
      </div>
      <button class="mini" type="button" :disabled="loading" @click="load">
        {{ loading ? '加载中…' : '刷新列表' }}
      </button>
    </div>

    <div class="kpi4">
      <div class="k4"><b class="num">{{ list.length }}</b><span>已缓存歌手</span></div>
      <div class="k4"><b class="num">{{ totalAlbums }}</b><span>缓存专辑数</span></div>
      <div class="k4"><b class="num">{{ staleCount }}</b><span>需要刷新</span><div class="dl">超过保鲜期</div></div>
      <div class="k4"><b class="num">{{ lastCached }}</b><span>最近缓存</span></div>
    </div>

    <div class="panel">
      <h4>按歌手名拉取 / 刷新</h4>
      <p class="ps">搜到后点「拉取」把 TA 的专辑同步进曲库（会按准入规则过滤）</p>
      <div class="searchrow">
        <input
          v-model="term"
          class="ipt"
          placeholder="输入歌手名搜索（例如 周杰伦）"
          @keyup.enter="search"
        />
        <button class="mini pri" type="button" :disabled="searching" @click="search">
          {{ searching ? '搜索中…' : '搜索' }}
        </button>
      </div>
      <div v-if="results.length" class="reslist">
        <div v-for="r in results" :key="r.artistId" class="resrow">
          <span class="rn">{{ r.name }} <em class="muted">#{{ r.artistId }}</em></span>
          <button class="mini" type="button" :disabled="refreshing === r.artistId" @click="refresh(r.artistId)">
            {{ refreshing === r.artistId ? '拉取中…' : '拉取 / 刷新' }}
          </button>
        </div>
      </div>
    </div>

    <div class="panel">
      <h4>已缓存歌手</h4>
      <p class="ps">共 {{ list.length }} 位 · 按缓存时间倒序</p>
      <div v-if="loading" class="state muted">加载中…</div>
      <table v-else class="tbl">
        <thead>
          <tr>
            <th>歌手</th>
            <th style="width:90px">地区</th>
            <th style="width:100px">专辑数</th>
            <th style="width:120px">缓存状态</th>
            <th style="width:150px">缓存时间</th>
            <th class="act" style="width:110px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in list" :key="a.artistId">
            <td>{{ a.name }}</td>
            <td class="muted">{{ a.region || '—' }}</td>
            <td class="num">{{ a.albumCount }}</td>
            <td>
              <span class="tagx" :class="freshType(a.freshness)">{{ freshLabel(a.freshness) }}</span>
            </td>
            <td class="muted">{{ fmtDate(a.cachedAt) }}</td>
            <td class="act">
              <button class="mini" type="button" :disabled="refreshing === a.artistId" @click="refresh(a.artistId)">
                {{ refreshing === a.artistId ? '刷新中…' : '刷新' }}
              </button>
            </td>
          </tr>
          <tr v-if="!list.length">
            <td colspan="6" class="muted center">暂无缓存 —— 在上面搜一位歌手拉取试试。</td>
          </tr>
        </tbody>
      </table>
    </div>
  </AdminShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import AdminShell from '@/layouts/AdminShell.vue';
import { adminApi, musicApi } from '@/api';
import { fmtDate } from '@/utils/labels';

const loading = ref(true);
const list = ref([]);
const term = ref('');
const searching = ref(false);
const results = ref([]);
const refreshing = ref(null);

const FRESH = {
  fresh: { label: '新鲜', type: 'ok' },
  stale: { label: '将过期', type: 'wn' },
  expired: { label: '已过期', type: 'er' },
};
function freshLabel(f) {
  return (FRESH[f] || { label: f || '—' }).label;
}
function freshType(f) {
  // 返回设计系统的 tagx 变体类名（以前返回的是 el-tag 的 type，换成 .tagx 后要跟着改）
  return (FRESH[f] || { type: 'tp' }).type;
}

// —— 概览（2026-09-20 统一版式时补的 KPI）——
const totalAlbums = computed(() => list.value.reduce((n, a) => n + (a.albumCount || 0), 0));
const staleCount = computed(() => list.value.filter((a) => a.freshness && a.freshness !== 'fresh').length);
const lastCached = computed(() => {
  const times = list.value.map((a) => new Date(a.cachedAt).getTime()).filter((t) => t);
  if (!times.length) return '—';
  return fmtDate(new Date(Math.max(...times)));
});

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
/* 2026-09-20 统一版式时新增：可拉取歌手的结果行 */
.reslist {
  margin-top: 14px;
  border-top: 1px dashed var(--line);
}
.resrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 2px;
  border-bottom: 1px dashed var(--line);
}
.resrow .rn {
  font-size: 14px;
}
.resrow .rn em {
  font-style: normal;
  font-size: 12.5px;
}
</style>
