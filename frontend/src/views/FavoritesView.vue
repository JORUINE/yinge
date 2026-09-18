<template>
  <div class="fav">
    <div class="hd" style="margin-top: 22px">
      <b class="big">我的收藏</b>
      <span>共 {{ list.length }} 张专辑</span>
    </div>

    <div v-if="loading" class="state muted">加载中…</div>

    <div v-else-if="!list.length" class="state g-card">
      <h2>还没有收藏</h2>
      <p class="muted">在排行榜或对决结果里点收藏，就会出现在这里。</p>
      <div class="btns">
        <RouterLink to="/rank" class="btn pri">去看榜单</RouterLink>
      </div>
    </div>

    <div v-else class="list">
      <div v-for="f in list" :key="f.favoriteId || f.targetId" class="r">
        <div class="th">
          <img :src="f.target?.artworkUrl" :alt="f.target?.name" loading="lazy" />
        </div>
        <div class="m">
          <b>{{ f.target?.name || '已失效' }}</b>
          <span>
            {{ f.target?.artistName || '—' }} · {{ year(f.target?.releaseDate) }}
            <template v-if="f.target?.trackCount"> · {{ f.target.trackCount }} 首</template>
          </span>
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
import { useFavoritesStore } from '@/stores/favorites';

const loading = ref(true);
const list = ref([]);

const year = (d) => (d ? String(d).slice(0, 4) : '');

async function reload() {
  loading.value = true;
  try {
    // 只做专辑收藏（人格类型不再提供收藏入口）
    const data = await favoriteApi.list({ page: 1, pageSize: 100, targetType: 'album' });
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
    // 同步全局收藏状态：排行榜 / 结果页的收藏按钮要立刻回到「未收藏」
    useFavoritesStore().forget(f.targetId);
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
</style>
