<template>
  <div class="container">
    <div class="page-head">
      <p class="eyebrow">创建对决</p>
      <h1>先选一种比较方式</h1>
    </div>

    <section class="card block">
      <h3>1. 范围模式</h3>
      <el-radio-group v-model="mode">
        <el-radio-button v-for="m in MODES" :key="m.value" :value="m.value">{{ m.label }}</el-radio-button>
      </el-radio-group>
      <p class="muted hint">{{ currentMode.hint }}</p>
    </section>

    <!-- 指定对决：自己排对阵表 -->
    <template v-if="mode === 'duel'">
      <section class="card block">
        <h3>2. 排对阵表（逐组指定谁打谁）</h3>
        <div class="searchrow">
          <el-input
            v-model="duelTerm"
            placeholder="先搜歌手，再从 TA 的专辑里挑，如 陶喆 / 周杰伦"
            @keyup.enter="duelSearch"
          />
          <el-button type="primary" :loading="duelSearching" @click="duelSearch">搜索</el-button>
        </div>

        <div v-if="duelCandidates.length" class="cands">
          <button v-for="a in duelCandidates" :key="a.artistId" class="cand" type="button" @click="loadDuelAlbums(a)">
            <span class="cand-name">{{ a.name }}</span>
            <span class="muted num">加载其专辑</span>
          </button>
        </div>

        <div v-if="duelAlbums.length" class="duelbucket">
          <p class="muted small">
            {{ duelArtistName }} 的合格专辑，点两张组成一组对位（可跨歌手，先搜另一位再点）：
          </p>
          <div class="albums">
            <figure
              v-for="al in duelAlbums"
              :key="al.albumId"
              class="album"
              :class="{ chosen: isChosen(al) }"
              @click="addDuelAlbum(al)"
            >
              <img :src="al.artworkUrl" :alt="al.name" loading="lazy" />
              <figcaption>{{ al.name }}</figcaption>
            </figure>
          </div>
        </div>

        <div class="pairbar">
          <span class="muted small">当前这一组：</span>
          <span class="slot" :class="{ full: currentPair[0] }">{{ currentPair[0]?.name || '左：待选' }}</span>
          <span class="vs small">VS</span>
          <span class="slot" :class="{ full: currentPair[1] }">{{ currentPair[1]?.name || '右：待选' }}</span>
          <el-button v-if="currentPair.length" text type="info" @click="currentPair = []">清空本组</el-button>
        </div>
      </section>

      <section v-if="pairs.length" class="card block">
        <h3>对阵表（{{ pairs.length }} 组 · 共 {{ pairs.length }} 场）</h3>
        <div class="pairlist">
          <div v-for="(p, i) in pairs" :key="i" class="pairrow">
            <span class="k num">第 {{ i + 1 }} 组</span>
            <span class="nm">{{ p[0].name }}</span>
            <span class="vs small">VS</span>
            <span class="nm">{{ p[1].name }}</span>
            <el-button text type="danger" @click="removePair(i)">移除</el-button>
          </div>
        </div>
      </section>
    </template>

    <section v-if="needsArtists" class="card block">
      <h3>2. 选择歌手</h3>
      <div class="searchrow">
        <el-input
          v-model="term"
          placeholder="输入歌手名，如 周杰伦 / 陶喆"
          @keyup.enter="doSearch"
        />
        <el-button type="primary" :loading="searching" @click="doSearch">搜索</el-button>
      </div>

      <div v-if="candidates.length" class="cands">
        <button v-for="a in candidates" :key="a.artistId" class="cand" type="button" @click="addArtist(a)">
          <span class="cand-name">{{ a.name }}</span>
          <span class="muted num">#{{ a.artistId }}</span>
        </button>
      </div>

      <div v-if="picked.length" class="picked">
        <el-tag
          v-for="a in picked"
          :key="a.artistId"
          closable
          size="large"
          @close="removeArtist(a.artistId)"
        >
          {{ a.name }}
        </el-tag>
      </div>
    </section>

    <section v-if="mode === 'aligned'" class="card block">
      <h3>3. 对位张数与配对方式</h3>
      <div class="alignrow">
        <el-input-number v-model="alignCount" :min="1" :max="10" />
        <el-radio-group v-model="alignMode">
          <el-radio-button value="ordinal">同序号（第 k 张对第 k 张）</el-radio-button>
          <el-radio-button value="chrono">年代就近</el-radio-button>
        </el-radio-group>
      </div>
      <p class="muted hint">
        取各歌手专辑数的较小值；总场次 = C(歌手数, 2) × 对位张数，当前为
        <strong class="num">{{ alignedTotal }}</strong> 场
      </p>
    </section>

    <section v-if="mode === 'era'" class="card block">
      <h3>3. 年代区间</h3>
      <div class="alignrow">
        <el-input-number v-model="yearStart" :min="1900" :max="2026" :step="1" />
        <span class="muted">—</span>
        <el-input-number v-model="yearEnd" :min="1900" :max="2026" :step="1" />
        <span class="muted small">年（含首尾）</span>
      </div>
      <p class="muted hint">
        区间内命中的合格专辑会按<b>各歌手轮转取一张</b>的方式挑选，最多
        <strong class="num">32</strong> 张参赛 —— 既保证有一定规模，又不会一场打不完。
      </p>
    </section>

    <section v-if="pool" class="card block">
      <h3>参赛池预览</h3>
      <p class="muted">
        共检索到 <strong class="num">{{ pool.stats.total }}</strong> 张，剔除
        <strong class="num">{{ pool.stats.excluded }}</strong> 张，实际参赛
        <strong class="num">{{ pool.stats.valid }}</strong> 张。
      </p>

      <div v-if="pool.excluded.length" class="excluded">
        <p class="muted small">被剔除的专辑（每张都标注命中的规则）：</p>
        <ul>
          <li v-for="e in pool.excluded.slice(0, 12)" :key="e.albumId">
            {{ e.name }} <span class="tag">{{ e.reason }}</span>
          </li>
        </ul>
      </div>

      <div class="albums">
        <figure v-for="al in pool.eligible.slice(0, 24)" :key="al.albumId" class="album">
          <img :src="al.artworkUrl" :alt="al.name" loading="lazy" />
          <figcaption>{{ al.name }}</figcaption>
        </figure>
      </div>
    </section>

    <div class="submitbar">
      <el-button type="primary" size="large" :loading="creating" @click="onCreate">
        开始对决
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { musicApi, battleApi } from '@/api';

