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
        <!--
          ⚠️ 2026-09-18 换成整棵「完整晋级图」（BracketTree）。
          之前是「每轮一列 + 每列内拆成 左|比分|右 三栏」的网格，列一多每侧只剩几十 px，
          专辑名被省略成「…」——用户的原话是"扩展宽一点，这样里面专辑的字就能展现出来了"。
          树状图左浅右深、每个节点自带专辑名（最多两行），多轮次也只是变宽，不会挤掉信息。
        -->
        <BracketTree :matches="matches" :champion="champion" />
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
import BracketTree from '@/components/BracketTree.vue';

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
  font-size: 14px;
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
  font-size: 12px;
  color: var(--text3);
  font-weight: 700;
}

.tie.live {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px rgba(14, 165, 233, 0.4);
}
@media (max-width: 900px) {
  .groups {
    grid-template-columns: 1fr;
  }
}
</style>
