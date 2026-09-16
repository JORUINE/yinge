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
      <h3>3. 对位张数</h3>
      <div class="alignrow">
        <el-input-number v-model="alignCount" :min="1" :max="10" />
        <span class="muted hint">
          取各歌手专辑数的较小值；总场次 = C(歌手数, 2) × 对位张数，当前为
          <strong class="num">{{ alignedTotal }}</strong> 场
        </span>
      </div>
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
  { value: 'era', label: '按年代', hint: '按发行年代区间汇集专辑。' },
  { value: 'custom', label: '手动挑选', hint: '逐张选专辑，完全自定义名单。' },
  { value: 'aligned', label: '对位赛', hint: '第 1 张打第 1 张、第 2 张打第 2 张，胜场积分制。' },
];

const router = useRouter();
const mode = ref('artist');
const term = ref('');
const searching = ref(false);
const creating = ref(false);
const candidates = ref([]);
const picked = ref([]);
const alignCount = ref(3);
const pool = ref(null);
const genre = ref('Pop');
const yearRange = ref([2000, 2020]);

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

async function onCreate() {
  const payload = { scopeType: mode.value };
  if (mode.value === 'artist') {
    if (!picked.value.length) return ElMessage.warning('请先选择一位歌手');
    payload.artistId = picked.value[0].artistId;
  } else if (['multi-artist', 'aligned'].includes(mode.value)) {
    if (picked.value.length < 2) return ElMessage.warning('请至少选择 2 位歌手');
    payload.artists = picked.value.map((a) => ({ artistId: a.artistId }));
  } else if (mode.value === 'genre') {
    payload.genre = genre.value;
  } else if (mode.value === 'era') {
    payload.startYear = yearRange.value[0];
    payload.endYear = yearRange.value[1];
  } else if (mode.value === 'custom') {
    return ElMessage.info('手动挑选模式待前端页面完善后开放');
  }
  if (mode.value === 'aligned') payload.alignCount = alignCount.value;

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

.submitbar {
  padding-bottom: var(--sp-8);
}
</style>
