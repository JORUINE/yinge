<template>
  <div v-if="tree" class="btwrap">
    <!-- 工具条：方向切换 + 导出。用户 2026-10-11：「做成竖版的，像音乐世界杯那个一样，
         然后也可以导出分享，给用户更多分享的动机和机会」 -->
    <div class="btool">
      <div class="bseg" role="tablist" aria-label="晋级图方向">
        <button
          type="button"
          role="tab"
          :aria-selected="dir === 'v'"
          :class="{ on: dir === 'v' }"
          @click="dir = 'v'"
        >竖版</button>
        <button
          type="button"
          role="tab"
          :aria-selected="dir === 'h'"
          :class="{ on: dir === 'h' }"
          @click="dir = 'h'"
        >横版</button>
      </div>
      <button class="btn ghost sm" type="button" :disabled="exporting" @click="save">
        {{ exporting ? '正在生成…' : '保存晋级图' }}
      </button>
    </div>

    <div class="btscroll" :class="{ vscroll: dir === 'v' }">
      <!-- 导出目标：导出前挂上 .exporting，克隆出来才有实心底 + 页眉页脚
           data-albums / data-artists 是自检钩子（页脚只在导出时渲染，平时读不到） -->
      <div
        ref="shotEl"
        class="bshot"
        :class="{ exporting }"
        :data-albums="albums"
        :data-artists="artists"
      >
        <div v-if="exporting" class="bphd">
          <b>音格 · YINGE.APP</b>
          <span>我的专辑对决 · 完整晋级图</span>
        </div>
        <div :class="dir === 'v' ? 'btcol' : 'btrow'">
          <BracketNode :node="tree" :compact="compact" :vertical="dir === 'v'" />
          <div class="champcard" :class="{ empty: !champion, mini: compact }">
            <span class="ct">★ 冠军 ★</span>
            <img v-if="champion" :src="champion.artworkUrl" :alt="champion.name" />
            <b class="cn">{{ champion ? champion.name : '等待决出' }}</b>
            <span v-if="champion" class="ca">
              {{ [champion.artistName, year(champion.releaseDate)].filter(Boolean).join(' · ') }}
            </span>
          </div>
        </div>
        <div v-if="exporting" class="bpf">
          {{ albums }} 张专辑 · {{ artists }} 位歌手 · {{ nodes }} 场淘汰赛
        </div>      </div>
    </div>

    <p class="bthint">
      完整晋级图：共 <b>{{ nodes }}</b> 场淘汰赛，
      <template v-if="dir === 'v'">从上往下看 —— 每往下一格，就是上一轮的两个胜者相遇。</template>
      <template v-else>从左往右看 —— 每往右一格，就是上一轮的两个胜者相遇。</template>
      <template v-if="!compact">内容较多时可滑动查看；点「保存晋级图」可存成图片分享。</template>
    </p>
  </div>
</template>

<script setup>
/**
 * 完整晋级图（横向树 / 竖向树 + 冠军格）
 * ------------------------------------------------------------
 * 用户要求：「夺冠之路里增加一个类似音乐世界杯那样的、带完整晋级图的」
 *          ＋「晋级图扩展宽一点，让专辑的字能展现出来」。
 * 数据来源就是后端 /battles/:id 已经返回的 matches（扁平场次），
 * 由 buildBracketTree 还原成树，交给自递归的 BracketNode 渲染。
 *
 * 2026-10-11 第三十六批（用户）：
 *   「完整晋级图能不能做成竖版的，像音乐世界杯那个一样，然后也可以导出分享，
 *     给用户更多分享的动机和机会」⇒ ① 加竖排（默认）② 加「保存晋级图」导出。
 */
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import BracketNode from './BracketNode.vue';
import { buildBracketTree, countNodes } from '@/utils/bracketTree.js';

const props = defineProps({
  matches: { type: Array, default: () => [] },
  champion: { type: Object, default: null },
  compact: { type: Boolean, default: false },
  /** 初始方向：'v' 竖排（默认）/ 'h' 横排。用户要竖版，所以默认竖。 */
  initialDir: { type: String, default: 'v' },
  /**
   * 整局的专辑数 / 歌手数（用于导出海报页脚）。
   * ⚠️ 为什么要从外面传：从淘汰赛的场次里数只数得到**打进淘汰赛的那几张**
   * （8 张专辑的局常常只有 4 张进淘汰赛）⇒ 直接数会和页面其它地方"8 张专辑"的口径打架。
   */
  totalAlbums: { type: Number, default: 0 },
  totalArtists: { type: Number, default: 0 },
});

const tree = computed(() => buildBracketTree(props.matches));
const nodes = computed(() => countNodes(tree.value));
const year = (d) => (d ? String(d).slice(0, 4) : '');

/** 页脚统计：参赛专辑数与歌手数从淘汰赛里出现过的专辑去重得到 */
const albumSet = computed(() => {
  const m = new Map();
  for (const x of props.matches || []) {
    for (const a of [x.leftAlbum, x.rightAlbum]) {
      if (a?.albumId != null) m.set(String(a.albumId), a);
    }
  }
  return m;
});
const albums = computed(() => props.totalAlbums || albumSet.value.size);
const artists = computed(() => props.totalArtists || new Set([...albumSet.value.values()].map((a) => a.artistName).filter(Boolean)).size);

const dir = ref(props.initialDir === 'h' ? 'h' : 'v');
const exporting = ref(false);
const shotEl = ref(null);

