<template>
  <div class="play">
    <!-- 加载 -->
    <div v-if="loading" class="state muted">正在加载下一步…</div>

    <!-- 全部投完 -->
    <template v-else-if="finished">
      <div class="state g-card">
        <h2>全部场次已投完</h2>
        <p class="muted">赛程已推进完毕，冠军已经决出。</p>
        <RouterLink :to="{ name: 'battle-result', params: { id } }" class="btn pri">
          看冠军与夺冠之路
        </RouterLink>
      </div>
    </template>

    <!-- ============ 小组赛 / 遗珠复活：一次多选 K 张 ============ -->
    <template v-else-if="group">
      <div class="arena-top">
        <div class="left">
          <span class="pillx">{{ groupLabel }}</span>
          <span class="meta">{{ groupHint }}</span>
        </div>
        <div class="meta2">已投 <b class="num">{{ progress.decided }} / {{ progress.total }}</b> 步</div>
      </div>
      <div class="progline"><i :style="{ width: pct + '%' }"></i></div>

      <div class="vstage">
        <div class="vglow"><i class="gl"></i><i class="gr"></i></div>

        <div class="ghead">
          <div>
            从这 <b>{{ group.albums.length }}</b> 张里，选出 <b>{{ group.advanceCount }}</b> 张晋级
          </div>
          <span class="count" :class="{ full: picked.length === group.advanceCount }">
            已选 {{ picked.length }} / {{ group.advanceCount }}
          </span>
        </div>

        <div class="pickgrid" :style="gridStyle">
          <button
            v-for="al in group.albums"
            :key="al.albumId"
            class="pickcard"
            :class="{ on: isPicked(al.albumId) }"
            type="button"
            :style="accentStyle(al)"
            @click="togglePick(al)"
          >
            <div class="art albc">
              <img :src="al.artworkUrl" :alt="al.name" loading="lazy" />
              <span class="ck">
                <svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg>
              </span>
            </div>
            <b>{{ al.name }}</b>
            <div class="ar"><i></i>{{ al.artistName }}</div>
            <div class="mt num">{{ year(al.releaseDate) }} · {{ al.trackCount }} 首</div>
          </button>
        </div>

        <div class="submitrow">
          <button
            class="btn pri"
            type="button"
            :disabled="picked.length !== group.advanceCount || submitting"
            @click="submitGroup"
          >
            {{ submitting ? '提交中…' : `确认这 ${picked.length} / ${group.advanceCount} 张晋级` }}
          </button>
          <button v-if="picked.length" class="btn ghost" type="button" @click="picked = []">
            清空重选
          </button>
        </div>
      </div>

      <p class="note">
        <b>说明：</b>小组赛每组 4 张一次性选 2 张晋级；晋级数不足 2 的幂时，落选者进遗珠复活补名额，
        之后才是 1v1 淘汰赛。
      </p>
    </template>

    <!-- ============ 淘汰赛：1v1 ============ -->
    <template v-else-if="match">
      <div class="arena-top">
        <div class="left">
          <span class="pillx">{{ koLabel }}</span>
          <span class="meta">{{ koHint }}</span>
        </div>
        <div class="meta2">已投 <b class="num">{{ progress.decided }} / {{ progress.total }}</b> 步</div>
      </div>
      <div class="progline"><i :style="{ width: pct + '%' }"></i></div>

      <div class="vstage" :data-lit="lit" :style="stageStyle">
        <div class="vglow"><i class="gl"></i><i class="gr"></i></div>
        <div class="sunlit" style="position: absolute; inset: 0; z-index: 3; pointer-events: none"></div>
        <div class="gbeam"></div>
        <span class="spark sp1"></span><span class="spark sp2"></span>
        <span class="spark sp3"></span><span class="spark sp4"></span>

        <div class="duelgrid">
          <div
            class="alb"
            data-side="l"
            :style="accentStyle(match.leftAlbum)"
            @mouseenter="lit = 'l'"
            @mouseleave="lit = 'c'"
          >
            <div class="art albc">
              <img :src="match.leftAlbum?.artworkUrl" :alt="match.leftAlbum?.name" />
            </div>
            <b>{{ match.leftAlbum?.name }}</b>
            <div class="accent"></div>
            <div class="ar"><i></i>{{ match.leftAlbum?.artistName }}</div>
            <div class="mt num">{{ year(match.leftAlbum?.releaseDate) }} · {{ match.leftAlbum?.trackCount }} 首</div>
            <div class="plays">
              <button
                class="btn tune"
                type="button"
                :disabled="!match.leftAlbum?.previewUrl"
                @click="play(match.leftAlbum)"
              >
                <svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                试听 30 秒
              </button>
            </div>
          </div>

          <div class="vs"><div class="orb">VS</div></div>

          <div
            class="alb"
            data-side="r"
            :style="accentStyle(match.rightAlbum)"
            @mouseenter="lit = 'r'"
            @mouseleave="lit = 'c'"
          >
            <div class="art albc">
              <img :src="match.rightAlbum?.artworkUrl" :alt="match.rightAlbum?.name" />
            </div>
            <b>{{ match.rightAlbum?.name }}</b>
            <div class="accent"></div>
            <div class="ar"><i></i>{{ match.rightAlbum?.artistName }}</div>
            <div class="mt num">{{ year(match.rightAlbum?.releaseDate) }} · {{ match.rightAlbum?.trackCount }} 首</div>
            <div class="plays">
              <button
                class="btn tune"
                type="button"
                :disabled="!match.rightAlbum?.previewUrl"
                @click="play(match.rightAlbum)"
              >
                <svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                试听 30 秒
              </button>
            </div>
          </div>
        </div>

        <div class="voterow">
          <button
            class="btn vote-btn"
            type="button"
            :style="voteStyle(match.leftAlbum)"
            :disabled="submitting"
            @click="vote(match.leftAlbum)"
          >
            投给《{{ match.leftAlbum?.name }}》
          </button>
          <button
            class="btn vote-btn"
            type="button"
            :style="voteStyle(match.rightAlbum)"
            :disabled="submitting"
            @click="vote(match.rightAlbum)"
          >
            投给《{{ match.rightAlbum?.name }}》
          </button>
        </div>
      </div>

      <div class="nowbar">
        <div class="a"><img :src="playerAlbumArt" alt="" /></div>
        <div class="t">
          <b>{{ curTrack ? curTrack.name : '点上面的「试听 30 秒」听片段' }}</b>
          <span v-if="curTrack">
            《{{ playerAlbumName }}》第 {{ curTrack.trackNumber }} 首 ·
            {{ fmtTime(audioTime) }} / {{ fmtTime(audioDur || 30000) }}
            <template v-if="tracks.length > 1"> · 想换一首点右边的箭头</template>
          </span>
          <span v-else>对决对象是专辑，片段只帮你听个大概，不参与计票</span>
        </div>
        <div class="wave"><i></i><i></i><i></i><i></i><i></i></div>
        <button class="trk" type="button" title="上一首" :disabled="trackIdx <= 0" @click="prevTrack">
          <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5-6v12z" /></svg>
        </button>
        <button class="pp" type="button" :title="playing ? '暂停' : '播放'" @click="togglePlay">
          <svg viewBox="0 0 24 24">
            <path v-if="playing" d="M6 5h4v14H6zM14 5h4v14h-4z" />
            <path v-else d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button class="trk" type="button" title="下一首" :disabled="trackIdx >= tracks.length - 1" @click="nextTrack">
          <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z" /></svg>
        </button>
        <span v-if="tracks.length" class="tno">{{ trackIdx + 1 }} / {{ tracks.length }}</span>
      </div>
      <audio ref="audioEl" :src="previewUrl" @ended="onEnded" @timeupdate="onTime" />
    </template>

    <!-- ============ 等待生成下一轮 ============ -->
    <template v-else>
      <div class="state g-card">
        <h2>本轮已投完</h2>
        <p class="muted">正在生成下一轮对阵……如果一直没有变化，点下面刷新。</p>
        <button class="btn pri" type="button" @click="load">刷新</button>
      </div>
    </template>

    <div v-if="!loading" class="crumb">
      <RouterLink :to="{ name: 'battle-bracket', params: { id } }">查看对阵表 →</RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { battleApi, musicApi } from '@/api';