const MODES = [
  { value: 'artist', label: '单歌手', hint: '选 1 位歌手，看"他哪张最好"。' },
  { value: 'multi-artist', label: '多歌手混战', hint: '2-6 位歌手进入同一池，跨歌手比较谁更强。' },
  { value: 'genre', label: '按流派', hint: '按流派汇集已缓存歌手的专辑。' },
  { value: 'era', label: '按年代', hint: '自选年份区间，汇集区间内各歌手的专辑。' },
  { value: 'custom', label: '手动挑选', hint: '逐张选专辑，完全自定义名单。' },
  { value: 'aligned', label: '对位赛', hint: '第 1 张打第 1 张、第 2 张打第 2 张，胜场积分制。' },
  { value: 'duel', label: '指定对决', hint: '自己排对阵表：逐行指定谁打谁，每组两张直接单挑，可跨歌手与年代。' },
];

const router = useRouter();
const mode = ref('artist');
const term = ref('');
const searching = ref(false);
const creating = ref(false);
const candidates = ref([]);
const picked = ref([]);
const alignCount = ref(3);
const alignMode = ref('ordinal');
const pool = ref(null);
const genre = ref('Pop');
const yearStart = ref(2000);
const yearEnd = ref(2020);

// —— 指定对决状态 ——
const duelTerm = ref('');
const duelSearching = ref(false);
const duelCandidates = ref([]);
const duelArtistName = ref('');
const duelAlbums = ref([]);
const currentPair = ref([]);
const pairs = ref([]);

