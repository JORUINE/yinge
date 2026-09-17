<template>
  <div class="create">
    <div class="page-head">
      <p class="eyebrow">创建对决</p>
      <h1>先选一种比较方式</h1>
      <p class="muted sub">
        多歌手混战是默认项 —— 不同歌手的专辑放在同一个池子里比，这是音格的初衷。
      </p>
    </div>

    <!-- 六种模式 -->
    <div class="modes">
      <button
        v-for="m in MODES"
        :key="m.value"
        class="mode"
        :class="{ on: mode === m.value }"
        type="button"
        @click="pickMode(m.value)"
      >
        <b>{{ m.label }}<span v-if="m.badge" class="badge">{{ m.badge }}</span></b>
        <span>{{ m.desc }}</span>
      </button>
    </div>

    <!-- 对位赛说明（仅对位赛模式展开） -->
    <div v-if="mode === 'aligned'" class="alignbox">
      <div class="ah">
        <b>对位赛长什么样</b>
        <span>选 2 至 4 位歌手 · 按发行先后逐张对位 · 胜场积分制</span>
      </div>
      <div class="arow">
        <div class="k">第 1 张</div>
        <div class="nm">David Tao · 1997</div>
        <div class="sc" style="color: var(--brand)">14 : 6</div>
        <div class="nm">Jay · 2000</div>
        <div class="wn">陶喆 胜</div>
      </div>
      <div class="arow">
        <div class="k">第 2 张</div>
        <div class="nm">I'm OK · 1999</div>
        <div class="sc" style="color: var(--text3)">9 : 11</div>
        <div class="nm">范特西 · 2001</div>
        <div class="wn">周杰伦 胜</div>
      </div>
      <div class="arow hi">
        <div class="k">第 3 张</div>
        <div class="nm">黑色柳丁 · 2002</div>
        <div class="sc" style="color: var(--brand)">12 : 8</div>
        <div class="nm">八度空間 · 2002</div>
        <div class="wn">陶喆 胜</div>
      </div>
      <div class="af">
        逐张取各自发行顺序的第 k 张，同序号互相比 —— 回答的是"两位歌手同阶段的作品谁更强"。<br />
        与混战模式的区别：混战会打乱专辑序号，首张专辑可能对上对方第五张，比较失去意义。<br />
        胜负按 <b>胜场积分</b> 统计，不用淘汰制，否则第 3 张的胜者没有第 4 张对手，赛程会断裂。
      </div>
    </div>

    <!-- 指定对决：逐组排对阵表 -->
    <template v-if="mode === 'duel'">
      <div class="block">
        <h4>排对阵表 <em>逐组指定谁打谁，可跨歌手</em></h4>
        <div class="searchrow">
          <input
            v-model="duelTerm"
            class="ipt"
            placeholder="先搜歌手，再从 TA 的专辑里挑，如 陶喆 / 周杰伦"
            @keyup.enter="duelSearch"
          />
          <button class="btn pri sm" type="button" :disabled="duelSearching" @click="duelSearch">
            {{ duelSearching ? '搜索中…' : '搜索' }}
          </button>
        </div>

        <div v-if="duelCandidates.length" class="chips" style="margin-top: 12px">
          <button
            v-for="a in duelCandidates"
            :key="a.artistId"
            class="chip"
            type="button"
            @click="loadDuelAlbums(a)"
          >
            <b>{{ a.name }}</b><i>加载其专辑</i>
          </button>
        </div>

        <template v-if="duelAlbums.length">
          <p class="hint">{{ duelArtistName }} 的合格专辑，点两张组成一组对位：</p>
          <div class="pool">
            <button
              v-for="al in duelAlbums"
              :key="al.albumId"
              class="pk"
              :class="{ off: isChosen(al) }"
              type="button"
              @click="addDuelAlbum(al)"
            >
              <div class="art">
                <img :src="al.artworkUrl" :alt="al.name" loading="lazy" />
                <span class="ck"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg></span>
              </div>
              <b>{{ al.name }}</b><span>{{ year(al.releaseDate) }}</span>
            </button>
          </div>
        </template>

        <div v-if="pairs.length" class="pairlist">
          <div v-for="(p, i) in pairs" :key="i" class="pairrow">
            <span class="k">第 {{ i + 1 }} 组</span>
            <span class="nm">{{ p[0].name }}</span>
            <span class="vs-mini">VS</span>
            <span class="nm">{{ p[1].name }}</span>
            <button class="mini-x" type="button" @click="removePair(i)">移除</button>
          </div>
        </div>
      </div>
    </template>

    <!-- 手动挑选：逐张勾专辑 -->
    <template v-else-if="mode === 'custom'">
      <div class="block">
        <h4>手动挑选 <em>至少 4 张 · 可跨歌手</em></h4>
        <div class="searchrow">
          <input
            v-model="term"
            class="ipt"
            placeholder="输入歌手名，如 周杰伦 / 陶喆"
            @keyup.enter="doSearch"
          />
          <button class="btn pri sm" type="button" :disabled="searching" @click="doSearch">
            {{ searching ? '搜索中…' : '搜索' }}
          </button>
        </div>
        <div v-if="candidates.length" class="chips" style="margin-top: 12px">
          <button
            v-for="a in candidates"
            :key="a.artistId"
            class="chip"
            type="button"
            @click="loadCustomAlbums(a)"
          >
            <b>{{ a.name }}</b><i>加载其专辑</i>
          </button>
        </div>
        <div v-if="customPool.length" class="pool">
          <button
            v-for="al in customPool"
            :key="al.albumId"
            class="pk"
            :class="{ off: !customPick.includes(al.albumId) }"
            type="button"
            @click="toggleCustom(al.albumId)"
          >
            <div class="art">
              <img :src="al.artworkUrl" :alt="al.name" loading="lazy" />
              <span class="ck"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg></span>
            </div>
            <b>{{ al.name }}</b><span>{{ year(al.releaseDate) }}</span>
          </button>
        </div>
      </div>
    </template>

    <!-- 需要选歌手的模式 -->
    <template v-else>
      <div class="block">
        <h4>
          参赛歌手
          <em>{{ artistHint }}</em>
        </h4>
        <div class="searchrow">
          <input
            v-model="term"
            class="ipt"
            placeholder="输入歌手名，如 周杰伦 / 陶喆"
            @keyup.enter="doSearch"
          />
          <button class="btn pri sm" type="button" :disabled="searching" @click="doSearch">
            {{ searching ? '搜索中…' : '搜索' }}
          </button>
        </div>

        <div v-if="candidates.length" class="chips" style="margin-top: 12px">
          <button
            v-for="a in candidates"
            :key="a.artistId"
            class="chip"
            type="button"
            @click="addArtist(a)"
          >
            <b>{{ a.name }}</b><i>加入</i>
          </button>
        </div>

        <div v-if="picked.length" class="chips" style="margin-top: 12px">
          <span v-for="a in picked" :key="a.artistId" class="chip on">
            <b>{{ a.name }}</b>
            <i v-if="cupMode">{{ scaleLabel }}</i>
            <span class="x" @click="removeArtist(a.artistId)">×</span>
          </span>
        </div>

        <p class="hint">或快速搜索：</p>
        <div class="presets">
          <button
            v-for="n in QUICK"
            :key="n"
            class="preset"
            type="button"
            @click="quickSearch(n)"
          >
            {{ n }}
          </button>
        </div>
      </div>

      <!-- v2 参赛规模（杯赛制才有：单歌手档位 / 多歌手每位张数） -->
      <div v-if="cupMode" class="block">
        <h4>
          参赛规模
          <em>{{ mode === 'artist' ? '这位歌手抽多少张进池' : '每位歌手抽多少张进池' }}</em>
        </h4>
        <div class="seg" style="margin-bottom: 12px">
          <button
            v-for="s in scaleOptions"
            :key="s"
            type="button"
            :class="{ on: currentScale === s }"
            @click="setScale(s)"
          >
            {{ s }} 张
          </button>
        </div>
        <p class="hint" v-if="plan">
          赛程：<b>{{ describePlan(plan) }}</b>。规模越大越热闹，但到 32 张封顶。
        </p>
        <p class="hint" v-else>先选歌手，才能算出赛程。</p>
      </div>

      <!-- 按流派 / 年代 子选择 -->
      <div v-if="mode === 'genre-era'" class="block">
        <h4>范围 <em>二选一</em></h4>
        <div class="seg" style="margin-bottom: 14px">
          <button type="button" :class="{ on: genreOrEra === 'genre' }" @click="genreOrEra = 'genre'">
            按流派
          </button>
          <button type="button" :class="{ on: genreOrEra === 'era' }" @click="genreOrEra = 'era'">
            按年代
          </button>
        </div>
        <div v-if="genreOrEra === 'genre'" class="searchrow">
          <input v-model="genre" class="ipt" placeholder="如 Pop / Rock / 华语流行" />
        </div>
        <div v-else class="yearrow">
          <input v-model.number="yearStart" class="ipt year" type="number" min="1900" max="2100" />
          <span class="dash">—</span>
          <input v-model.number="yearEnd" class="ipt year" type="number" min="1900" max="2100" />
          <span class="hint" style="margin: 0">年（含首尾）</span>
        </div>
        <p class="hint">流派 / 年代命中的合格专辑会自动入池，最多 32 张；赛程规模由实际入池张数决定。</p>
      </div>

      <!-- 对位赛参数 -->
      <div v-if="mode === 'aligned'" class="block">
        <h4>对位张数与配对方式</h4>
        <div class="yearrow">
          <input v-model.number="alignCount" class="ipt year" type="number" min="1" max="10" />
          <span class="hint" style="margin: 0">张/位</span>
        </div>
        <div class="seg" style="margin-top: 12px; margin-bottom: 0">
          <button type="button" :class="{ on: alignMode === 'ordinal' }" @click="alignMode = 'ordinal'">
            同序号（第 k 张对第 k 张）
          </button>
          <button type="button" :class="{ on: alignMode === 'chrono' }" @click="alignMode = 'chrono'">
            年代就近
          </button>
        </div>
        <p class="hint">
          总场次 = C(歌手数, 2) × 对位张数，当前为 <b>{{ alignedTotal }}</b> 场。对位赛不产生冠军，出的是逐张对照表。
        </p>
      </div>

      <!-- 参赛池预览（规模模式：勾选态由档位决定） -->
      <div v-if="poolPreview.length" class="block">
        <h4>
          参赛池 · 先亮出几张
          <em v-if="poolStats">
            共检索 {{ poolStats.total }} 张 · 剔除 {{ poolStats.excluded }} 张 · 本轮出战 {{ totalSelected }} 张
          </em>
        </h4>

        <div class="tipbar">
          <svg viewBox="0 0 24 24">
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5h2v2h-2V7zm0 4h2v6h-2v-6z" />
          </svg>
          <span>
            已按准入规则自动过滤：<b>单曲 / 现场与演唱会 / 影视原声 / 精选与复刻</b> 不计入正式专辑。
            <b>本轮共 {{ totalSelected }} 张出战，这里只先亮出 {{ poolPreview.length }} 张</b><template v-if="hiddenCount">，其余 {{ hiddenCount }} 张留到对决时逐张揭晓</template>
            —— 留着开盲盒的悬念。</span>
        </div>

        <div v-if="excludedList.length" class="excluded">
          <p class="hint">被剔除的专辑（每张标注命中规则）：</p>
          <ul>
            <li v-for="e in excludedList.slice(0, 10)" :key="e.albumId">
              {{ e.name }} <span class="tag">{{ e.reason }}</span>
            </li>
          </ul>
        </div>

        <div class="pool">
          <div v-for="al in poolPreview" :key="al.albumId" class="pk" :class="{ off: !al._in }">
            <div class="art">
              <img :src="al.artworkUrl" :alt="al.name" loading="lazy" />
              <span class="ck"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg></span>
            </div>
            <b>{{ al.name }}</b>
            <span>{{ al._artistName || artistName }} · {{ year(al.releaseDate) }}</span>
          </div>
          <!-- 还有更多：用一个虚位卡明示"这不是全部"，保留盲盒悬念 -->
          <div v-if="hiddenCount" class="pk more" aria-hidden="true">
            <div class="art"><span class="dots3">···</span></div>
            <b>还有 {{ hiddenCount }} 张</b>
            <span>进对决时揭晓</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 开始条 -->
    <div class="startbar">
      <span class="info" v-if="startInfo">{{ startInfo }}</span>
      <span class="info" v-else>先完成上面的选择，这里会显示规模与赛程</span>
      <button class="btn pri sp" type="button" :disabled="creating || !canStart" @click="onCreate">
        <svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        {{ creating ? '创建中…' : '开始对决' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { musicApi, battleApi } from '@/api';
import {
  SINGER_SCALES,
  PER_ARTIST_SCALES,
  DEFAULT_SINGER_SCALE,
  DEFAULT_PER_ARTIST,
  planTournament,
  describePlan,
} from '@/utils/tournament.js';

const MODES = [
  { value: 'artist', label: '单歌手', desc: '某位歌手的专辑互相比', cup: true },
  { value: 'multi-artist', label: '多歌手混战', badge: '首选', desc: '几位歌手的专辑放一起比', cup: true },
  { value: 'genre-era', label: '按流派 / 年代', desc: '如华语流行 · 2000 年代', cup: true },
  { value: 'custom', label: '手动挑选', desc: '自己勾专辑入池', cup: true },
  { value: 'aligned', label: '对位赛', badge: '逐张对照', desc: '第 1 张打第 1 张，第 2 张打第 2 张', cup: false },
  { value: 'duel', label: '指定对决', badge: '自定义', desc: '自己指定谁打谁，可跨歌手', cup: false },
];

const QUICK = ['周杰伦', '林俊杰', '陈奕迅', '陶喆'];

const router = useRouter();

const mode = ref('multi-artist');
const term = ref('');
const searching = ref(false);
const creating = ref(false);
const candidates = ref([]);
const picked = ref([]);

// 规模
const singerScale = ref(DEFAULT_SINGER_SCALE);
const perArtistScale = ref(DEFAULT_PER_ARTIST);

// 流派 / 年代
const genreOrEra = ref('genre');
const genre = ref('Pop');
const yearStart = ref(2000);
const yearEnd = ref(2020);

// 对位赛
const alignCount = ref(3);
const alignMode = ref('ordinal');

// 手动挑选
const customPool = ref([]);
const customPick = ref([]);

// 指定对决
const duelTerm = ref('');
const duelSearching = ref(false);
const duelCandidates = ref([]);
const duelArtistName = ref('');
const duelAlbums = ref([]);
const currentPair = ref([]);
const pairs = ref([]);

// 每位歌手的专辑池缓存：artistId -> { eligible, excluded, stats }
const artistPool = ref({});

const currentMode = computed(() => MODES.find((m) => m.value === mode.value) || MODES[0]);
const cupMode = computed(() => currentMode.value.cup);
const artistHint = computed(() => {
  if (mode.value === 'artist') return '选 1 位';
  if (mode.value === 'aligned') return '2 至 4 位 · 逐张对位';
  return '2 至 6 位 · 跨歌手比较';
});
const scaleOptions = computed(() => (mode.value === 'artist' ? SINGER_SCALES : PER_ARTIST_SCALES));
const currentScale = computed(() => (mode.value === 'artist' ? singerScale.value : perArtistScale.value));
const scaleLabel = computed(() => `抽 ${currentScale.value} 张`);
const alignedTotal = computed(() => {
  const a = picked.value.length;
  return ((a * (a - 1)) / 2) * alignCount.value;
});

const artistName = computed(() => picked.value[0]?.name || '');

/**
 * 参赛池预览 · 盲盒原则
 * ------------------------------------------------------------
 * 不再把"本轮出战的所有专辑"摊开——那样随机比拼的刺激感就没了。
 * 每位歌手只露前 EXPOSE_PER_ARTIST 张，其余进对决时逐张揭晓。
 */
const EXPOSE_PER_ARTIST = 2;

const poolPreview = computed(() => {
  const out = [];
  const expose = (artist, take) => {
    for (const al of take) out.push({ ...al, _artistName: artist.name, _in: true });
  };
  if (mode.value === 'artist') {
    const one = picked.value[0];
    const pool = one && artistPool.value[one.artistId];
    if (!pool) return [];
    const take = pool.eligible.slice(0, Math.min(singerScale.value, pool.eligible.length));
    expose(one, take.slice(0, EXPOSE_PER_ARTIST));
    return out;
  }
  if (mode.value === 'multi-artist') {
    for (const a of picked.value) {
      const pool = artistPool.value[a.artistId];
      if (!pool) continue;
      const take = pool.eligible.slice(0, Math.min(perArtistScale.value, pool.eligible.length));
      expose(a, take.slice(0, EXPOSE_PER_ARTIST));
    }
    return out;
  }
  return [];
});

/** 预览里没露出来的张数（其余进对决时揭晓） */
const hiddenCount = computed(() => Math.max(0, totalSelected.value - poolPreview.value.length));

/** 剔除列表（用于说明"系统替你剔了哪些"） */
const excludedList = computed(() => {
  const out = [];
  for (const a of picked.value) {
    const pool = artistPool.value[a.artistId];
    if (pool?.excluded) out.push(...pool.excluded);
  }
  return out;
});

const poolStats = computed(() => {
  let total = 0;
  let excluded = 0;
  let valid = 0;
  for (const a of picked.value) {
    const s = artistPool.value[a.artistId]?.stats;
    if (!s) continue;
    total += s.total || 0;
    excluded += s.excluded || 0;
    valid += s.valid || 0;
  }
  return total ? { total, excluded, valid } : null;
});

/** 实际参赛张数（规模模式：取每档位内可用的张数） */
const totalSelected = computed(() => {
  if (mode.value === 'artist') {
    const one = picked.value[0];
    const pool = one && artistPool.value[one.artistId];
    if (!pool) return 0;
    return Math.min(singerScale.value, pool.eligible.length);
  }
  if (mode.value === 'multi-artist') {
    if (picked.value.length < 2) return 0;
    const avail = picked.value.map((a) => {
      const pool = artistPool.value[a.artistId];
      return pool ? Math.min(perArtistScale.value, pool.eligible.length) : 0;
    });
    if (avail.some((n) => n === 0)) return 0;
    const each = Math.min(...avail); // 跨歌手取最小值（与后端一致）
    return each * picked.value.length;
  }
  if (mode.value === 'custom') return customPick.value.length;
  return 0;
});

const plan = computed(() => {
  if (!cupMode.value) return null;
  if (totalSelected.value < 2) return null;
  return planTournament(totalSelected.value);
});

const startInfo = computed(() => {
  if (mode.value === 'duel') {
    return pairs.value.length ? `已排 ${pairs.value.length} 组对位 · 共 ${pairs.value.length} 场` : '';
  }
  if (mode.value === 'aligned') {
    return picked.value.length >= 2
      ? `已选 ${picked.value.length} 位歌手 · 每位 ${alignCount.value} 张 · 共 ${alignedTotal.value} 场（胜场积分制）`
      : '';
  }
  if (mode.value === 'custom') {
    const p = planTournament(customPick.value.length);
    return customPick.value.length
      ? `已选 ${customPick.value.length} 张 · 赛程：${p ? describePlan(p) : '至少 4 张' }`
      : '';
  }
  if (mode.value === 'genre-era') {
    return genreOrEra.value === 'genre'
      ? `流派「${genre.value}」· 最多 32 张 · 赛程按实际入池张数生成`
      : `${yearStart.value}–${yearEnd.value} 年 · 最多 32 张 · 赛程按实际入池张数生成`;
  }
  if (!plan.value) return '';
  return `已选 ${totalSelected.value} 张 · 来自 ${picked.value.length} 位歌手 · 赛程：${describePlan(plan.value)}`;
});

const canStart = computed(() => {
  if (mode.value === 'duel') return pairs.value.length >= 1;
  if (mode.value === 'aligned') return picked.value.length >= 2;
  if (mode.value === 'custom') return customPick.value.length >= 4;
  if (mode.value === 'genre-era') {
    return genreOrEra.value === 'genre' ? !!genre.value.trim() : yearStart.value <= yearEnd.value;
  }
  if (mode.value === 'artist') return !!picked.value[0];
  if (mode.value === 'multi-artist') return picked.value.length >= 2;
  return false;
});

const year = (d) => (d ? String(d).slice(0, 4) : '');

async function loadArtistPool(artistId) {
  if (artistPool.value[artistId]) return artistPool.value[artistId];
  const data = await musicApi.listArtistAlbums(artistId);
  const pool = { eligible: data.eligible || [], excluded: data.excluded || [], stats: data.stats || null };
  artistPool.value = { ...artistPool.value, [artistId]: pool };
  return pool;
}

watch(picked, async (list) => {
  for (const a of list) {
    try {
      await loadArtistPool(a.artistId);
    } catch (err) {
      ElMessage.error(err?.message || '加载专辑失败');
    }
  }
}, { deep: true });

function pickMode(v) {
  mode.value = v;
  candidates.value = [];
  picked.value = [];
  customPool.value = [];
  customPick.value = [];
  duelCandidates.value = [];
  duelAlbums.value = [];
  currentPair.value = [];
  pairs.value = [];
}

function setScale(s) {
  if (mode.value === 'artist') singerScale.value = s;
  else perArtistScale.value = s;
}

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

function quickSearch(name) {
  term.value = name;
  doSearch();
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
  candidates.value = [];
  term.value = '';
}

function removeArtist(artistId) {
  picked.value = picked.value.filter((a) => a.artistId !== artistId);
}

// —— 手动挑选 ——
async function loadCustomAlbums(artist) {
  try {
    const data = await musicApi.listArtistAlbums(artist.artistId);
    const list = (data.eligible || []).map((al) => ({ ...al, _artistName: artist.name }));
    const seen = new Set(customPool.value.map((a) => a.albumId));
    customPool.value = [...customPool.value, ...list.filter((a) => !seen.has(a.albumId))];
    if (!list.length) ElMessage.info('该歌手暂无合格专辑');
  } catch (err) {
    ElMessage.error(err?.message || '加载专辑失败');
  }
}

function toggleCustom(albumId) {
  customPick.value = customPick.value.includes(albumId)
    ? customPick.value.filter((x) => x !== albumId)
    : [...customPick.value, albumId];
}

// —— 指定对决 ——
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
  return (
    currentPair.value.some((x) => x.albumId === al.albumId) ||
    pairs.value.some((p) => p.some((x) => x.albumId === al.albumId))
  );
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
  if (!canStart.value) {
    return ElMessage.warning('还差一点：请先完成上面的选择');
  }
  const payload = {};
  if (mode.value === 'duel') {
    payload.scopeType = 'duel';
    payload.pairs = pairs.value.map((p) => [p[0].albumId, p[1].albumId]);
  } else if (mode.value === 'aligned') {
    // B 线：赛制不变，不传 tournamentVersion（走旧赛制）
    payload.scopeType = 'aligned';
    payload.artists = picked.value.map((a) => ({ artistId: a.artistId }));
    payload.alignCount = alignCount.value;
    payload.alignMode = alignMode.value;
  } else if (mode.value === 'custom') {
    payload.scopeType = 'custom';
    payload.albumIds = customPick.value;
    payload.tournamentVersion = 2;
  } else if (mode.value === 'genre-era') {
    payload.tournamentVersion = 2;
    if (genreOrEra.value === 'genre') {
      payload.scopeType = 'genre';
      payload.genre = genre.value.trim();
    } else {
      payload.scopeType = 'era';
      payload.startYear = yearStart.value;
      payload.endYear = yearEnd.value;
    }
  } else if (mode.value === 'artist') {
    payload.scopeType = 'artist';
    payload.artistId = picked.value[0].artistId;
    payload.albumCount = singerScale.value;
    payload.tournamentVersion = 2;
  } else {
    payload.scopeType = 'multi-artist';
    payload.artists = picked.value.map((a) => ({ artistId: a.artistId, albumCount: perArtistScale.value }));
    payload.tournamentVersion = 2;
  }

  creating.value = true;
  try {
    const battle = await battleApi.create(payload);
    // 数字同源校验：后端算出的 stepTotal 应与前端预估一致
    if (payload.tournamentVersion === 2 && plan.value && battle.stepTotal !== plan.value.totalSteps) {
      ElMessage.warning(
        `赛程预估 ${plan.value.totalSteps} 步，实际 ${battle.stepTotal} 步（以实际为准）`,
      );
    } else {
      ElMessage.success('对决已创建');
    }
    router.push({ name: 'battle-play', params: { id: battle.battleId } });
  } catch (err) {
    ElMessage.error(err?.message || '创建失败');
  } finally {
    creating.value = false;
  }
}
</script>

<style scoped>
.create {
  padding-bottom: var(--sp-6);
}

.sub {
  margin-top: var(--sp-3);
  font-size: var(--fs-sm);
  max-width: 620px;
}

.searchrow {
  display: flex;
  gap: var(--sp-3);
  max-width: 560px;
}

.ipt {
  width: 100%;
  font: inherit;
  font-size: 14px;
  padding: 11px 14px;
  border-radius: 12px;
  border: 1px solid var(--gbd);
  background: var(--glass2);
  color: var(--text);
  outline: none;
  transition: border 0.2s;
}
.ipt:focus {
  border-color: var(--brand);
}

.hint {
  margin-top: 10px;
  font-size: var(--fs-sm);
  color: var(--text2);
}
.hint b {
  color: var(--brand-deep);
}

.chip.on {
  border-color: var(--brand);
  background: rgba(14, 165, 233, 0.12);
}

.yearrow {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
.ipt.year {
  width: 120px;
}
.dash {
  color: var(--text3);
}

.excluded {
  margin-top: var(--sp-3);
  font-size: var(--fs-sm);
}
.excluded ul {
  margin: 6px 0 0;
  padding-left: 20px;
  color: var(--text2);
}
.tag {
  color: var(--danger);
  font-size: var(--fs-xs);
}

.pairlist {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 「还有 N 张」虚位卡：模糊占位 + 省略号 + 计数，提示用户这不是全部 */
.pk.more {
  cursor: default;
}
.pk.more .art {
  display: grid;
  place-items: center;
  background: var(--glass2);
  border: 1px dashed var(--gbd);
  box-shadow: none;
  filter: blur(0.4px);
  opacity: 0.75;
}
.pk.more .dots3 {
  font-size: 30px;
  line-height: 1;
  letter-spacing: 3px;
  color: var(--text3);
}
.pk.more b,
.pk.more span {
  color: var(--text3);
}
.pairrow {
  display: grid;
  grid-template-columns: 72px 1fr auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--gbd);
  border-radius: var(--r-s);
  background: var(--glass2);
}
.pairrow .k {
  font-size: var(--fs-sm);
  color: var(--text3);
}
.pairrow .nm {
  color: var(--text);
}
.vs-mini {
  color: var(--brand);
  font-weight: 700;
}
.mini-x {
  font-size: var(--fs-sm);
  color: var(--danger);
  background: none;
  border: 0;
  cursor: pointer;
}

@media (max-width: 980px) {
  .modes {
    grid-template-columns: repeat(2, 1fr);
  }
  .pool {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 640px) {
  .modes,
  .pool {
    grid-template-columns: repeat(2, 1fr);
  }
  .pairrow {
    grid-template-columns: 1fr;
  }
}
</style>