import { ROUND_CN } from '@/utils/tournament.js';

const route = useRoute();
const id = route.params.id;

const loading = ref(true);
const submitting = ref(false);
const finished = ref(false);
const legacy = ref(false);

const group = ref(null);
const match = ref(null);
const progress = ref({ decided: 0, total: 0 });
const picked = ref([]);

// 1v1 试听（真实曲目 + 切歌）
const lit = ref('c');
const tracks = ref([]); // 当前试听专辑的曲目（只保留有 previewUrl 的）
const trackIdx = ref(0);
const previewUrl = ref('');
const playing = ref(false);
const audioTime = ref(0);
const audioDur = ref(0);
const audioEl = ref(null);
const playerAlbum = ref(null); // { albumId, name, artworkUrl }

const curTrack = computed(() => tracks.value[trackIdx.value] || null);
const playerAlbumName = computed(() => playerAlbum.value?.name || '');
const playerAlbumArt = computed(
  () => playerAlbum.value?.artworkUrl || match.value?.leftAlbum?.artworkUrl || '',
);

const fmtTime = (ms) => {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const pct = computed(() =>
  progress.value.total ? Math.round((progress.value.decided / progress.value.total) * 100) : 0,
);

const groupLabel = computed(() => {
  if (!group.value) return '';
  return group.value.roundName === 'revival' ? '遗珠复活' : `小组赛 · ${group.value.groupNo} 组`;
});
const groupHint = computed(() => {
  if (!group.value) return '';
  return group.value.roundName === 'revival'
    ? `从落选专辑里捞回 ${group.value.advanceCount} 张补足淘汰赛名额`
    : `每组 4 张一次选 ${group.value.advanceCount} 张晋级`;
});
const koLabel = computed(() => {
  if (!match.value) return '';
  return `淘汰赛 · ${ROUND_CN[match.value.roundName] || match.value.roundName}`;
});
const koHint = computed(() => '没听过？先试听 30 秒再投，片段不参与计票');
const gridStyle = computed(() => {
  const n = group.value?.albums?.length || 4;
  // 宽屏最多 5 列；minmax(0,1fr) 防止长专辑名把列撑宽（否则封面会大小不一）
  const cols = n <= 4 ? n : n <= 10 ? 5 : 6;
  return { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
});

const year = (d) => (d ? String(d).slice(0, 4) : '');

/** 专辑主色：由 albumId 稳定映射到一个色相（同一张专辑到哪都是同色） */
function accentStyle(album) {
  if (!album) return {};
  const key = String(album.albumId ?? album.name ?? '');
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return { '--ac': `hsl(${h} 70% 52%)`, '--acs': `hsla(${h}, 70%, 45%, 0.34)` };
}
const stageStyle = computed(() => ({ ...accentStyle(match.value?.leftAlbum), ...glowStyle() }));
function glowStyle() {
  const l = accentStyle(match.value?.leftAlbum)['--ac'];
  const r = accentStyle(match.value?.rightAlbum)['--ac'];
  return { '--gl': l, '--gr': r };
}
function voteStyle(album) {
  const ac = accentStyle(album)['--ac'];
  return { background: ac, color: '#fff' };
}

function isPicked(albumId) {
  return picked.value.includes(albumId);
}
function togglePick(al) {
  const idx = picked.value.indexOf(al.albumId);
  if (idx >= 0) {
    picked.value = picked.value.filter((x) => x !== al.albumId);
    return;
  }
  if (picked.value.length >= group.value.advanceCount) {
    ElMessage.info(`这一组只要选 ${group.value.advanceCount} 张，先取消一张再选`);
    return;
  }
  picked.value = [...picked.value, al.albumId];
}

async function load() {
  loading.value = true;
  previewUrl.value = '';
  playing.value = false;
  tracks.value = [];
  trackIdx.value = 0;
  playerAlbum.value = null;
  audioTime.value = 0;
  audioDur.value = 0;
  try {
    const data = await battleApi.nextStep(id);
    if (data?.legacy) {
      legacy.value = true;
      await loadLegacy();
      return;
    }
    legacy.value = false;
    finished.value = Boolean(data?.finished);
    if (data?.progress) progress.value = data.progress;
    group.value = data?.group || null;
    match.value = data?.match || null;
    picked.value = [];
    lit.value = 'c';
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function submitGroup() {
  if (picked.value.length !== group.value.advanceCount) return;
  submitting.value = true;
  try {
    const result = await battleApi.groupVote(id, group.value.groupId, picked.value);
    if (result?.invalid) ElMessage.warning(result.message);
    await load();
  } catch (err) {
    ElMessage.error(err?.message || '提交失败');
  } finally {
    submitting.value = false;
  }
}

async function vote(album) {
  if (!album) return;
  submitting.value = true;
  try {
    const result = await battleApi.vote(id, match.value.matchId, album.albumId);
    if (result?.invalid) ElMessage.warning(result.message);
    await load();
  } catch (err) {
    ElMessage.error(err?.message || '投票失败');
  } finally {
    submitting.value = false;
  }
}

/** 试听：第一次点某张专辑时按需拉曲目（后端会自动同步 iTunes 的 30 秒片段） */
async function play(album) {
  if (!album) return;
  if (playerAlbum.value?.albumId !== album.albumId) {
    try {
      const data = await musicApi.listAlbumTracks(album.albumId);
      const list = (data.list || []).filter((t) => t.previewUrl);
      if (!list.length) {
        ElMessage.info('这张专辑暂无可试听的片段');
        return;
      }
      tracks.value = list;
      trackIdx.value = 0;
      playerAlbum.value = { albumId: album.albumId, name: album.name, artworkUrl: album.artworkUrl };
    } catch (err) {
      ElMessage.error(err?.message || '试听加载失败');
      return;
    }
  }
  loadCurrent();
}

function loadCurrent() {
  const t = curTrack.value;
  if (!t) return;
  previewUrl.value = t.previewUrl;
  audioTime.value = 0;
  audioDur.value = 0;
  nextTick(() => {
    const el = audioEl.value;
    if (!el) return;
    try {
      el.currentTime = 0;
    } catch {
      /* 忽略 */
    }
    el.play?.()
      .then(() => {
        playing.value = true;
      })
      .catch(() => {});
  });
}

function nextTrack() {
  if (trackIdx.value < tracks.value.length - 1) {
    trackIdx.value += 1;
    loadCurrent();
  }
}
function prevTrack() {
  if (trackIdx.value > 0) {
    trackIdx.value -= 1;
    loadCurrent();
  }
}
function onEnded() {
  if (trackIdx.value < tracks.value.length - 1) nextTrack();
  else playing.value = false;
}
function onTime() {
  const el = audioEl.value;
  if (!el) return;
  audioTime.value = (el.currentTime || 0) * 1000;
  // 取播放器真实时长（试听片段约 30 秒），而不是整首歌的时长
  if (Number.isFinite(el.duration) && el.duration > 0) audioDur.value = el.duration * 1000;
}
function togglePlay() {
  const el = audioEl.value;
  if (!el) return;
  if (el.paused) {
    el.play?.().catch(() => {});
    playing.value = true;
  } else {
    el.pause?.();
    playing.value = false;
  }
}

// —— 旧赛制（v1）兜底：走 next-match，并归一化成同样的 1v1 结构复用模板 ——
async function loadLegacy() {
  try {
    const data = await battleApi.nextMatch(id);
    finished.value = Boolean(data?.finished);
    if (data?.progress) progress.value = data.progress;
    group.value = null;
    match.value = data?.finished
      ? null
      : {
          matchId: data.matchId,
          roundName: data.roundName,
          leftAlbum: data.left,
          rightAlbum: data.right,
        };
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  }
}

onMounted(load);
</script>

<style scoped>
.play {
  padding-bottom: var(--sp-8);
}

.crumb {
  margin-top: 22px;
  text-align: center;
  font-size: 13px;
}
.crumb a {
  color: var(--brand-deep);
}

.trk:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
.meta2 {
  font-size: 12.5px;
  color: var(--text3);
}
.meta2 b {
  color: var(--text);
}

/* 小组多选 */
.ghead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 14.5px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.ghead b {
  color: var(--brand-deep);
  font-size: 17px;
}
.count {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--brand-deep);
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(14, 165, 233, 0.24);
  padding: 3px 12px;
  border-radius: 999px;
}
.count.full {
  color: var(--brand-ink);
  background: var(--brand);
  border-color: var(--brand);
}

.pickgrid {
  display: grid;
  gap: 16px;
}

.pickcard {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  text-align: center;
  cursor: pointer;
  --ac: var(--brand);
  --acs: rgba(14, 165, 233, 0.3);
  border-radius: 14px;
  transition: transform 0.2s var(--ease-out);
}
.pickcard .art {
  position: relative;
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.28), 0 8px 24px var(--acs);
  transition: box-shadow 0.25s;
}
.pickcard .ck {
  position: absolute;
  right: 8px;
  top: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s, background 0.2s;
}
.pickcard .ck svg {
  width: 13px;
  height: 13px;
  fill: var(--brand-ink);
}
.pickcard.on .ck {
  opacity: 1;
  background: var(--ac);
}
.pickcard.on .art {
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.36), 0 12px 34px var(--acs);
}
.pickcard.on {
  transform: translateY(-4px);
}
.pickcard b {
  display: block;
  font-size: 15px;
  margin-top: 12px;
  letter-spacing: -0.3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}
.pickcard .ar {
  font-size: 12.5px;
  color: var(--ac);
  font-weight: 600;
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.pickcard .ar i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ac);
}
.pickcard .mt {
  font-size: 11.5px;
  color: var(--text2);
  margin-top: 2px;
}

.submitrow {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;
  margin-top: 22px;
  flex-wrap: wrap;
}

/* 淘汰赛 1v1 */
.duelgrid {
  display: grid;
  grid-template-columns: 1fr 96px 1fr;
  align-items: center;
  gap: 16px;
}
.voterow {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 20px;
  flex-wrap: wrap;
}
.vote-btn {
  padding: 12px 26px;
}
.vote-btn:disabled {
  opacity: 0.6;
}

@media (max-width: 860px) {
  .duelgrid {
    grid-template-columns: 1fr;
  }
  .duelgrid .vs {
    display: none;
  }
  .pickgrid {
    grid-template-columns: repeat(2, 1fr) !important;
  }
}
</style>
