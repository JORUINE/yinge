<template>
  <div class="container">
    <section class="head">
      <div>
        <p class="eyebrow">我的对决</p>
        <h1>你发起过的每一场混战</h1>
        <p class="muted">继续没投完的，或回看已经打完的冠军。</p>
      </div>
      <RouterLink to="/battle/create">
        <el-button type="primary" size="large">发起新对决</el-button>
      </RouterLink>
    </section>

    <div class="filter">
      <el-radio-group v-model="status" @change="reload">
        <el-radio-button label="all">全部</el-radio-button>
        <el-radio-button label="playing">进行中</el-radio-button>
        <el-radio-button label="finished">已结束</el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="loading" class="state muted">加载中…</div>

    <div v-else-if="!list.length" class="state card empty">
      <p class="big">还没有对决</p>
      <p class="muted">挑几个歌手，让他们的专辑捉对厮杀吧。</p>
      <RouterLink to="/battle/create"><el-button type="primary">去创建</el-button></RouterLink>
    </div>

    <div v-else class="list">
      <article v-for="b in list" :key="b.battleId" class="card item">
        <div class="info">
          <div class="row1">
            <span class="scope">{{ scopeLabel(b.scopeType) }}</span>
            <el-tag :type="b.status === 'finished' ? 'success' : 'warning'" size="small" effect="light" round>
              {{ b.status === 'finished' ? '已结束' : '进行中' }}
            </el-tag>
          </div>
          <p class="artists">{{ artistNames(b) }}</p>
          <p class="meta muted num">
            {{ b.matchTotal }} 场 · {{ b.groupCount }} 组
            <template v-if="b.withRevival">· 含复活赛</template>
            · {{ fmtDate(b.createdAt) }}
          </p>
        </div>
        <div class="actions">
          <RouterLink v-if="b.status === 'playing'" :to="{ name: 'battle-play', params: { id: b.battleId } }">
            <el-button type="primary">继续投票</el-button>
          </RouterLink>
          <RouterLink :to="{ name: 'battle-result', params: { id: b.battleId } }">
            <el-button>看结果</el-button>
          </RouterLink>
          <el-button text type="danger" @click="remove(b)">删除</el-button>
        </div>
      </article>
    </div>

    <p v-if="total > list.length" class="more muted">还有 {{ total - list.length }} 场未显示，可在后台或后续版本分页查看。</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { battleApi } from '@/api';
import { scopeLabel, fmtDate } from '@/utils/labels';

const loading = ref(true);
const status = ref('all');
const list = ref([]);
const total = ref(0);

function artistNames(b) {
  const names = (b.artists || []).map((a) => a.name).filter(Boolean);
  if (names.length) return names.join(' · ');
  return scopeLabel(b.scopeType);
}

async function reload() {
  loading.value = true;
  try {
    const params = { page: 1, pageSize: 50 };
    if (status.value !== 'all') params.status = status.value;
    const data = await battleApi.listMine(params);
    list.value = data.list || [];
    total.value = data.total || 0;
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function remove(b) {
  try {
    await ElMessageBox.confirm(`确定删除「${artistNames(b)}」这场对决吗？删除后不可恢复。`, '删除对决', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await battleApi.remove(b.battleId);
    ElMessage.success('已删除');
    await reload();
  } catch (err) {
    ElMessage.error(err?.message || '删除失败');
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
.filter {
  margin-bottom: var(--sp-5);
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
.list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding-bottom: var(--sp-6);
}
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-5);
}
.row1 {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-bottom: var(--sp-2);
}
.scope {
  font-weight: 600;
  color: var(--brand-deep);
}
.artists {
  font-size: var(--fs-h3);
  margin-bottom: var(--sp-1);
}
.meta {
  font-size: var(--fs-sm);
}
.actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-shrink: 0;
}
.more {
  text-align: center;
  font-size: var(--fs-sm);
  padding-bottom: var(--sp-6);
}
@media (max-width: 720px) {
  .item {
    flex-direction: column;
    align-items: stretch;
  }
  .actions {
    justify-content: flex-end;
  }
}
</style>
