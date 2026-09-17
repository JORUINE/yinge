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
      <div class="panel">
        <h4>大家投出来的专辑 Top10</h4>
        <p class="ps">按有效票数 · 与前台排行榜同口径</p>
        <ol v-if="topAlbums.length" class="ranklist">
          <li v-for="(a, i) in topAlbums" :key="a.albumId">
            <span class="no num">{{ i + 1 }}</span>
            <span class="nm">{{ a.name }}<i>{{ a.artistName || '—' }}</i></span>
            <b class="num">{{ a.votes }} 票</b>
          </li>
        </ol>
        <p v-else class="muted">还没有投票数据。</p>
      </div>

      <div class="panel">
        <h4>用户专辑倾向</h4>
        <p class="ps">有效票按歌手 / 按流派聚合 · 看大家的口味分布</p>
        <div v-if="artistAffinity.length || genreAffinity.length" class="affgrid">
          <div>
            <h5>按歌手</h5>
            <div v-for="a in artistAffinity" :key="a.artist" class="affrow">
              <span class="an">{{ a.artist || '—' }}</span>
              <div class="abar"><i :style="{ width: affH(a.votes, artistAffinity) }"></i></div>
              <b class="num">{{ a.votes }}</b>
            </div>
          </div>
          <div>
            <h5>按流派</h5>
            <div v-for="g in genreAffinity" :key="g.genre" class="affrow">
              <span class="an">{{ g.genre }}</span>
              <div class="abar"><i :style="{ width: affH(g.votes, genreAffinity) }"></i></div>
              <b class="num">{{ g.votes }}</b>
            </div>
          </div>
        </div>
        <p v-else class="muted">还没有投票数据。</p>
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

const topAlbums = computed(() => d.value.topAlbums || []);
const artistAffinity = computed(() => d.value.artistAffinity || []);
const genreAffinity = computed(() => d.value.genreAffinity || []);
function affH(v, list) {
  const max = Math.max(1, ...list.map((x) => x.votes));
  return `${Math.max(6, Math.round((v / max) * 100))}%`;
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
.ranklist {
  margin: 0;
  padding: 0;
  list-style: none;
}
.ranklist li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.ranklist li:last-child {
  border-bottom: 0;
}
.ranklist .no {
  width: 22px;
  text-align: center;
  color: var(--text3);
  font-weight: 700;
}
.ranklist .nm {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ranklist .nm i {
  font-style: normal;
  color: var(--text3);
  font-size: 12px;
  margin-left: 8px;
}
.affgrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.affgrid h5 {
  margin: 0 0 10px;
  font-size: 12.5px;
  color: var(--text3);
}
.affrow {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 40px;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.affrow .an {
  font-size: 12px;
  color: var(--text2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.abar {
  height: 8px;
  border-radius: 99px;
  background: rgba(14, 165, 233, 0.12);
  overflow: hidden;
}
.abar i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--brand);
}
@media (max-width: 860px) {
  .affgrid {
    grid-template-columns: 1fr;
  }
}
</style>
