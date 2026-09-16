<template>
  <div class="container">
    <section class="head">
      <div>
        <p class="eyebrow">全球最受欢迎专辑榜</p>
        <h1>全站用脚投票出来的名次</h1>
        <p class="muted">按有效票数排序，异常票不计入统计，榜单口径对所有人一致。</p>
      </div>
      <el-select v-model="limit" size="default" style="width: 130px" @change="reload">
        <el-option label="Top 20" :value="20" />
        <el-option label="Top 50" :value="50" />
        <el-option label="Top 100" :value="100" />
      </el-select>
    </section>

    <div v-if="loading" class="state muted">加载中…</div>

    <div v-else-if="!list.length" class="state card empty">
      <p class="big">还没有投票数据</p>
      <p class="muted">去发起一场对决，每一票都会汇进这里。</p>
      <RouterLink to="/battle/create"><el-button type="primary">去创建</el-button></RouterLink>
    </div>

    <ul v-else class="board">
      <li v-for="row in list" :key="row.albumId" class="card row">
        <span class="rank" :class="rankClass(row.rank)">{{ row.rank }}</span>
        <img class="cover" :src="row.artworkUrl" :alt="row.name" />
        <div class="meta">
          <p class="name">{{ row.name }}</p>
          <p class="artist muted">{{ row.artistName || '未知歌手' }}</p>
        </div>
        <div class="votes">
          <strong class="num">{{ row.votes }}</strong>
          <span class="muted small">票</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { rankApi } from '@/api';

const loading = ref(true);
const limit = ref(20);
const list = ref([]);

function rankClass(r) {
  if (r === 1) return 'gold';
  if (r === 2) return 'silver';
  if (r === 3) return 'bronze';
  return '';
}

async function reload() {
  loading.value = true;
  try {
    const data = await rankApi.albums({ limit: limit.value });
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
  margin: var(--sp-5) auto;
}
.empty .big {
  font-size: var(--fs-h2);
  margin-bottom: var(--sp-2);
}
.empty .el-button {
  margin-top: var(--sp-4);
}
.board {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--sp-8);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.row {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  transition: transform var(--dur) var(--ease-out);
}
.row:hover {
  transform: translateX(4px);
}
.rank {
  width: 38px;
  text-align: center;
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  color: var(--text-3);
  flex-shrink: 0;
}
.rank.gold {
  color: #d4a017;
}
.rank.silver {
  color: #9aa7b2;
}
.rank.bronze {
  color: #c08552;
}
.cover {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
}
.meta {
  flex: 1;
  min-width: 0;
}
.name {
  font-size: var(--fs-h3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artist {
  font-size: var(--fs-sm);
  margin-top: 2px;
}
.votes {
  flex-shrink: 0;
  text-align: right;
}
.votes strong {
  font-size: var(--fs-h2);
  color: var(--accent);
}
.small {
  font-size: var(--fs-sm);
}
</style>
