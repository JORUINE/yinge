<template>
  <div class="container">
    <section class="head">
      <div>
        <p class="eyebrow">我的收藏</p>
        <h1>你 mark 下来的好东西</h1>
        <p class="muted">收藏专辑或人格类型，随时回看。</p>
      </div>
      <el-radio-group v-model="type" @change="reload">
        <el-radio-button label="all">全部</el-radio-button>
        <el-radio-button label="album">专辑</el-radio-button>
        <el-radio-button label="personality_type">人格类型</el-radio-button>
      </el-radio-group>
    </section>

    <div v-if="loading" class="state muted">加载中…</div>

    <div v-else-if="!list.length" class="state card empty">
      <p class="big">还没有收藏</p>
      <p class="muted">在专辑榜或对决结果里，点收藏就能出现在这里。</p>
    </div>

    <div v-else class="grid">
      <article v-for="f in list" :key="f.favoriteId" class="card item">
        <img v-if="f.targetType === 'album'" class="cover" :src="f.target?.artworkUrl" :alt="f.target?.name" />
        <div v-else class="type-cover">{{ (f.target?.name || '?').slice(0, 1) }}</div>
        <div class="meta">
          <span class="kind">{{ f.targetType === 'album' ? '专辑' : '人格类型' }}</span>
          <p class="name">{{ f.target?.name || '已失效' }}</p>
          <p v-if="f.targetType === 'album'" class="muted small num">
            {{ year(f.target?.releaseDate) }} · {{ f.target?.trackCount }} 首
          </p>
          <p v-else class="muted small">代码 {{ f.target?.code }}</p>
        </div>
        <el-button text type="danger" @click="remove(f)">取消收藏</el-button>
      </article>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { favoriteApi } from '@/api';

const loading = ref(true);
const type = ref('all');
const list = ref([]);

function year(d) {
  return d ? String(d).slice(0, 4) : '';
}

async function reload() {
  loading.value = true;
  try {
    const params = { page: 1, pageSize: 100 };
    if (type.value !== 'all') params.targetType = type.value;
    const data = await favoriteApi.list(params);
    list.value = data.list || [];
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function remove(f) {
  try {
    await ElMessageBox.confirm('取消这条收藏？', '取消收藏', { type: 'warning', confirmButtonText: '取消收藏', cancelButtonText: '保留' });
  } catch {
    return;
  }
  try {
    await favoriteApi.remove(f.targetId);
    ElMessage.success('已取消收藏');
    await reload();
  } catch (err) {
    ElMessage.error(err?.message || '操作失败');
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
  margin: var(--sp-5) auto var(--sp-8);
}
.empty .big {
  font-size: var(--fs-h2);
  margin-bottom: var(--sp-2);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--sp-4);
  padding-bottom: var(--sp-8);
}
.item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
}
.cover {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
}
.type-cover {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent), #fb923c);
  color: #fff;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 24px;
  flex-shrink: 0;
}
.meta {
  flex: 1;
  min-width: 0;
}
.kind {
  font-size: var(--fs-xs);
  color: var(--brand);
  letter-spacing: 0.08em;
}
.name {
  font-size: var(--fs-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 2px 0;
}
.small {
  font-size: var(--fs-sm);
}
</style>
