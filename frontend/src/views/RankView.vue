<template>
  <div class="rank">
    <div class="hd" style="margin-top: 22px">
      <b class="big">最受欢迎专辑</b>
      <span>按有效票数排序 · 共 {{ total }} 张</span>
    </div>

    <div class="filter">
      <span class="lb">显示</span>
      <span
        v-for="n in [20, 50, 100]"
        :key="n"
        class="pill"
        :class="{ on: limit === n }"
        @click="setLimit(n)"
      >
        Top {{ n }}
      </span>
    </div>

    <div v-if="loading" class="state muted">加载中…</div>

    <template v-else-if="list.length">
      <!-- 前三名：领奖台 -->
      <div class="vstage recstage" :style="podiumStyle">
        <div class="vglow">
          <i class="g1"></i><i class="g2"></i><i class="g3"></i>
        </div>
        <div class="sunlit" style="position: absolute; inset: 0; z-index: 3; pointer-events: none"></div>
        <div class="gbeam"></div>
        <div class="recs">
          <div v-for="a in podium" :key="a.albumId" class="alb" :style="accentStyle(a)">
            <div class="rec-top">
              <span class="nobadge" :class="{ gold: a.rank === 1 }">NO.{{ a.rank }}</span>
              <FavoriteButton :album="a" icon-only small />
            </div>
            <div class="art albc"><img :src="a.artworkUrl" :alt="a.name" loading="lazy" /></div>
            <b>{{ a.name }}</b>
            <div class="accent"></div>
            <div class="ar"><i></i>{{ a.artistName || '—' }}</div>
            <div class="mt num">{{ year(a.releaseDate) }} · {{ a.votes }} 票</div>
          </div>
        </div>
      </div>

      <!-- 第 4 名以后 -->
      <div class="list" v-if="rest.length">
        <div v-for="a in rest" :key="a.albumId" class="r">
          <div class="nw">{{ a.rank }}</div>
          <div class="th"><img :src="a.artworkUrl" :alt="a.name" loading="lazy" /></div>
          <div class="m">
            <b>{{ a.name }}</b>
            <span>{{ a.artistName || '—' }} · {{ year(a.releaseDate) }}</span>
          </div>
          <FavoriteButton :album="a" small />
          <div class="v"><b class="num">{{ a.votes }}</b> 票</div>
        </div>
      </div>

      <p class="note">
        <b>说明：</b>前三名单独做成领奖台（唯一用金色的地方，作为冷色调里的视觉锚点）。
        榜单口径对所有人一致：<b>被判定为异常的投票不计入统计</b>。
        「地区 / 年代 / 周期」三重筛选需要后端补接口，暂未开放。
      </p>
    </template>

    <div v-else class="state g-card">
      <h2>还没有投票数据</h2>
      <p class="muted">去发起一场对决，每一票都会汇进这里。</p>
      <RouterLink to="/battle/create" class="btn pri">去创建</RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { rankApi } from '@/api';
import { accentStyleOf, ensureAlbumAccent } from '@/utils/coverColor.js';
import FavoriteButton from '@/components/FavoriteButton.vue';

const loading = ref(true);
const limit = ref(20);
const list = ref([]);
const total = ref(0);

const podium = computed(() => list.value.slice(0, 3));
const rest = computed(() => list.value.slice(3));
const year = (d) => (d ? String(d).slice(0, 4) : '');

/**
 * ⚠️ 专辑主色一律走 coverColor（读封面真色）
 * 这里以前自己写了一套 albumId 哈希色 `hsl(h 70% 52%)` —— 那是满饱和随机色，
 * 与封面毫无关系（红封面可能配出品红），正是守则第 0 节规则 ⑤ 明确禁止的做法。
 */
function accentStyle(album) {
  return accentStyleOf(album);
}
const podiumStyle = computed(() => {
  const c = (i) => accentStyleOf(podium.value[i])['--ac'] || 'var(--brand)';
  return { '--g1': c(0), '--g2': c(1), '--g3': c(2) };
});

/** 取封面真主色（异步写入 accentStore，模板会随之刷新颜色） */
function primeAccents() {
  for (const a of list.value.slice(0, 8)) ensureAlbumAccent(a).catch(() => {});
}

async function setLimit(n) {
  limit.value = n;
  await reload();
}

async function reload() {
  loading.value = true;
  try {
    const data = await rankApi.albums({ limit: limit.value });
    list.value = (data.list || []).map((r, i) => ({ ...r, rank: r.rank ?? i + 1 }));
    total.value = data.total ?? list.value.length;
    primeAccents();
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.rank {
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
.rec-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 11px;
}
.nobadge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 12px;
  border-radius: 999px;
  background: var(--glass2);
  border: 1px solid var(--gbd);
  color: var(--text2);
}
.nobadge.gold {
  background: var(--gold);
  color: #04263c;
  border-color: var(--gold);
}
@media (max-width: 860px) {
  .recs {
    grid-template-columns: 1fr;
  }
}
</style>
