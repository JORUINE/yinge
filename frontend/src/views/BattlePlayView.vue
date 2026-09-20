<template>
  <div class="play">
    <!-- 全局音频元素：小组赛试听与淘汰赛 1v1 共用（放根级，避免某阶段里 audioEl 是空导致播不出来） -->
    <audio ref="audioEl" :src="previewUrl" @ended="onEnded" @timeupdate="onTime" />

    <!-- 加载 -->
    <div v-if="loading" class="state muted">正在加载下一场…</div>

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
      <div class="playhd">
        <div class="phl">
          <span class="phstage">{{ groupLabel }}</span>
          <span class="phhint">{{ groupHint }}</span>
        </div>
        <div class="phr">
          <span class="phlab">已投</span>
          <b class="phnum num">{{ progress.decided }}<i>/{{ progress.total }}</i></b>
          <span class="phunit">场</span>
        </div>
      </div>
      <!-- 用户要求：给一次撤销机会 -->
      <div class="undobar">
        <button class="undobtn" type="button" :disabled="undoing" @click="undoStep">↩ 撤销上一步</button>
        <span class="undohint">
          选错了没关系，可以撤销上一步重选；每张卡上的「试听主打」可以听片段（不参与计票）。
        </span>
      </div>
      <div class="progline"><i :style="{ width: pct + '%' }"></i></div>

      <div class="vstage" :style="groupStageStyle">
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
            <div class="mt num">
              {{ year(al.releaseDate) }} · {{ al.trackCount }} 首
              <!-- 小组赛试听：iTunes 没有热度数据，取「专辑首支可播片段」当主打代理；不参与计票 -->
              <span
                class="qprev"
                role="button"
                tabindex="0"
                :class="{ on: previewingId === al.albumId, busy: previewLoadingId === al.albumId }"
                title="试听主打（专辑首支可播片段，不参与计票）"
                @click.stop="quickPreview(al)"
                @keydown.enter.prevent="quickPreview(al)"
                @keydown.space.prevent="quickPreview(al)"
              >
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                {{ previewingId === al.albumId ? '停止' : '试听主打' }}
              </span>
            </div>
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

      <!-- 小组赛播放条：与淘汰赛同一套（整专辑曲目 + 上一首 / 播放暂停 / 下一首 + 序号） -->
      <div v-if="playerAlbum && curTrack" class="nowbar">
        <div class="a"><img :src="playerAlbumArt" alt="" /></div>
        <div class="t">
          <b>{{ curTrack.name }}</b>
          <span>
            《{{ playerAlbumName }}》第 {{ curTrack.trackNumber }} 首 ·
            <template v-if="curTrack.previewUrl">{{ fmtTime(audioTime) }} / {{ fmtTime(audioDur || 30000) }}</template>
            <template v-else>这首没有试听片段</template>
          </span>
        </div>
        <button class="trk" type="button" title="上一首" :disabled="prevPlayable(trackIdx - 1) < 0" @click="prevTrack">
          <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5-6v12z" /></svg>
        </button>
        <button class="pp" type="button" :title="playing ? '暂停' : '播放'" @click="togglePlay">
          <svg viewBox="0 0 24 24">
            <path v-if="playing" d="M6 5h4v14H6zM14 5h4v14h-4z" />
            <path v-else d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button class="trk" type="button" title="下一首" :disabled="nextPlayable(trackIdx + 1) < 0" @click="nextTrack">
          <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z" /></svg>
        </button>
        <span v-if="tracks.length" class="tno">{{ trackIdx + 1 }} / {{ tracks.length }}</span>
      </div>

      <p class="note">
        <b>说明：</b>小组赛每组 4 张一次性选 2 张晋级；晋级数不足 2 的幂时，落选者进遗珠复活补名额，
        之后才是 1v1 淘汰赛。
      </p>
    </template>

    <!-- ============ 淘汰赛：1v1 ============ -->
    <template v-else-if="match">
      <div class="playhd">
        <div class="phl">
          <span class="phstage">{{ koLabel }}</span>
          <span class="phhint">{{ koHint }}</span>
        </div>
        <div class="phr">
          <span class="phlab">已投</span>
          <b class="phnum num">{{ progress.decided }}<i>/{{ progress.total }}</i></b>
          <span class="phunit">场</span>
        </div>
      </div>
      <!-- 用户要求：给一次撤销机会 + 明示"下面可以切歌"（默认 100% 缩放时容易看不到播放条） -->
      <div class="undobar">
        <button class="undobtn" type="button" :disabled="undoing" @click="undoStep">↩ 撤销上一步</button>
        <span class="undohint">
          选错了没关系，可以撤销上一步重选；想多听几首就点下方播放条切歌，或点「试听清单」里的任意一首。
        </span>
      </div>
      <div v-if="sameArtist" class="sib-tip">同室操戈 · 这场左右两张来自同一位歌手，内战也要分高下</div>
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
            @click="onCoverVote(match.leftAlbum)"
          >
            <div class="art albc">
              <img :src="match.leftAlbum?.artworkUrl" :alt="match.leftAlbum?.name" />
              <span class="picktag">点击投票</span>
            </div>
            <b>{{ match.leftAlbum?.name }}</b>
            <div class="accent"></div>
            <div class="ar"><i></i>{{ match.leftAlbum?.artistName }}</div>
            <div class="mt num">{{ year(match.leftAlbum?.releaseDate) }} · {{ match.leftAlbum?.trackCount }} 首</div>
            <div class="plays">
              <button class="btn tune" type="button" @click.stop="play(match.leftAlbum)">
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
            @click="onCoverVote(match.rightAlbum)"
          >
            <div class="art albc">
              <img :src="match.rightAlbum?.artworkUrl" :alt="match.rightAlbum?.name" />
              <span class="picktag">点击投票</span>
            </div>
            <b>{{ match.rightAlbum?.name }}</b>
            <div class="accent"></div>
            <div class="ar"><i></i>{{ match.rightAlbum?.artistName }}</div>
            <div class="mt num">{{ year(match.rightAlbum?.releaseDate) }} · {{ match.rightAlbum?.trackCount }} 首</div>
            <div class="plays">
              <button class="btn tune" type="button" @click.stop="play(match.rightAlbum)">
                <svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                试听 30 秒
              </button>
            </div>
          </div>
        </div>

        <div class="voterow">
          <p class="votehint">点击任意专辑封面即可投票 · 也可用下方按钮</p>
          <div class="vbtns">
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
      </div>

        <div class="nowbar">
          <div class="a"><img :src="playerAlbumArt" alt="" /></div>
          <div class="t">
            <b>{{ curTrack ? curTrack.name : '点上面的「试听 30 秒」听片段' }}</b>
            <span v-if="curTrack">
              《{{ playerAlbumName }}》第 {{ curTrack.trackNumber }} 首 ·
              <template v-if="curTrack.previewUrl">
                {{ fmtTime(audioTime) }} / {{ fmtTime(audioDur || 30000) }}
              </template>
              <template v-else>这首没有试听片段</template>
            </span>
            <span v-else>对决对象是专辑，片段只帮你听个大概，不参与计票</span>
          </div>
          <div class="wave"><i></i><i></i><i></i><i></i><i></i></div>
          <button class="trk" type="button" title="上一首" :disabled="prevPlayable(trackIdx - 1) < 0" @click="prevTrack">
            <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5-6v12z" /></svg>
          </button>
          <button class="pp" type="button" :title="playing ? '暂停' : '播放'" @click="togglePlay">
            <svg viewBox="0 0 24 24">
              <path v-if="playing" d="M6 5h4v14H6zM14 5h4v14h-4z" />
              <path v-else d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button class="trk" type="button" title="下一首" :disabled="nextPlayable(trackIdx + 1) < 0" @click="nextTrack">
            <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z" /></svg>
          </button>
          <span v-if="tracks.length" class="tno">{{ trackIdx + 1 }} / {{ tracks.length }}</span>
        </div>

        <!-- 试听清单：列出本专辑全部曲目，可播的高亮可点，不可播的标「无试听」（说明 iTunes 未提供片段） -->
        <div class="tracklist" v-if="playerAlbum">
          <div class="tl-head">
            <b>《{{ playerAlbumName }}》试听清单</b>
            <span class="tl-sub">
              专辑共 {{ playerAlbum.trackCount }} 首 · {{ playableCount }} 首有试听片段<template v-if="tracks.length < playerAlbum.trackCount">（剩余曲目 iTunes 未提供）</template><template v-else-if="playableCount < tracks.length">（其中 {{ tracks.length - playableCount }} 首无片段）</template>
            </span>
          </div>
          <div class="tl-chips">
            <button
              v-for="(t, i) in tracks"
              :key="t.trackId || i"
              class="tl-chip"
              :class="{ on: i === trackIdx, off: !t.previewUrl }"
              type="button"
              :disabled="!t.previewUrl"
              :title="t.previewUrl ? t.name : t.name + '（无试听片段）'"
              @click="jumpTo(i)"
            >
              <span class="tn">{{ t.trackNumber || i + 1 }}</span>
              <span class="nm">{{ t.name }}</span>
              <span class="tag" v-if="!t.previewUrl">无试听</span>
            </button>
          </div>
        </div>
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
import { accentStyleOf, ensureAlbumAccent, blendWithBrand, withAlpha } from '@/utils/coverColor.js';
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
/** 本专辑有试听片段的曲目数（iTunes 并非每张专辑每首都有 30 秒片段） */
const playableCount = computed(() => tracks.value.filter((t) => t.previewUrl).length);
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

