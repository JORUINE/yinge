<template>
  <div class="container">
    <div v-if="loading" class="state muted">正在加载下一场…</div>

    <template v-else-if="match">
      <div class="page-head">
        <p class="eyebrow">对决进行中</p>
        <h1>二选一，投出你的那一票</h1>
        <p class="muted progress">
          进度 <strong class="num">{{ progress.decided }} / {{ progress.total }}</strong> 场 ·
          共 {{ battle?.matchTotal }} 场（由赛制推导，不含复活赛）
        </p>
      </div>

      <el-progress
        :percentage="percentage"
        :stroke-width="8"
        :show-text="false"
        class="bar"
      />

      <div class="arena">
        <button class="side card" type="button" :disabled="voting" @click="vote(match.leftAlbum)">
          <img :src="match.leftAlbum.artworkUrl" :alt="match.leftAlbum.name" />
          <h3>{{ match.leftAlbum.name }}</h3>
          <p class="muted num">{{ match.leftAlbum.releaseDate?.slice(0, 4) }} · {{ match.leftAlbum.trackCount }} 首</p>
          <span class="pick">投给它</span>
        </button>

        <div class="vs num">VS</div>

        <button class="side card" type="button" :disabled="voting || !match.rightAlbum" @click="vote(match.rightAlbum)">
          <img :src="match.rightAlbum?.artworkUrl" :alt="match.rightAlbum?.name" />
          <h3>{{ match.rightAlbum?.name }}</h3>
          <p class="muted num">
            {{ match.rightAlbum?.releaseDate?.slice(0, 4) }} · {{ match.rightAlbum?.trackCount }} 首
          </p>
          <span class="pick">投给它</span>
        </button>
      </div>

      <div class="listen">
        <el-button text type="primary" @click="togglePreview">试听 30 秒</el-button>
        <audio v-if="previewUrl" ref="audioEl" :src="previewUrl" controls class="audio" />
        <span v-else class="muted small">该专辑暂无可试听片段</span>
      </div>
    </template>

    <div v-else class="state card">
      <h2>本轮已全部投完</h2>
      <p class="muted">赛程已自动推进到下一轮，或对决已结束。</p>
      <RouterLink :to="{ name: 'battle-result', params: { id } }">
        <el-button type="primary">去看结果</el-button>
      </RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { battleApi, musicApi } from '@/api';

const route = useRoute();
const router = useRouter();
const id = route.params.id;

const loading = ref(true);
const voting = ref(false);
const battle = ref(null);
const match = ref(null);
const progress = ref({ decided: 0, total: 0 });
const previewUrl = ref('');
const audioEl = ref(null);

const percentage = computed(() => {
  if (!progress.value.total) return 0;
  return Math.round((progress.value.decided / progress.value.total) * 100);
});

async function loadNext() {
  loading.value = true;
  previewUrl.value = '';
  try {
    const [detail, next] = await Promise.all([battleApi.detail(id), battleApi.nextMatch(id)]);
    battle.value = detail;
    if (!next?.match) {
      match.value = null;
    } else {
      match.value = next.match;
      progress.value = next.progress || progress.value;
    }
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function vote(album) {
  if (!album) return;
  voting.value = true;
  try {
    const result = await battleApi.vote(id, match.value.matchId, album.albumId);
    if (result.invalid) ElMessage.warning(result.message);
    else ElMessage.success('已记录');
    await loadNext();
  } catch (err) {
    ElMessage.error(err?.message || '投票失败');
  } finally {
    voting.value = false;
  }
}

async function togglePreview() {
  if (previewUrl.value) {
    previewUrl.value = '';
    return;
  }
  try {
    const albumId = match.value.leftAlbum.albumId;
    const data = await musicApi.getAlbumPreview(albumId);
    if (!data.previewUrl) {
      ElMessage.info('该专辑暂无可试听片段');
      return;
    }
    previewUrl.value = data.previewUrl;
  } catch (err) {
    ElMessage.error(err?.message || '试听加载失败');
  }
}

onMounted(loadNext);
</script>

<style scoped>
.state {
  margin: var(--sp-8) auto;
  padding: var(--sp-6);
  max-width: 520px;
  text-align: center;
}

.progress {
  font-size: var(--fs-sm);
}

.bar {
  margin-bottom: var(--sp-6);
}

.arena {
  display: grid;
  grid-template-columns: 1fr 72px 1fr;
  gap: var(--sp-5);
  align-items: center;
  padding-bottom: var(--sp-5);
}

.side {
  padding: var(--sp-5);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition: transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out);
}

.side:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: var(--shadow-2);
}

.side img {
  border-radius: var(--radius);
  aspect-ratio: 1;
  object-fit: cover;
  margin-bottom: var(--sp-4);
}

.side h3 {
  font-size: var(--fs-h2);
  margin-bottom: var(--sp-1);
}

.pick {
  display: inline-block;
  margin-top: var(--sp-4);
  color: var(--brand-deep);
  font-size: var(--fs-sm);
}

.vs {
  text-align: center;
  font-size: var(--fs-h2);
  color: var(--brand);
}

.listen {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding-bottom: var(--sp-8);
  flex-wrap: wrap;
}

.audio {
  height: 36px;
}

.small {
  font-size: var(--fs-sm);
}

@media (max-width: 760px) {
  .arena {
    grid-template-columns: 1fr;
  }
  .vs {
    display: none;
  }
}
</style>