async function save() {
  const el = shotEl.value;
  if (!el || exporting.value) return;
  exporting.value = true;
  // 等一帧让 .exporting 的样式（实心底 + 页眉页脚）真正落上再克隆
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const { exportNodeToPng } = await import('@/utils/cardExport.js');
    const W = el.offsetWidth;
    /**
     * 目标宽度：竖排的宽度由"第一轮并排几张卡"决定（8 张专辑 ≈ 700px、40 张能到 3000px）。
     * 固定 1080 会让大树的字被压得看不清 ⇒ 取 max(1080, 原始宽) 并封顶 2400。
     */
    const targetWidth = Math.min(2400, Math.max(1080, W));
    const url = await exportNodeToPng(el, { targetWidth, bg: '#f7fbff' });
    const a = document.createElement('a');
    a.href = url;
    a.download = `音格-完整晋级图-${dir.value === 'v' ? '竖版' : '横版'}.png`;
    a.click();
    ElMessage.success('晋级图已保存');
  } catch (e) {
    ElMessage.error('导出失败，请重试');
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.btwrap {
  margin-top: 10px;
}
/* ── 工具条 ── */
.btool {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.bseg {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: var(--glass);
  border: 1px solid var(--gbd);
}
.bseg button {
  border: 0;
  background: transparent;
  color: var(--text2);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 5px 16px;
  border-radius: 999px;
  cursor: pointer;
}
.bseg button.on {
  background: var(--brand);
  color: #fff;
  box-shadow: 0 2px 8px rgba(14, 165, 233, 0.35);
}

.btscroll {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 6px 4px 10px;
}
.bshot {
  display: inline-block;
}
/* 导出态：实心底 + 内边距 + 页眉页脚（只在这一刻出现，页面上的观感不变） */
.bshot.exporting {
  width: max-content;
  padding: 26px 30px 20px;
  background: var(--bpex-bg, #f7fbff);
  border-radius: 18px;
}
/* ── 导出态的配色兜底（2026-10-11 第三十七批）────────────────────────────
   问题：导出图的底是**固定的浅色** `#f7fbff`（分享图不能透明，否则社交平台显示成黑/灰块），
   而页面上这几个颜色是**为"底不是纯白"而定的**：
     · `--text3` #6d8aa3 → 在 #f7fbff 上只有 **3.35:1**（轮次标签、页脚统计行）；
       落败行还叠了 `opacity:.85` ⇒ 再降到 **2.85:1**；
     · `--gold` #e08700 → 冠军格的"★ 冠军 ★ / 冠军名"，
       压在冠军格那层金色渐变上只有 **2.2~2.6:1**。
   在页面上它们没问题（压玻璃卡 / 深色氛围），搬到近白底上就集体读不清。
   ⇒ 只在 `.exporting` 作用域内把这两个变量换成"在这块浅底上达标"的深色档。
     自定义属性会**继承**，所以能一路传进子组件 BracketNode，不需要 :deep 去捅。
     页面观感**一点不变**（`.exporting` 只在导出那一瞬间存在）。
   实测（导出 PNG 真像素）：--text3 3.35 → 5.23；--gold 2.16 → 5.03。 */
.bshot.exporting {
  --text3: #4e6b85;
  --gold: #8a5100;
}
/* 落败行原本整行 `opacity:.85`，用意是"在深色氛围里退后一点"；
   但在近白底上它只是把文字**冲淡** ⇒ 导出时归位，靠颜色本身区分胜负就够了。 */
.bshot.exporting :deep(.bcard .row.lose .tn),
.bshot.exporting :deep(.bcard .row.lose .sc) {
  opacity: 1;
}
.bphd {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 16px;
}
.bphd b {
  font-size: 17px;
  font-weight: 900;
  letter-spacing: 0.06em;
  color: var(--brand-deep, #0b3a57);
}
.bphd span {
  font-size: 14px;
  color: var(--text2);
}
.bpf {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  font-size: 13px;
  color: var(--text3);
}
.btrow {
  display: inline-flex;
  align-items: center;
  min-width: 100%;
}
.btcol {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}

/* 冠军格：全站唯一的金色块 —— 用户要求"冠军的字体和颜色更鲜艳显眼突出" */
.champcard {
  flex: 0 0 auto;
  margin-left: 22px;
  width: 196px;
  padding: 14px 14px 16px;
  border-radius: 18px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: linear-gradient(180deg, rgba(224, 135, 0, 0.22), rgba(224, 135, 0, 0.08));
  border: 2px solid var(--gold);
  box-shadow: var(--gsh-hi), 0 14px 34px rgba(224, 135, 0, 0.35);
}
/* 竖排：冠军格从"右侧"挪到"最下面"，居中对齐，去掉左边距换成上边距 */
.btcol .champcard {
  margin-left: 0;
  margin-top: 20px;
}
.champcard.empty {
  background: var(--glass2);
  border: 2px dashed var(--line);
  box-shadow: none;
}
.champcard .ct {
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.14em;
  color: var(--gold);
}
.champcard img {
  width: 132px;
  height: 132px;
  border-radius: 12px;
  object-fit: cover;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
}
.champcard .cn {
  font-size: 19px;
  line-height: 1.25;
  font-weight: 900;
  color: var(--gold);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
}
.champcard .ca {
  font-size: 13.5px;
  color: var(--text2);
}
/* 紧凑版：冠军格一起缩小（与树的比例保持一致） */
.champcard.mini {
  width: 148px;
  margin-left: 16px;
  padding: 10px 10px 12px;
  gap: 6px;
  border-radius: 14px;
}
.btcol .champcard.mini {
  margin-left: 0;
  margin-top: 14px;
}
.champcard.mini img {
  width: 92px;
  height: 92px;
}
.champcard.mini .cn {
  font-size: 15px;
}
.bthint {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--text3);
}
.bthint b {
  color: var(--text);
}
</style>