/** 淘汰赛左右两张是否来自同一位歌手（"同室操戈"） */
const sameArtist = computed(
  () =>
    !!match.value?.leftAlbum?.artistName &&
    match.value.leftAlbum.artistName === match.value.rightAlbum?.artistName,
);
const gridStyle = computed(() => {
  const n = group.value?.albums?.length || 4;
  // 宽屏最多 5 列；minmax(0,1fr) 防止长专辑名把列撑宽（否则封面会大小不一）
  const cols = n <= 4 ? n : n <= 10 ? 5 : 6;
  return { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
});

const year = (d) => (d ? String(d).slice(0, 4) : '');

/** 专辑主色：优先从封面像素取（ensureAlbumAccent 会写入缓存），取不到再退回哈希色 */
function accentStyle(album) {
  return accentStyleOf(album);
}

/** 当前两张专辑的封面主色（舞台光晕 + 文字着色都跟着它走） */
async function loadAccents() {
  const pair = [
    ...(group.value?.albums || []),
    match.value?.leftAlbum,
    match.value?.rightAlbum,
  ].filter(Boolean);
  for (const al of pair) {
    // eslint-disable-next-line no-await-in-loop
    await ensureAlbumAccent(al);
  }
}

/**
 * 小组赛试听：播这张专辑的「主打」。
 * iTunes 没有热度数据 —— 取「专辑首支可播片段」作主打的代理，并如实标注，不参与计票。
 */
const previewingId = ref(null);
const previewLoadingId = ref(null);
/**
 * 小组赛试听：与淘汰赛**同一套**播放器 —— 拉整张专辑的曲目，可逐首切歌。
 * （以前只拉了一首"主打"，于是播放条永远显示 1/1、上一首/下一首 都是灰的；2026-09-18 修正）
 */
async function quickPreview(al) {
  if (!al) return;
  // 再点同一个 = 停止
  if (previewingId.value === al.albumId) {
    audioEl.value?.pause?.();
    playing.value = false;
    previewingId.value = null;
    return;
  }
  previewLoadingId.value = al.albumId;
  try {
    await play(al); // 复用淘汰赛的整专辑曲目加载 + 全局播放器
    previewingId.value = playerAlbum.value?.albumId === al.albumId ? al.albumId : null;
  } finally {
    previewLoadingId.value = null;
  }
}
const stageStyle = computed(() => ({ ...accentStyle(match.value?.leftAlbum), ...glowStyle() }));
/**
 * 小组赛 / 复活的舞台底：也从本组专辑取色（首位专辑 → 末位专辑 做左→右渐变）。
 * 设计稿里"背景跟着专辑变"在小组赛同样成立，之前这里漏了绑定 → 小组赛只能用品牌蓝、没有专辑色。
 */
const groupStageStyle = computed(() => {
  const list = (group.value?.albums || []).map((a) => accentStyle(a)['--ac']).filter(Boolean);
  const left = list[0] || '#0ea5e9';
  const right = list[list.length - 1] || left;
  return {
    '--gl': blendWithBrand(left, 0.12),
    '--gr': blendWithBrand(right, 0.12),
    '--gls': withAlpha(blendWithBrand(left, 0.22), 0.42),
    '--grs': withAlpha(blendWithBrand(right, 0.22), 0.42),
  };
});
function glowStyle() {
  const acL = accentStyle(match.value?.leftAlbum)['--ac'];
  const acR = accentStyle(match.value?.rightAlbum)['--ac'];
  // ⚠️ 光晕只往品牌蓝拉 12%：要"看得出这是这张专辑的颜色"。
  //    之前拉 30~50% 的后果是所有封面都变成同一片蓝灰 —— 等于把设计稿"跟着专辑变"抹掉了
  //    （用户原话："不能为了修复 bug 把功能整没了"）。占比门槛已经在取样层挡住了小色块劫持，
  //    这里不需要再用混色来兜底。
  return {
    '--gl': blendWithBrand(acL, 0.12),
    '--gr': blendWithBrand(acR, 0.12),
    // 渐变底：带透明度的同色，整块做"左专辑色 → 右专辑色"
    '--gls': withAlpha(blendWithBrand(acL, 0.22), 0.42),
    '--grs': withAlpha(blendWithBrand(acR, 0.22), 0.42),
  };
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
    // 封面主色是异步取的：先把哈希色渲染出来，取到真色后自动更新
    loadAccents();
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

/** 撤销上一步（后端会把由此推进出来的场次一起退回，然后重新出题） */
const undoing = ref(false);
async function undoStep() {
  if (undoing.value) return;
  undoing.value = true;
  try {
    const r = await battleApi.undo(id);
    ElMessage.success(r?.undone ? `已撤销「${r.undone}」` : '已撤销上一步');
    await load();
  } catch (err) {
    ElMessage.error(err?.message || '撤销失败');
  } finally {
    undoing.value = false;
  }
}

/** 后端业务码 3001 = 重复（这一场 / 这一组已经投过）——不是失败，直接刷新进下一步即可 */
const isAlreadyDone = (err) => err?.code === 3001;

async function submitGroup() {
  if (submitting.value) return; // 防连点：上一次提交没回来之前不再发第二次
  if (picked.value.length !== group.value.advanceCount) return;
  submitting.value = true;
  try {
    const result = await battleApi.groupVote(id, group.value.groupId, picked.value);
    if (result?.invalid) ElMessage.warning(result.message);
    await load();
  } catch (err) {
    // 已经投过这一组 → 说明上一次其实已成功（后端已推进），直接刷新，别卡死在这一屏
    if (isAlreadyDone(err)) await load();
    else ElMessage.error(err?.message || '提交失败');
  } finally {
    submitting.value = false;
  }
}

async function vote(album) {
  if (!album || submitting.value) return; // 防连点：请求飞行中忽略后续点击（点封面 / 点按钮都走这里）
  submitting.value = true;
  try {
    const result = await battleApi.vote(id, match.value.matchId, album.albumId);
    if (result?.invalid) ElMessage.warning(result.message);
    await load();
  } catch (err) {
    // 已经投过这一场 → 上一次其实已投成功（后端已推进），直接刷新到下一场，避免"投不进去又退不出来"
    if (isAlreadyDone(err)) await load();
    else ElMessage.error(err?.message || '投票失败');
  } finally {
    submitting.value = false;
  }
}

/** 点封面即投票：封面上浮提示"点击投票"，点整张卡片直接投给该专辑 */
function onCoverVote(album) {
  if (submitting.value) return;
  vote(album);
}

/** 试听：第一次点某张专辑时按需拉曲目（后端会自动同步 iTunes 的 30 秒片段） */
async function play(album) {
  if (!album) return;
  if (playerAlbum.value?.albumId !== album.albumId) {
    try {
      const data = await musicApi.listAlbumTracks(album.albumId);
      const list = data.list || [];
      if (!list.length) {
        ElMessage.info('这张专辑暂无可试听的曲目');
        return;
      }
      // 曲目**全部列出**（用户要看到这张专辑到底有几首），没有试听地址的跳过播放
      tracks.value = list;
      const first = list.findIndex((t) => t.previewUrl);
      trackIdx.value = first < 0 ? 0 : first;
      playerAlbum.value = {
        albumId: album.albumId,
        name: album.name,
        artworkUrl: album.artworkUrl,
        // 专辑在 iTunes 登记的曲目总数（可能多于我们能拉到的，用于如实说明）
        trackCount: Number(data.album?.trackCount) || list.length,
      };
      if (first < 0) {
        ElMessage.info('这张专辑暂无可试听的片段');
        return;
      }
    } catch (err) {
      ElMessage.error(err?.message || '试听加载失败');
      return;
    }
  }
  loadCurrent();
}

/** 往后找第一个可播的曲目（iTunes 有些曲目没有片段） */
function nextPlayable(from) {
  for (let i = from; i < tracks.value.length; i += 1) {
    if (tracks.value[i].previewUrl) return i;
  }
  return -1;
}
/** 往前找第一个可播的曲目 */
function prevPlayable(from) {
  for (let i = from; i >= 0; i -= 1) {
    if (tracks.value[i].previewUrl) return i;
  }
  return -1;
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
  const i = nextPlayable(trackIdx.value + 1);
  if (i >= 0) {
    trackIdx.value = i;
    loadCurrent();
  }
}
function prevTrack() {
  const i = prevPlayable(trackIdx.value - 1);
  if (i >= 0) {
    trackIdx.value = i;
    loadCurrent();
  }
}
/** 点试听清单里的某首直接跳过去（只接受有片段的） */
function jumpTo(i) {
  if (!tracks.value[i]?.previewUrl) return;
  trackIdx.value = i;
  loadCurrent();
}
function onEnded() {
  // 用户明确要求：播完不自动切下一首，点「下一首」才播
  playing.value = false;
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
    // ⚠️ 对位赛 / 指定对决是旧赛制，走的就是这条分支 —— 之前这里漏了取色，
    //    accentStore 里没有这两张专辑 → accentStyleOf 全部退回同一个"品牌蓝灰"，
    //    看上去就是"每张专辑的颜色采样全是一样的"（2026-09-19 用户报的对位赛取色 bug；
    //    默认（新赛制）模式在 load() 里调了 loadAccents 所以正常）。
    loadAccents();
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
  font-size: 14px;
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
  font-size: 14px;
  color: var(--text2);
}
.meta2 {
  font-size: 13.5px;
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
  font-size: 13.5px;
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
/* 设计语言一致性：专辑类卡片统一 hover 上浮 + 色晕加深 */
.pickcard:hover {
  transform: translateY(-6px);
}
.pickcard:hover .art {
  box-shadow: 0 26px 52px rgba(0, 0, 0, 0.4), 0 14px 40px var(--acs);
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
  font-size: 13.5px;
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
  font-size: 13px;
  color: var(--text2);
  margin-top: 2px;
}
/* 小组赛「试听主打」：卡片内的次级操作（span+role，避免在 <button> 里嵌 <button>） */
.qprev {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--brand-deep);
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(14, 165, 233, 0.3);
  cursor: pointer;
  user-select: none;
  vertical-align: middle;
  transition: all 0.2s;
}
.qprev svg {
  width: 10px;
  height: 10px;
  fill: currentColor;
}
.qprev:hover,
.qprev:focus-visible {
  background: rgba(14, 165, 233, 0.2);
  border-color: var(--brand);
  outline: none;
}
.qprev.on {
  color: #04263c;
  background: var(--brand);
  border-color: var(--brand);
}
.qprev.busy {
  opacity: 0.6;
  pointer-events: none;
}

.submitrow {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;
  margin-top: 22px;
  flex-wrap: wrap;
}

/* 淘汰赛 1v1：限制专辑卡宽度，保证"专辑 + 试听 + 投票"一屏放得下 */
.duelgrid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr);
  align-items: center;
  gap: 16px;
}
.duelgrid .alb {
  width: 100%;
  max-width: 330px;
  margin: 0 auto;
  cursor: pointer;
  position: relative;
  transition: transform 0.2s var(--ease-out);
}
.duelgrid .alb:hover {
  transform: translateY(-5px);
}
.duelgrid .alb .art.albc {
  position: relative;
}
/* 「点亮这一张」：悬浮的那张封面加一圈**专辑色描边** + 提亮，另一张略微压暗 ——
   只靠大光晕变化，感观上不够明确（用户："点亮这一张的感觉 目前版本根本没体现出来"）。 */
