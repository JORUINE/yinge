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
          <!-- 竖版 = 「一轮一块、每场一行」清单版（2026-10-11 第三十八批，用户拍板选「乙」）。
               横版 = 原来的树状，**一行没动**。
               为什么不给竖版继续用树：树宽 = 「第一轮并排几张卡」× 卡宽，32 张专辑时 3088px、
               高只有 634px ⇒ 实测比例 4.87，导出是一条 6296×1538 的宽横幅，
               页面里一次只看得见 35%、要横滚 2002px。而父节点必须画在两孩子正中，
               这是树的定义、少不了一列 —— 树状**在数学上做不出窄而高的竖版**。 -->
          <BracketListView v-if="dir === 'v'" :rounds="koRounds" :compact="compact" />
          <BracketNode v-else :node="tree" :compact="compact" :vertical="false" />
          <div class="champcard" :class="{ empty: !champion, mini: compact }">
            <span class="ct">★ 冠军 ★</span>
            <img v-if="champion" :src="champion.artworkUrl" :alt="champion.name" crossorigin="anonymous" />
            <b class="cn">{{ champion ? champion.name : '等待决出' }}</b>
            <span v-if="champion" class="ca">
              {{ [champion.artistName, year(champion.releaseDate)].filter(Boolean).join(' · ') }}
            </span>
          </div>
        </div>
        <div v-if="exporting" class="bpf">
          {{ albums }} 张专辑 · {{ artists }} 位歌手 · {{ koTotal }} 场淘汰赛
        </div>      </div>
    </div>

    <!-- 场次数用 `koTotal`（= 清单真正渲染出的行数）而不是 `nodes`（树里数出来的）。
         原因：竖版现在渲染的是清单，用户能数的就是行数；如果用树的口径显示，
         一旦两者不等，页面就会自己打自己（数出来 16 行、提示写"共 12 场"）。
         自检里断言 `koListCount === nodes`，不等就是有一方漏场。 -->
    <p class="bthint">
      完整晋级图：共 <b>{{ koTotal }}</b> 场淘汰赛，
      <template v-if="dir === 'v'">从上往下按轮次读 —— 每轮一块，每场一行。</template>
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
import BracketListView from './BracketListView.vue';
import { KO_ORDER, buildBracketTree, countNodes } from '@/utils/bracketTree.js';
import { exportAndSave } from '@/utils/saveImage.js';

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
  /**
   * 导出前的"临时恢复布局"钩子（2026-10-21 第五十七批）
   * ------------------------------------------------------------
   * ⚠️ 手机端「完整晋级图」是在一个全屏子页里看的，父组件给外层加了 CSS `zoom` 适配宽度。
   *   而导出是克隆 `.bshot` 再内联 computed style —— **祖先的 zoom 不在克隆树里**，
   *   于是"看得见的布局"和"导出来的布局"对不上：用户保存下来就是右侧被截、封面错位。
   *   ⇒ 父组件传一个函数进来：导出前把 zoom 归 1、导出后还原。
   *   必须是 async（要等一帧让新布局落上），返回的 function 用于还原。
   * @type {null | (() => Promise<() => void>)}
   */
  beforeExport: { type: Function, default: null },
});

const tree = computed(() => buildBracketTree(props.matches));
const nodes = computed(() => countNodes(tree.value));
const year = (d) => (d ? String(d).slice(0, 4) : '');

/**
 * 清单版竖版用的轮次分组：**只取淘汰赛**（与树同一口径），
 * 按轮次由浅到深（KO_ORDER）、同一轮内按场序排。
 * ⚠️ 与 `nodes`（树里数出来的场数）应当相等 —— 探针里有断言，不等就说明有一方漏场。
 */
const koRounds = computed(() =>
  KO_ORDER.map((name) => ({
    name,
    list: (props.matches || [])
      .filter((m) => m.roundName === name)
      .sort((a, b) => (Number(a.matchOrder) || 0) - (Number(b.matchOrder) || 0)),
  })).filter((r) => r.list.length),
);
/** 清单里实际渲染的场数 */
const koListCount = computed(() => koRounds.value.reduce((n, r) => n + r.list.length, 0));
/**
 * 页脚与提示里显示的场次数：**以清单真正渲染出来的行数为准**（用户看到几行就是几场）。
 * 树里数出来的 `nodes` 只作对照 —— 自检里断言两者相等，不等就说明有一方漏场。
 */
