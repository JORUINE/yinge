<template>
  <div class="fav">
    <div class="hd" style="margin-top: 22px">
      <b class="big">我的收藏</b>
      <span>共 {{ list.length }} 条 · 专辑与人格类型</span>
    </div>

    <div class="filter">
      <span class="lb">类型</span>
      <span
        v-for="f in FILTERS"
        :key="f.value"
        class="pill"
        :class="{ on: type === f.value }"
        @click="setType(f.value)"
      >
        {{ f.label }}
      </span>
    </div>

    <div v-if="loading" class="state muted">加载中…</div>

    <div v-else-if="!list.length" class="state g-card">
      <h2>还没有收藏</h2>
      <p class="muted">在排行榜或对决结果里点收藏，就会出现在这里。</p>
      <div class="btns">
        <RouterLink to="/rank" class="btn pri">去看榜单</RouterLink>
        <RouterLink to="/personality/types" class="btn ghost">看人格图鉴</RouterLink>
      </div>
    </div>

    <div v-else class="list">
      <div v-for="f in list" :key="f.favoriteId || f.targetId" class="r">
        <div
          v-if="f.targetType === 'album'"
          class="th"
        >
          <img :src="f.target?.artworkUrl" :alt="f.target?.name" loading="lazy" />
        </div>
        <div v-else class="th typecover" :style="{ background: typeColor(f.target?.code) }">
          {{ (f.target?.name || '?').slice(0, 1) }}
        </div>

        <div class="m">
          <b>{{ f.target?.name || '已失效' }}</b>
          <span v-if="f.targetType === 'album'">
            {{ f.target?.artistName || '—' }} · {{ year(f.target?.releaseDate) }}
            <template v-if="f.target?.trackCount"> · {{ f.target.trackCount }} 首</template>
          </span>
          <span v-else>人格类型 · {{ f.target?.code }}</span>
        </div>

        <div class="v">
          <button class="btn ghost sm" type="button" @click="remove(f)">取消收藏</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { favoriteApi } from '@/api';
import { typeColor } from '@/utils/personality.js';

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'album', label: '专辑' },
  { value: 'personality_type', label: '人格类型' },
];

const loading = ref(true);
const type = ref('all');
const list = ref([]);

const year = (d) => (d ? String(d).slice(0, 4) : '');

async function setType(v) {
  type.value = v;
  await reload();
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
    await favoriteApi.remove(f.targetId);
    list.value = list.value.filter((x) => x.targetId !== f.targetId);
    ElMessage.success('已取消收藏');
  } catch (err) {
    ElMessage.error(err?.message || '操作失败');
  }
}

onMounted(reload);
</script>

<style scoped>
.fav {
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
.btns {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.typecover {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}
</style>