const currentMode = computed(() => MODES.find((m) => m.value === mode.value));
const needsArtists = computed(() => ['artist', 'multi-artist', 'aligned'].includes(mode.value));
const alignedTotal = computed(() => {
  const a = picked.value.length;
  return ((a * (a - 1)) / 2) * alignCount.value;
});

watch(mode, () => {
  picked.value = [];
  candidates.value = [];
  pool.value = null;
  duelCandidates.value = [];
  duelAlbums.value = [];
  duelArtistName.value = '';
  currentPair.value = [];
});

watch(picked, async (list) => {
  if (mode.value === 'artist' && list.length === 1) {
    try {
      pool.value = await musicApi.listArtistAlbums(list[0].artistId);
    } catch (err) {
      ElMessage.error(err?.message || '加载专辑失败');
    }
  } else {
    pool.value = null;
  }
});

async function doSearch() {
  if (!term.value.trim()) return;
  searching.value = true;
  try {
    const data = await musicApi.searchArtists({ term: term.value.trim(), limit: 8 });
    candidates.value = data.artists || [];
    if (!candidates.value.length) ElMessage.info('没有找到匹配的歌手');
  } catch (err) {
    ElMessage.error(err?.message || '搜索失败');
  } finally {
    searching.value = false;
  }
}

function addArtist(artist) {
  if (picked.value.some((a) => a.artistId === artist.artistId)) return;
  const max = mode.value === 'multi-artist' ? 6 : mode.value === 'aligned' ? 4 : 1;
  if (picked.value.length >= max) {
    ElMessage.warning(`该模式最多选择 ${max} 位歌手`);
    return;
  }
  if (mode.value === 'artist') picked.value = [artist];
  else picked.value = [...picked.value, artist];
}

function removeArtist(artistId) {
  picked.value = picked.value.filter((a) => a.artistId !== artistId);
}

// —— 指定对决交互 ——
async function duelSearch() {
  if (!duelTerm.value.trim()) return;
  duelSearching.value = true;
  try {
    const data = await musicApi.searchArtists({ term: duelTerm.value.trim(), limit: 8 });
    duelCandidates.value = data.artists || [];
    if (!duelCandidates.value.length) ElMessage.info('没有找到匹配的歌手');
  } catch (err) {
    ElMessage.error(err?.message || '搜索失败');
  } finally {
    duelSearching.value = false;
  }
}

async function loadDuelAlbums(artist) {
  try {
    const data = await musicApi.listArtistAlbums(artist.artistId);
    duelArtistName.value = artist.name;
    duelAlbums.value = data.eligible || [];
    if (!duelAlbums.value.length) ElMessage.info('该歌手暂无合格专辑');
  } catch (err) {
    ElMessage.error(err?.message || '加载专辑失败');
  }
}

function isChosen(al) {
  return currentPair.value.some((x) => x.albumId === al.albumId)
    || pairs.value.some((p) => p.some((x) => x.albumId === al.albumId));
}

function addDuelAlbum(al) {
  if (currentPair.value.some((x) => x.albumId === al.albumId)) return;
  currentPair.value = [...currentPair.value, al];
  if (currentPair.value.length === 2) {
    pairs.value = [...pairs.value, [...currentPair.value]];
    currentPair.value = [];
    ElMessage.success('已加入对阵表一组');
  }
}

function removePair(i) {
  pairs.value = pairs.value.filter((_, idx) => idx !== i);
}

