<template>
  <div class="container">
    <div v-if="loading" class="state muted">正在加载结果…</div>

    <template v-else-if="data">
      <div class="page-head">
        <p class="eyebrow">{{ scopeLabel }}</p>
        <h1>{{ isTable ? '逐行对照表' : '冠军与夺冠之路' }}</h1>
        <p v-if="!isFinished" class="muted">
          对决尚未结束，下面是当前进度。<RouterLink :to="{ name: 'battle-play', params: { id } }">继续投票 →</RouterLink>
        </p>
      </div>

      <!-- 标准赛制：冠军 + 夺冠之路 -->
      <template v-if="!isTable">
        <section v-if="data.champion" class="card champ">
          <img :src="data.champion.artworkUrl" :alt="data.champion.name" />
          <div>
            <p class="muted small">冠军专辑</p>
            <h2>{{ data.champion.name }}</h2>
            <p class="muted">{{ data.champion.artistName }} · {{ year(data.champion.releaseDate) }}</p>
          </div>
        </section>
        <section v-if="data.path && data.path.length" class="card">
          <h3>夺冠之路</h3>
          <ol class="path">
            <li v-for="(p, i) in data.path" :key="i">
              <span class="rnd">{{ roundName(p.roundName) }}</span>
              <span>战胜 <strong>{{ p.opponent?.name || '—' }}</strong></span>
              <span class="num score">{{ p.score }}</span>
            </li>
          </ol>
        </section>
      </template>

      <!-- 对位赛 / 指定对决：逐行对照表 -->
      <template v-else>
        <section class="card">
          <h3>逐行对照表（{{ data.rows.length }} 组）</h3>
          <table class="rows">
            <thead>
              <tr><th>#</th><th>左</th><th>比分</th><th>右</th><th>胜者</th></tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in data.rows" :key="i">
                <td class="num">{{ i + 1 }}</td>
                <td :class="{ win: isWinner(r, 'left') }">
                  {{ r.left?.name }}<span class="muted small"> {{ year(r.left?.releaseDate) }}</span>
                </td>
                <td class="num score">{{ r.leftVotes }} : {{ r.rightVotes }}</td>
                <td :class="{ win: isWinner(r, 'right') }">
                  {{ r.right?.name }}<span class="muted small"> {{ year(r.right?.releaseDate) }}</span>
                </td>
                <td>{{ winnerName(r) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="data.points && data.points.length > 1" class="card">
          <h3>按歌手胜场</h3>
          <div class="points">
            <span v-for="(p, i) in data.points" :key="i" class="pt">
              {{ artistName(p.artistExternalId) }} <strong class="num">{{ p.wins }}</strong> 胜
            </span>
          </div>
        </section>
      </template>

      <div class="submitbar">
        <RouterLink to="/battle/create"><el-button>再来一次</el-button></RouterLink>
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

const loading = ref(true);
const data = ref(null);

const isTable = computed(() => data.value?.type === 'aligned');
const isFinished = computed(() => data.value?.battle?.status === 'finished');
const scopeLabel = computed(() => {
  const map = {
    artist: '单歌手对决',
    'multi-artist': '多歌手混战',
    genre: '按流派对决',
    era: '按年代对决',
    custom: '手动挑选对决',
    aligned: '对位赛 · 逐张对照',
    duel: '指定对决 · 自定义对位',
  };
  return map[data.value?.battle?.scopeType] || '专辑对决';
});

const artistMap = computed(() => {
  const m = new Map();
  for (const a of data.value?.battle?.artists || []) m.set(a.artistId, a.name);
  return m;
});

const year = (d) => (d ? String(d).slice(0, 4) : '');
const roundName = (n) => ({ group: '小组赛', revival: '复活赛', semi: '半决赛', final: '决赛' }[n] || n);
const artistName = (idv) => artistMap.value.get(idv) || `歌手 ${idv}`;
const isWinner = (r, side) => r.winnerAlbumId != null && String(r[side]?.albumId) === String(r.winnerAlbumId);
const winnerName = (r) => {
  if (r.winnerAlbumId == null) return '进行中';
  if (String(r.left?.albumId) === String(r.winnerAlbumId)) return r.left?.name || '左';
  if (String(r.right?.albumId) === String(r.winnerAlbumId)) return r.right?.name || '右';
  return '—';
};

onMounted(async () => {
  try {
    data.value = await battleApi.result(id);
  } catch (err) {
    ElMessage.error(err?.message || '加载结果失败');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.state {
  margin: var(--sp-8) auto;
  padding: var(--sp-6);
  max-width: 520px;
  text-align: center;
}

.champ {
  display: flex;
  gap: var(--sp-5);
  align-items: center;
}

.champ img {
  width: 140px;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--radius);
  box-shadow: var(--shadow-2);
}

.champ h2 {
  margin: var(--sp-1) 0;
}

.path {
  margin: 0;
  padding-left: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.path li {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.rnd {
  flex: 0 0 auto;
  min-width: 72px;
  font-size: var(--fs-sm);
  color: var(--text-3);
}

.score {
  color: var(--brand-deep);
}

.rows {
  width: 100%;
  border-collapse: collapse;
}

.rows th,
.rows td {
  padding: var(--sp-3);
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-size: var(--fs-sm);
}

.rows th {
  color: var(--text-3);
  font-weight: 500;
}

.rows td.win {
  color: var(--brand-deep);
  font-weight: 700;
}

.points {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

.pt {
  padding: var(--sp-2) var(--sp-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface-2);
  font-size: var(--fs-sm);
}

.small {
  font-size: var(--fs-xs);
}

.submitbar {
  padding: var(--sp-5) 0 var(--sp-8);
}
</style>
