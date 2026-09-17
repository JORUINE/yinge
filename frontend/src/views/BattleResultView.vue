<template>
  <div class="result">
    <div v-if="loading" class="state muted">正在加载结果…</div>

    <template v-else-if="data">
      <!-- 对位赛 / 指定对决：没有冠军，直接给逐行对照表（此前会误显示"还没结束"死循环） -->
      <template v-if="data.type === 'aligned'">
        <div class="hd" style="margin-top: 4px">
          <b>逐行对照表</b><span>每行一组对位 · 胜场积分制</span>
        </div>
        <div class="list">
          <div v-for="(r, i) in data.rows || []" :key="i" class="r">
            <span class="nw num">{{ r.alignIndex }}</span>
            <div class="m">
              <b>{{ r.left?.name }} <span class="muted">vs</span> {{ r.right?.name }}</b>
              <span>{{ r.left?.artistName || '—' }} / {{ r.right?.artistName || '—' }}</span>
            </div>
            <span class="v num"><b>{{ r.leftVotes ?? 0 }} : {{ r.rightVotes ?? 0 }}</b></span>
          </div>
        </div>

        <div class="hd" style="margin-top: 20px">
          <b>歌手积分</b><span>按胜场累计 · 不产生冠军</span>
        </div>
        <div class="list">
          <div v-for="(p, i) in data.points || []" :key="i" class="r">
            <div class="m"><b>{{ artistNameOf(p.artistExternalId) }}</b><span>胜 {{ p.wins }} 场</span></div>
            <span class="v num"><b>{{ p.wins }}</b></span>
          </div>
        </div>
      </template>

      <!-- 冠军 -->
      <template v-else-if="champion">
        <div class="crown-wrap">
          <div class="art"><img :src="champion.artworkUrl" :alt="champion.name" /></div>
          <div class="cinfo">
            <div class="cw">CHAMPION · 冠军</div>
            <h3>{{ champion.name }}</h3>
            <p>{{ championMeta }}</p>
            <div class="btns">
              <RouterLink :to="{ name: 'battle-share', params: { id } }" class="btn pri">
                <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M12 16V4M8 8l4-4 4 4M5 20h14" />
                </svg>
                生成夺冠之路
              </RouterLink>
              <RouterLink :to="{ name: 'battle-create' }" class="btn ghost">再玩一次</RouterLink>
            </div>
          </div>
        </div>

        <div class="kpis">
          <div class="kpi"><b>{{ kpiRounds }}</b><span>夺冠轮次</span></div>
          <div class="kpi"><b>{{ kpiMine }}</b><span>累计得票</span></div>
          <div class="kpi"><b>{{ kpiTheirs }}</b><span>对手总票数</span></div>
        </div>

        <!-- 小组赛 / 遗珠复活（v2 才有） -->
        <template v-if="groupLine">
          <div class="hd" style="margin-top: 26px">
            <b>小组赛</b><span>{{ groupLine }}</span>
          </div>
        </template>

        <div class="hd" style="margin-top: 26px">
          <b>夺冠之路</b><span>每一场：谁赢了谁，各自得了多少票</span>
        </div>

        <div class="path">
          <div v-if="!pathRows.length" class="note">这个赛制没有淘汰赛路径（对位赛 / 指定对决请看上面的对照表）。</div>
          <div v-for="(row, i) in pathRows" :key="i" class="mres" :class="{ final: row.isFinal }">
            <div class="mhd">
              <span class="rd">{{ row.roundLabel }}</span>
              <span class="say" v-if="row.opponent">
                <b>《{{ champion.name }}》</b> 战胜 <i>《{{ row.opponent.name }}》</i>
                <template v-if="row.isFinal">，拿下冠军</template>
              </span>
              <span class="say" v-else><b>《{{ champion.name }}》</b> 轮空直接晋级</span>
            </div>

            <div class="pside win">
              <div class="art"><img :src="champion.artworkUrl" :alt="champion.name" /></div>
              <div class="tx">
                <b>{{ champion.name }}</b>
                <span>{{ champion.artistName }} · {{ year(champion.releaseDate) }}</span>
              </div>
              <div class="pc" v-if="row.mine !== null">{{ row.mine }} 票</div>
              <span class="bw">胜</span>
            </div>

            <div class="pside lose" v-if="row.opponent">
              <div class="art"><img :src="row.opponent.artworkUrl" :alt="row.opponent.name" /></div>
              <div class="tx">
                <b>{{ row.opponent.name }}</b>
                <span>{{ row.opponent.artistName }} · {{ year(row.opponent.releaseDate) }}</span>
              </div>
              <div class="pc" v-if="row.theirs !== null">{{ row.theirs }} 票</div>
            </div>
          </div>
        </div>
      </template>

      <!-- 杯赛但还没打完 -->
      <template v-else>
        <div class="state g-card">
          <h2>对决还没结束</h2>
          <p class="muted">冠军还没决出来，先把剩下的场次投完。</p>
          <div class="btns">
            <RouterLink :to="{ name: 'battle-play', params: { id } }" class="btn pri">继续投票</RouterLink>
            <RouterLink :to="{ name: 'battle-bracket', params: { id } }" class="btn ghost">看对阵表</RouterLink>
          </div>
        </div>
      </template>
    </template>

    <div v-else class="state g-card">
      <h2>读不到这个对决</h2>
      <RouterLink to="/battle/mine" class="btn ghost">回我的对决</RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { battleApi } from '@/api';