async function onCreate() {
  const payload = { scopeType: mode.value };
  if (mode.value === 'duel') {
    if (!pairs.value.length) return ElMessage.warning('至少先排 1 组对位');
    payload.pairs = pairs.value.map((p) => [p[0].albumId, p[1].albumId]);
  } else if (mode.value === 'artist') {
    if (!picked.value.length) return ElMessage.warning('请先选择一位歌手');
    payload.artistId = picked.value[0].artistId;
  } else if (['multi-artist', 'aligned'].includes(mode.value)) {
    if (picked.value.length < 2) return ElMessage.warning('请至少选择 2 位歌手');
    payload.artists = picked.value.map((a) => ({ artistId: a.artistId }));
  } else if (mode.value === 'genre') {
    payload.genre = genre.value;
  } else if (mode.value === 'era') {
    if (yearStart.value > yearEnd.value) {
      return ElMessage.warning('起始年份不能大于结束年份');
    }
    payload.startYear = yearStart.value;
    payload.endYear = yearEnd.value;
  } else if (mode.value === 'custom') {
    return ElMessage.info('手动挑选模式待前端页面完善后开放');
  }
  if (mode.value === 'aligned') {
    payload.alignCount = alignCount.value;
    payload.alignMode = alignMode.value;
  }

  creating.value = true;
  try {
    const battle = await battleApi.create(payload);
    ElMessage.success('对决已创建');
    router.push({ name: 'battle-play', params: { id: battle.battleId } });
  } catch (err) {
    ElMessage.error(err?.message || '创建失败');
  } finally {
    creating.value = false;
  }
}
</script>

<style scoped>
.block {
  padding: var(--sp-5);
  margin-bottom: var(--sp-5);
}

.block h3 {
  margin-bottom: var(--sp-4);
}

.hint {
  margin-top: var(--sp-3);
  font-size: var(--fs-sm);
}

.searchrow {
  display: flex;
  gap: var(--sp-3);
  max-width: 520px;
}

.cands {
  margin-top: var(--sp-4);
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.cand {
  display: flex;
  gap: var(--sp-2);
  align-items: baseline;
  padding: var(--sp-2) var(--sp-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface-2);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--fs-sm);
  transition: border-color var(--dur-fast) var(--ease-out);
}

.cand:hover {
  border-color: var(--brand);
}

.cand-name {
  color: var(--text-1);
}

.picked {
  margin-top: var(--sp-4);
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.alignrow {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  flex-wrap: wrap;
}

.alignrow .hint {
  margin-top: 0;
}

.excluded {
  margin-top: var(--sp-4);
  font-size: var(--fs-sm);
}

.excluded ul {
  margin: var(--sp-2) 0 0;
  padding-left: var(--sp-5);
  color: var(--text-2);
}

.tag {
  color: var(--danger);
  font-size: var(--fs-xs);
}

.albums {
  margin-top: var(--sp-5);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--sp-4);
}

.album img {
  border-radius: var(--radius);
  aspect-ratio: 1;
  object-fit: cover;
  box-shadow: var(--shadow-1);
}

.album figcaption {
  margin-top: var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--text-2);
  line-height: 1.4;
}

/* 指定对决 */
.duelbucket {
  margin-top: var(--sp-4);
}

.small {
  font-size: var(--fs-sm);
}

.duelbucket .album {
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: var(--radius);
  padding: var(--sp-1);
  transition: border-color var(--dur-fast) var(--ease-out);
}

.duelbucket .album:hover {
  border-color: var(--brand);
}

.duelbucket .album.chosen {
  border-color: var(--brand-deep);
}

.pairbar {
  margin-top: var(--sp-5);
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.slot {
  min-width: 140px;
  padding: var(--sp-2) var(--sp-3);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--text-3);
  font-size: var(--fs-sm);
  text-align: center;
}

.slot.full {
  border-style: solid;
  border-color: var(--brand);
  color: var(--text-1);
  background: var(--surface-2);
}

.pairlist {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.pairrow {
  display: grid;
  grid-template-columns: 84px 1fr auto 1fr auto;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.pairrow .k {
  color: var(--text-3);
  font-size: var(--fs-sm);
}

.pairrow .nm {
  color: var(--text-1);
}

.vs {
  color: var(--brand);
  font-weight: 700;
}

.submitbar {
  padding-bottom: var(--sp-8);
}
</style>
