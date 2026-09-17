<template>
  <div class="bracket">
    <div v-if="loading" class="state muted">正在加载对阵表…</div>

    <template v-else-if="battle">
      <div class="page-head">
        <p class="eyebrow">对决 · 对阵表</p>
        <h1>{{ scopeLabel }}</h1>
      </div>

      <div class="arena-top">
        <div class="left">
          <span class="pillx">{{ phaseLabel }}</span>
          <span class="meta">
            {{ poolCount }} 张专辑 · {{ artistCount }} 位歌手 · 共 {{ battle.stepTotal || 0 }} 场 ·
            <b>已投 {{ decided }} / {{ battle.stepTotal || 0 }}</b>
          </span>
        </div>
        <RouterLink :to="{ name: 'battle-play', params: { id } }" class="btn pri sm">
          {{ isFinished ? '看结果' : '继续投票' }}
        </RouterLink>
      </div>
      <div class="progline"><i :style="{ width: pct + '%' }"></i></div>

      <!-- 小组 / 复活 -->
      <template v-if="groups.length">
        <h2 class="sec">小组赛（每 4 张一组，每组选 {{ groups[0]?.advanceCount || 2 }} 张晋级）</h2>
        <div class="groups">
          <div v-for="g in groups" :key="g.groupId" class="gcard">
            <div class="gt">
              <b>{{ g.roundName === 'revival' ? '遗珠复活' : `第 ${g.groupNo} 组` }}</b>
              <span v-if="g.roundName === 'revival'">
                从落选里捞回 {{ g.advanceCount }} 张
              </span>
              <span v-else>{{ g.picked ? '已投' : '待投' }}</span>
            </div>
            <div class="glist">
              <div
                v-for="al in g.albums"
                :key="al.albumId"
                class="grow"
                :class="{ advanced: g.advancedAlbumIds.includes(String(al.albumId)) }"
              >
                <div class="art"><img :src="al.artworkUrl" :alt="al.name" loading="lazy" /></div>
                <div class="nm">{{ al.name }}</div>
                <div class="rec">
                  <template v-if="g.advancedAlbumIds.includes(String(al.albumId))">晋级</template>
                  <template v-else-if="g.picked">未晋级</template>
                  <template v-else>—</template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 淘汰赛对阵树 -->
      <div class="tree" v-if="rounds.length">
        <div class="tt">
          {{ groups.length ? '小组赛全部结束后进入淘汰赛；' : '' }}当前进度
          <b style="color: var(--text)">{{ decided }} / {{ battle.stepTotal || 0 }}</b> 场
        </div>
        <div class="rounds" :style="{ gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr)) 220px` }">
          <div v-for="r in rounds" :key="r.name" class="rcol">
            <h5>{{ r.cn }}</h5>
            <div
              v-for="m in r.matches"
              :key="m.matchId"
              class="tie"
              :class="{ live: m.matchId === nextMatchId }"
            >
              <div class="side" :class="sideClass(m, m.leftAlbum)">
                <div class="t1"><img v-if="m.leftAlbum" :src="m.leftAlbum.artworkUrl" alt="" /></div>
                <span class="tn">{{ m.leftAlbum ? m.leftAlbum.name : '待定' }}</span>
              </div>
              <div class="mid">{{ tieMid(m) }}</div>
              <div class="side right" :class="sideClass(m, m.rightAlbum)">
                <span class="tn">{{ m.rightAlbum ? m.rightAlbum.name : '待定' }}</span>
                <div class="t2"><img v-if="m.rightAlbum" :src="m.rightAlbum.artworkUrl" alt="" /></div>
              </div>
            </div>
          </div>
          <div class="rcol">
            <h5>冠军</h5>
            <div class="tie champ">
              <template v-if="champion">
                <div class="t1 win"><img :src="champion.artworkUrl" alt="" /></div>
                <div class="tn">{{ champion.name }}</div>
              </template>
              <template v-else>
                <div class="tn" style="color: var(--text3)">等待决出</div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <p v-if="!groups.length && !rounds.length" class="note">
        这个对决还没有可展示的赛程（可能是旧赛制）。回到投票页继续即可。
      </p>

      <p class="note">
        <b>说明：</b>赛程由参赛张数一次算出 —— 每 4 张一组、每组选 2 张晋级；晋级数不足 2 的幂时，
        落选者进<b>遗珠复活</b>补齐名额，之后才是 1v1 淘汰赛。
      </p>
    </template>

    <div v-else class="state g-card">
      <h2>找不到这个对决</h2>
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

const ROUND_ORDER = ['group', 'revival', 'r32', 'r16', 'qf', 'semi', 'final', 'duel'];

const loading = ref(true);
const battle = ref(null);
const groups = ref([]);
const matches = ref([]);