import { ROUND_CN } from '@/utils/tournament.js';

const route = useRoute();
const id = route.params.id;

const loading = ref(true);
const data = ref(null);

const champion = computed(() => data.value?.champion || null);
const year = (d) => (d ? String(d).slice(0, 4) : '');

/** 对位赛的积分按歌手外部标识聚合，这里换回名字 */
const artistNameOf = (id) => {
  const hit = (data.value?.battle?.artists || []).find((a) => String(a.artistId) === String(id));
  return hit?.name || `歌手 ${id}`;
};

const championMeta = computed(() => {
  if (!champion.value) return '';
  const b = data.value?.battle || {};
  const parts = [champion.value.artistName, year(champion.value.releaseDate)].filter(Boolean);
  if (champion.value.trackCount) parts.push(`${champion.value.trackCount} 首`);
  const pool = b.poolTarget || 0;
  const artists = (b.artists || []).length;
  if (pool && artists) parts.push(`在 ${pool} 张专辑、${artists} 位歌手的混战中胜出`);
  else if (pool) parts.push(`在 ${pool} 张专辑的对决中胜出`);
  return parts.join(' · ');
});

/** 小组阶段一句话（v2） */
const groupLine = computed(() => {
  const gs = data.value?.groupsSummary || [];
  if (!gs.length || !champion.value) return '';
  const cid = champion.value.albumId;
  const hit = gs.find((g) => (g.advanced || []).some((a) => a?.albumId === cid));
  if (!hit) return '';
  return hit.roundName === 'revival'
    ? `从遗珠复活中被捞回，进入淘汰赛`
    : `第 ${hit.groupNo} 组出线（每组选 ${hit.advanceCount} 张）`;
});

/** 夺冠之路行：解析后端给的比分字符串 "我方 : 对方" */
const pathRows = computed(() => {
  const list = data.value?.path || [];
  const lastRound = list.length ? list[list.length - 1].roundName : null;
  return list.map((p) => {
    let mine = null;
    let theirs = null;
    if (p.score) {
      const parts = String(p.score).split(':').map((x) => Number(String(x).trim()));
      mine = parts[0] || 0;
      theirs = parts[1] || 0;
    }
    return {
      ...p,
      mine,
      theirs,
      isFinal: p.roundName === 'final' || p.roundName === lastRound,
      roundLabel: ROUND_CN[p.roundName] || p.roundName,
    };
  });
});

function sumVotes(idx) {
  let n = 0;
  for (const p of data.value?.path || []) {
    if (!p.score) continue;
    const parts = String(p.score).split(':').map((x) => Number(String(x).trim()));
    n += parts[idx] || 0;
  }
  return n;
}
const kpiRounds = computed(() => (data.value?.path || []).filter((p) => p.won).length);
const kpiMine = computed(() => sumVotes(0));
const kpiTheirs = computed(() => sumVotes(1));

async function load() {
  loading.value = true;
  try {
    data.value = await battleApi.result(id);
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
    data.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.result {
  padding-bottom: var(--sp-7);
}
.state {
  margin: var(--sp-8) auto;
  padding: var(--sp-6);
  max-width: 560px;
  text-align: center;
}
.btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