const koTotal = computed(() => koListCount.value || nodes.value);

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

/**
 * 保存晋级图（2026-10-17 第四十五批重写）
 * ------------------------------------------------------------
 * ⚠️ 用户真机实测（iOS）：点保存后提示"晋级图已保存"，但相册/文件里**什么都没有**。
 *   根因：`<a download>` 在 iOS Safari 与微信内置浏览器**根本不生效**，而那句 success 照弹。
 *   现在统一走 utils/saveImage.js（真渲染 + 移动端三级降级下载）。
 *   顺带保留本组件特有的两点：
 *     · 等两帧让 `.exporting` 的实心底/页眉页脚样式落上再克隆；
 *     · 目标宽度按原图宽度取 max(1080, W) 并封顶 2400（大树的字不被压糊）。
 */
async function save() {
  const el = shotEl.value;
  if (!el || exporting.value) return;
  // ① 先让父组件把"只影响观看、不该进导出"的东西（例如全屏子页的 zoom）临时关掉
  let restoreLayout = null;
  try {
    restoreLayout = (await props.beforeExport?.()) || null;
  } catch {
    restoreLayout = null;
  }
  try {
    // ② 等一帧让 .exporting 的样式（实心底 + 页眉页脚）真正落上再克隆
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const targetWidth = Math.min(2400, Math.max(1080, el.offsetWidth));
    await exportAndSave(
      el,
      `音格-完整晋级图-${dir.value === 'v' ? '竖版' : '横版'}.png`,
      { exporting, targetWidth, bg: '#f7fbff' },
    );
  } finally {
    // ③ 无论成功失败都把观看状态还原（否则用户退出子页后布局是"导出态"）
    restoreLayout?.();
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
/* ⚠️ 清单版竖版（BracketListView）用的是 `.blist .lside.lose`，类名与树不同名，
   上面那条 `:deep(.bcard …)` 选不到它 —— 漏了这条，竖版导出图里的落败专辑名
   会带着 `opacity:.85` 一起被冲淡（实测对比度掉到 2.85:1，正是第三十七批修过的同一个坑）。 */
.bshot.exporting :deep(.blist .lside.lose .lnm),
.bshot.exporting :deep(.blist .lside.lose .lsc) {
  opacity: 1;
}
.bphd {
  display: flex;
  align-items: baseline;
  gap: 10px;
  /* 子项 nowrap（见下）⇒ 放不下时在元素之间换行，而不是把"音格 · YINGE.APP"劈成两行 */
  flex-wrap: wrap;
  margin-bottom: 16px;
}
/* ⚠️ 2026-10-21 第五十七批：导出图里品牌行被劈成「音格 ·」/「YINGE.APP」两行。
   成因同前：克隆体的字体度量与页面差零点几像素，弹性子项默认自动尺寸 ⇒ 文字内部换行。 */
.bphd > * {
  flex: 0 0 auto;
  white-space: nowrap;
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
/* ⚠️ 2026-10-21 第五十七批：导出图里冠军名被劈成「太陽之」/「子」，歌手行还被卡到框外。
   根因是**fit-content 宽度被 inlineStyles 钉死**（第五十五批在分享卡的 `.cname` 上栽过同一手）：
   页面上 `.cn` 的 computed width = 文字宽（如 76px），克隆体里字体度量差一点就换行，
   而 `.champcard` 的高度也被钉死 ⇒ 换行后的内容直接溢出、被裁掉。
   改成 `width:100%`（= 卡片内容宽，确定性数值）：短名字一行放下，长名字按同一宽度正常折行。 */
.champcard .cn {
  width: 100%;
  font-size: 19px;
  line-height: 1.25;
  font-weight: 900;
  color: var(--gold);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
}
.champcard .ca {
  width: 100%;
  font-size: 13.5px;
  color: var(--text2);
}
.champcard .ct {
  white-space: nowrap;
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
