<template>
  <div class="albplayer">
    <!-- 试听按钮：默认只露一个按钮，点了才出整条播放条（不占地方） -->
    <button
      v-if="!open"
      class="btn ghost sm trybtn"
      type="button"
      :disabled="loadingTracks"
      @click="start"
    >
      <svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      {{ loadingTracks ? '加载中…' : '试听 30 秒' }}
    </button>

    <div v-else class="nowbar">
      <div class="a"><img :src="playerAlbum?.artworkUrl" alt="" /></div>
      <div class="t">
        <b>{{ curTrack ? curTrack.name : '—' }}</b>
        <span>
          《{{ playerAlbum?.name }}》第 {{ curTrack?.trackNumber ?? '—' }} 首 ·
          <template v-if="curTrack?.previewUrl">
            {{ fmtTime(audioTime) }} / {{ fmtTime(audioDur || 30000) }}
          </template>
          <template v-else>这首没有试听片段</template>
        </span>
      </div>
      <button class="trk" type="button" title="上一首" :disabled="prevIdx < 0" @click="goPrev">
        <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5-6v12z" /></svg>
      </button>
      <button class="pp" type="button" :title="playing ? '暂停' : '播放'" @click="togglePlay">
        <svg viewBox="0 0 24 24">
          <path v-if="playing" d="M6 5h4v14H6zM14 5h4v14h-4z" />
          <path v-else d="M8 5v14l11-7z" />
        </svg>
      </button>
      <button class="trk" type="button" title="下一首" :disabled="nextIdx < 0" @click="goNext">
        <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z" /></svg>
      </button>
      <span v-if="tracks.length" class="tno">{{ trackIdx + 1 }} / {{ tracks.length }}</span>
    </div>

    <audio ref="audioEl" :src="previewUrl" @ended="onEnded" @timeupdate="onTime" @loadedmetadata="onMeta" />
  </div>
</template>

<script setup>
/**
 * 通用「专辑试听」组件（2026-09-21）
 * ------------------------------------------------------------
 * 用户："这里也加入试听功能和歌曲切换，就搬我们自己的之前的代码就好"
 * （指人格推荐专辑的投票页 —— 要对着一张专辑做判断，不能听等于瞎猜）。
 *
 * 逻辑来自对战页那套播放器，但做成**自包含**的：
 *   传一张专辑进来，它自己去后端拉曲目（后端会顺带同步 iTunes 的 30 秒片段）、
 *   自己管播放/暂停/上一首/下一首/进度，页面只管用。
 *
 * 三个细节保留了对战页踩过的坑：
 *   ① 曲目**全部列出**（用户要看到这张专辑到底有几首），没有片段的跳过播放、按钮置灰；
 *   ② 第一次点开才拉接口（不点不发请求，也不占版面）；
 *   ③ 30 秒片段是"听个大概"，不参与任何计票 —— 文案如实写明。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { musicApi } from '@/api';

const props = defineProps({
  /** 要试听的专辑：至少要有 albumId / name / artworkUrl */
  album: { type: Object, default: null },
});

const open = ref(false);
const loadingTracks = ref(false);
const tracks = ref([]);
const trackIdx = ref(0);
const previewUrl = ref('');
const playing = ref(false);
const audioTime = ref(0);
const audioDur = ref(0);
const audioEl = ref(null);
const playerAlbum = ref(null);

const curTrack = computed(() => tracks.value[trackIdx.value] || null);
const nextIdx = computed(() => {
  for (let i = trackIdx.value + 1; i < tracks.value.length; i += 1) {
    if (tracks.value[i].previewUrl) return i;
  }
  return -1;
});
const prevIdx = computed(() => {
  for (let i = trackIdx.value - 1; i >= 0; i -= 1) {
    if (tracks.value[i].previewUrl) return i;
  }
  return -1;
});

const fmtTime = (ms) => {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** 换专辑 → 收起播放条并停止（避免上一张的音频残留在新专辑上） */
watch(
  () => props.album?.albumId,
  () => {
    open.value = false;
    stop();
    tracks.value = [];
    trackIdx.value = 0;
    playerAlbum.value = null;
  },
);

function stop() {
  const el = audioEl.value;
  if (el) {
    try {
      el.pause();
    } catch {
      /* 忽略 */
    }
  }
  playing.value = false;
  previewUrl.value = '';
  audioTime.value = 0;
  audioDur.value = 0;
}

async function start() {
  const al = props.album;
  if (!al?.albumId) return;
  if (playerAlbum.value?.albumId === al.albumId && tracks.value.length) {
    open.value = true;
    return;
  }
  loadingTracks.value = true;
  try {
    const data = await musicApi.listAlbumTracks(al.albumId);
    const list = data.list || [];
    if (!list.length) {
      ElMessage.info('这张专辑暂无可试听的曲目');
      return;
    }
    tracks.value = list;
    const first = list.findIndex((t) => t.previewUrl);
    trackIdx.value = first < 0 ? 0 : first;
    playerAlbum.value = {
      albumId: al.albumId,
      name: al.name,
      artworkUrl: al.artworkUrl,
      trackCount: Number(data.album?.trackCount) || list.length,
    };
    open.value = true;
    if (first < 0) {
      ElMessage.info('这张专辑暂无可试听的片段');
      return;
    }
    loadCurrent();
  } catch (err) {
    ElMessage.error(err?.message || '试听加载失败');
  } finally {
    loadingTracks.value = false;
  }
}

function loadCurrent() {
  const t = curTrack.value;
  if (!t) return;
  if (!t.previewUrl) {
    previewUrl.value = '';
    playing.value = false;
    return;
  }
  previewUrl.value = t.previewUrl;
  audioTime.value = 0;
  audioDur.value = 0;
  nextTick(() => {
    const el = audioEl.value;
    if (!el) return;
    try {
      el.currentTime = 0;
    } catch {
      /* 某些浏览器在元数据就绪前不允许设 currentTime，忽略 */
    }
    el.play()
      .then(() => {
        playing.value = true;
      })
      .catch(() => {
        playing.value = false;
      });
  });
}

function togglePlay() {
  const el = audioEl.value;
  if (!el) return;
  if (playing.value) {
    el.pause();
    playing.value = false;
  } else {
    el.play()
      .then(() => {
        playing.value = true;
      })
      .catch(() => {
        playing.value = false;
      });
  }
}

function goNext() {
  if (nextIdx.value < 0) return;
  trackIdx.value = nextIdx.value;
  loadCurrent();
}
function goPrev() {
  if (prevIdx.value < 0) return;
  trackIdx.value = prevIdx.value;
  loadCurrent();
}
/** 30 秒片段播完自动跳下一首可播的 */
function onEnded() {
  if (nextIdx.value >= 0) goNext();
  else playing.value = false;
}
function onTime() {
  const el = audioEl.value;
  if (el) audioTime.value = el.currentTime * 1000;
}
function onMeta() {
  const el = audioEl.value;
  if (el && Number.isFinite(el.duration)) audioDur.value = el.duration * 1000;
}
</script>

<style scoped>
.albplayer {
  margin-top: 14px;
}
.trybtn .ico {
  width: 15px;
  height: 15px;
}
</style>