const SCOPE_CN = {
  artist: '单歌手对决',
  'multi-artist': '跨歌手混战',
  genre: '按流派对决',
  era: '按年代对决',
  custom: '手动挑选对决',
  aligned: '对位赛',
  duel: '指定对决',
};

const scopeLabel = computed(() => SCOPE_CN[battle.value?.scopeType] || '对决对阵表');
const isFinished = computed(() => battle.value?.status === 'finished');
const poolCount = computed(() => battle.value?.poolTarget || groups.value.reduce((n, g) => n + g.albums.length, 0));
const artistCount = computed(() => (battle.value?.artists || []).length);

const decided = computed(() => {
  const g = groups.value.filter((x) => x.picked).length;
  const m = matches.value.filter((x) => x.isBye || x.winnerAlbumId).length;
  return g + m;
});
const pct = computed(() => {
  const total = battle.value?.stepTotal || 0;
  return total ? Math.round((decided.value / total) * 100) : 0;
});

const phaseLabel = computed(() => {
  if (isFinished.value) return '已结束';
  const ko = matches.value.filter((m) => !m.winnerAlbumId && !m.isBye);
  if (groups.value.some((g) => !g.picked)) return '小组赛进行中';
  if (ko.length) return '淘汰赛进行中';
  return '进行中';
});

/** 按轮次分组（v1/v2 通用名都在 ROUND_ORDER 里） */
const rounds = computed(() => {
  const byName = new Map();
  for (const m of matches.value) {
    if (!byName.has(m.roundName)) byName.set(m.roundName, []);
    byName.get(m.roundName).push(m);
  }
  return ROUND_ORDER.filter((n) => byName.has(n)).map((n) => ({
    name: n,
    cn: ROUND_CN[n] || n,
    matches: byName.get(n),
  }));
});

const nextMatchId = computed(() => {
  const ko = matches.value.find((m) => !m.isBye && !m.winnerAlbumId && ROUND_ORDER.indexOf(m.roundName) >= 2);
  return ko?.matchId || null;
});

const champion = computed(() => {
  const cid = battle.value?.championAlbumId;
  if (!cid) return null;
  for (const m of matches.value) {
    if (m.leftAlbum?.albumId === Number(cid)) return m.leftAlbum;
    if (m.rightAlbum?.albumId === Number(cid)) return m.rightAlbum;
  }
  for (const g of groups.value) {
    const hit = g.albums.find((a) => a.albumId === Number(cid));
    if (hit) return hit;
  }
  return null;
});

function sideClass(m, album) {
  if (!m.winnerAlbumId || !album) return {};
  const win = String(m.winnerAlbumId) === String(album.albumId);
  return win ? { win: true } : { lose: true };
}
function tieMid(m) {
  if (m.isBye) return '轮空';
  if (m.winnerAlbumId) return `${m.leftVotes ?? 0} : ${m.rightVotes ?? 0}`;
  return '待投';
}

async function load() {
  loading.value = true;
  try {
    const data = await battleApi.detail(id);
    battle.value = data;
    groups.value = data.groups || [];
    matches.value = data.matches || [];
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
    battle.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.bracket {
  padding-bottom: var(--sp-7);
}
.state {
  margin: var(--sp-8) auto;
  padding: var(--sp-6);
  max-width: 560px;
  text-align: center;
}
.left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.meta {
  font-size: 13px;
  color: var(--text2);
}
.meta b {
  color: var(--text);
}
.sec {
  font-size: 15px;
  margin: 24px 0 4px;
  color: var(--brand-deep);
}

.grow.advanced .art {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.grow.advanced .rec {
  color: var(--ok);
}
.grow .rec {
  font-size: 10.5px;
  color: var(--text3);
  font-weight: 700;
}

.tie.live {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px rgba(14, 165, 233, 0.4);
}
/* 对阵条：左专辑 | 比分 | 右专辑（三栏，长名省略，不再挤成一团） */
.tie {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.tie .side {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.tie .side.right {
  justify-content: flex-end;
}
.tie .t1,
.tie .t2 {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  overflow: hidden;
  flex: 0 0 auto;
}
.tie .t1 img,
.tie .t2 img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.tie .tn {
  font-size: 11.5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tie .mid {
  font-size: 10.5px;
  color: var(--text3);
  text-align: center;
  white-space: nowrap;
}
.tie.champ {
  grid-template-columns: 1fr;
  border-style: dashed;
}
.tie .side.win {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
  border-radius: 8px;
}
.tie .side.lose img {
  opacity: 0.35;
}

@media (max-width: 900px) {
  .rounds {
    grid-template-columns: 1fr !important;
  }
  .groups {
    grid-template-columns: 1fr;
  }
}
</style>
