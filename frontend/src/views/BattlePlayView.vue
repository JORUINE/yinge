<template>
  <div class="container">
    <div v-if="loading && !finished" class="state muted">正在加载下一场…</div>

    <template v-else-if="finished">
      <div class="state card">
        <h2>全部场次已投完</h2>
        <p class="muted">赛程已推进完毕，结果已经生成。</p>
        <RouterLink :to="{ name: 'battle-result', params: { id } }">
          <el-button type="primary">去看逐行对照表 / 夺冠之路</el-button>
        </RouterLink>
      </div>
    </template>

    <template v-else-if="left">
      <div class="page-head">
        <p class="eyebrow">{{ roundLabel }}</p>
        <h1>二选一，投出你的那一票</h1>
        <p class="muted progress">
          进度 <strong class="num">{{ progress.decided }} / {{ progress.total }}</strong> 场
        </p>
      </div>

      <el-progress :percentage="percentage" :stroke-width="8" :show-text="false" class="bar" />

      <div class="arena">
        <button class="side card" type="button" :disabled="voting" @click="vote(left)">
          <img :src="left.artworkUrl" :alt="left.name" />
          <h3>{{ left.name }}</h3>
          <p class="muted num">{{ year(left.releaseDate) }} · {{ left.trackCount }} 首</p>
          <span class="pick">投给它</span>
        </button>

        <div class="vs num">VS</div>

        <button class="side card" type="button" :disabled="voting || !right" @click="vote(right)">
          <img :src="right?.artworkUrl" :alt="right?.name" />
          <h3>{{ right?.name }}</h3>
          <p class="muted num">{{ year(right?.releaseDate) }} · {{ right?.trackCount }} 首</p>
          <span class="pick">投给它</span>
        </button>
      </div>

      <div class="listen">
        <el-button text type="primary" :disabled="!left?.previewUrl" @click="play(left)">
          试听左侧 30 秒
        </el-button>
        <el-button text type="primary" :disabled="!right?.previewUrl" @click="play(right)">
          试听右侧 30 秒
        </el-button>
        <audio v-if="previewUrl" ref="audioEl" :src="previewUrl" controls autoplay class="audio" />
        <span v-if="!left?.previewUrl && !right?.previewUrl" class="muted small">
          本场两首均暂无可试听片段
        </span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { battleApi } from '@/api';

const route = useRoute();
const id = route.params.id;

const ROUND_LABEL = {
  group: (m) => (m.isRevival ? '复活赛' : '小组赛'),
  revival: (m) => `复活赛 · 第 ${m.roundIndex} 轮`,
  semi: () => '淘汰赛 · 半决赛',
  final: () => '淘汰赛 · 决赛',
  duel: (m) => `指定对决 · 第 ${m.roundIndex} 组`,
};

const loading = ref(true);
const voting = ref(false);
const finished = ref(false);
const matchId = ref('');
const left = ref(null);
const right = ref(null);
const roundInfo = ref({ roundName: 'group', roundIndex: 1, isRevival: false });
const progress = ref({ decided: 0, total: 0 });
const previewUrl = ref('');

const percentage = computed(() =>
  progress.value.total ? Math.round((progress.value.decided / progress.value.total) * 100) : 0,
);
const roundLabel = computed(() => {
  const fn = ROUND_LABEL[roundInfo.value.roundName] || ROUND_LABEL.group;
  return fn(roundInfo.value);
});

const year = (d) => (d ? String(d).slice(0, 4) : '');

async function loadNext() {
  loading.value = true;
  previewUrl.value = '';
  try {
    const data = await battleApi.nextMatch(id);
    finished.value = Boolean(data?.finished);
    if (data?.progress) progress.value = data.progress;
    if (!finished.value) {
      matchId.value = data.matchId;
      left.value = data.left;
      right.value = data.right;
      roundInfo.value = { roundName: data.roundName, roundIndex: data.roundIndex, isRevival: data.isRevival };
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
    const result = await battleApi.vote(id, matchId.value, album.albumId);
    if (result.invalid) ElMessage.warning(result.message);
    await loadNext();
  } catch (err) {
    ElMessage.error(err?.message || '投票失败');
  } finally {
    voting.value = false;
  }
}

function play(album) {
  if (!album?.previewUrl) return;
  previewUrl.value = album.previewUrl;
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
  gap: var(--sp-3);
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