.duelgrid .alb .art {
  transition: box-shadow 0.28s var(--ease-out), filter 0.28s var(--ease-out), opacity 0.28s var(--ease-out);
}
.vstage[data-lit='l'] .duelgrid .alb[data-side='l'] .art,
.vstage[data-lit='r'] .duelgrid .alb[data-side='r'] .art {
  box-shadow: 0 30px 58px rgba(0, 0, 0, 0.42), 0 0 0 2px var(--ac), 0 18px 46px var(--acs);
  filter: saturate(1.08) brightness(1.05);
}
.vstage[data-lit='l'] .duelgrid .alb[data-side='r'] .art,
.vstage[data-lit='r'] .duelgrid .alb[data-side='l'] .art {
  opacity: 0.82;
  filter: saturate(0.9) brightness(0.97);
}
.duelgrid .alb .picktag {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #fff;
  background: rgba(8, 22, 38, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.4);
  padding: 4px 13px;
  border-radius: 999px;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
  white-space: nowrap;
}
.duelgrid .alb:hover .picktag {
  opacity: 1;
}
.voterow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 20px;
}
.votehint {
  margin: 0;
  font-size: 13px;
  color: var(--text3);
  text-align: center;
}
/* 撤销条 + 切歌提示（用户："给用户撤销的机会" + "默认 100% 缩放时注意不到下面能切歌"） */
.undobar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 10px 0 6px;
}
.undobtn {
  flex: 0 0 auto;
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--brand-deep);
  background: var(--glass2);
  border: 1px solid var(--gbd);
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
  transition: background 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
}
.undobtn:hover:not(:disabled) {
  border-color: var(--brand);
  background: rgba(14, 165, 233, 0.12);
}
.undobtn:disabled {
  opacity: 0.55;
  cursor: default;
}
.undohint {
  font-size: 13.5px;
  color: var(--text2);
}
.sib-tip {
  text-align: center;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--brand-deep);
  background: rgba(14, 165, 233, 0.1);
  border: 1px solid rgba(14, 165, 233, 0.28);
  border-radius: 999px;
  padding: 6px 14px;
  margin: 0 auto 14px;
  width: fit-content;
}
.vbtns {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.vote-btn {
  padding: 10px 22px;
  background: var(--glass2);
  border: 1px solid var(--gbd);
  color: var(--ac, var(--brand-deep));
}
.vote-btn:hover:not(:disabled) {
  border-color: var(--ac, var(--brand));
  background: var(--acs, rgba(14, 165, 233, 0.12));
  color: var(--ac, var(--brand-deep));
}
.vote-btn:disabled {
  opacity: 0.55;
  cursor: default;
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

/* 试听清单：透明化曲目数，可播/不可播一目了然 */
.tracklist {
  margin-top: 18px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px 16px;
}
.tl-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.tl-head b {
  font-size: 15px;
  color: var(--text);
}
.tl-sub {
  font-size: 13px;
  color: var(--text2);
}
.tl-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.tl-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 200px;
  border: 1px solid var(--line);
  background: var(--bg);
  border-radius: 999px;
  padding: 6px 12px;
  font: inherit;
  font-size: 13.5px;
  color: var(--text);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}
.tl-chip .tn {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.tl-chip .nm {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-chip:hover:not(:disabled) {
  border-color: var(--brand);
  transform: translateY(-1px);
}
.tl-chip.on {
  border-color: var(--brand);
  background: rgba(14, 165, 233, 0.12);
  font-weight: 600;
}
.tl-chip.off {
  cursor: not-allowed;
  color: var(--text3);
  opacity: 0.7;
}
.tl-chip.off .tn {
  background: var(--text3);
}
.tl-chip .tag {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--text3);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 1px 5px;
}

/* ===== 对战页页头（2026-09-20 UI 重点优化）=====
   用户："淘汰赛按钮写的太小太近，位置应该放的更左上角一点、更大一点，已投也是一样"。
   做法：轮次做成 24px 大字并靠左，提示另起一行；右侧「已投 N/M」数字放大到 30px，
   两侧间距 20px、内边距 18px —— 信息条本身就是一张玻璃卡，视觉上"站起来"了。 */
.playhd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  padding: 16px 20px;
  margin-bottom: 14px;
  border-radius: var(--r-s);
  background: var(--glass);
  border: 1px solid var(--gbd);
  box-shadow: var(--shadow-2);
}
.playhd .phl {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.playhd .phstage {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.4px;
  color: var(--brand-deep);
  line-height: 1.15;
}
.playhd .phhint {
  font-size: 14px;
  color: var(--text2);
  line-height: 1.5;
}
.playhd .phr {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 0 0 auto;
}
.playhd .phlab,
.playhd .phunit {
  font-size: 14px;
  color: var(--text2);
}
.playhd .phnum {
  font-size: 30px;
  font-weight: 900;
  color: var(--brand-deep);
  letter-spacing: -1px;
  font-variant-numeric: tabular-nums;
}
.playhd .phnum i {
  font-style: normal;
  font-size: 19px;
  font-weight: 700;
  color: var(--text3);
}

/* 抽卡式入场：上下场卡片错峰淡入上浮（用户清单 13 行要的"抽卡式入场动画"）
   尊重 prefers-reduced-motion：关掉动画只留最终状态。 */
@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.duelgrid .alb,
.pickgrid .pickcard {
  animation: cardIn 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.duelgrid .alb:nth-child(2),
.pickgrid .pickcard:nth-child(2) {
  animation-delay: 0.08s;
}
.pickgrid .pickcard:nth-child(3) {
  animation-delay: 0.16s;
}
.pickgrid .pickcard:nth-child(4) {
  animation-delay: 0.24s;
}
@media (prefers-reduced-motion: reduce) {
  .duelgrid .alb,
  .pickgrid .pickcard {
    animation: none;
  }
}
</style>
