<template>
  <div class="blist" :class="{ compact }">
    <section v-for="rd in rounds" :key="rd.name" class="lblk">
      <header class="lhd">
        <span class="ldot" aria-hidden="true"></span>
        <b>{{ ROUND_CN[rd.name] || rd.name }}</b>
        <em>{{ rd.list.length }} 场</em>
      </header>

      <div class="lrows">
        <div
          v-for="(m, i) in rd.list"
          :key="m.matchId || `${rd.name}-${i}`"
          class="lrow"
          :class="{ live: isLive(m), bye: m.isBye }"
        >
          <!-- 左：封面 · 专辑名 · 比分（比分贴着中间的冒号，形成左右对称的记分牌） -->
          <div class="lside" :class="sideClass(m, m.leftAlbum)">
            <img v-if="m.leftAlbum?.artworkUrl" :src="m.leftAlbum.artworkUrl" alt="" loading="lazy" />
            <i v-else class="lph" aria-hidden="true"></i>
            <b class="lnm">{{ m.leftAlbum ? m.leftAlbum.name : '待定' }}</b>
            <span class="lsc">{{ scoreOf(m, 'l') }}</span>
          </div>

          <span class="lsep" aria-hidden="true">:</span>

          <!-- 右：镜像排布（row-reverse）—— 封面在最右，比分在最左 -->
          <div class="lside rev" :class="sideClass(m, m.rightAlbum)">
            <img v-if="m.rightAlbum?.artworkUrl" :src="m.rightAlbum.artworkUrl" alt="" loading="lazy" />
            <i v-else class="lph" aria-hidden="true"></i>
            <b class="lnm">
              {{ m.rightAlbum ? m.rightAlbum.name : m.isBye ? '轮空' : '待定' }}
            </b>
            <span class="lsc">{{ scoreOf(m, 'r') }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
/**
 * 完整晋级图 · 「一轮一块、每场一行」清单版竖版
 * ------------------------------------------------------------
 * 2026-10-11 第三十八批（用户拍板选「乙」）：
 *   原话「竖版 应该像我用的黄色框这样框起来的整体应该是这样排布」。
 *   查清后确认：**树状布局做不出窄而高的竖版** ——
 *     树宽 = 「第一轮并排几张卡」× 卡宽（32 张专辑 / 16 张种子 ≈ 3088px），
 *     高度只等于层数（5 层 ≈ 634px）⇒ 实测宽高比 4.87，用户真正下载到的导出图是
 *     6296×1538（比例 4.09，一条宽横幅），页面里一次只看得见 35%、要横向滚 2002px。
 *     而**父节点必须画在两个孩子的正中间**，这是树的定义，少不了一列。
 *   ⇒ 换成清单版：**每轮一块、每场一行**，宽度固定（不再随参赛张数增长），
 *     高度随场次增长 ⇒ 32 张专辑实测 820×1066（比例 0.77，真正的竖图）。
 *   **横版仍是原来的树状，一行代码没动。**
 *
 * 视觉语言刻意与 BracketNode 的卡片保持一致（同一套 CSS 变量、同一套胜负口径）：
 *   · 胜方 → `--brand-deep` + 800 字重；负方 → `--text3` + 封面置灰（`--out-filter`/`--out-opacity`）
 *   · 比分：轮空场与未打完的场次不显示数字（与 `BracketNode.scoreOf` 完全同一口径）
 *   · 「正在打的那一场」高亮：与 `.bcard.live` 同一判据（非轮空且未出胜方）
 * ⚠️ 判胜方一律用 `winnerExtIdOf()`（走 `winnerAlbumExternalId`）——
 *    拿 `winnerAlbumId`（本地 ObjectId）去比永远对不上，对阵表高亮曾因此全失效。
 */
import { ROUND_CN } from '@/utils/tournament.js';
import { winnerExtIdOf } from '@/utils/bracketTree.js';

defineProps({
  /** [{ name: 'r16', list: Match[] }, ...]，已按轮次深浅、场序排好 */
  rounds: { type: Array, default: () => [] },
  /** 紧凑版（结果页折叠里用）：小封面 + 小字。字号下限仍守 12px。 */
  compact: { type: Boolean, default: false },
});

/** 与 BracketNode 同一判据：非轮空、且还没出胜方 = 当前该投的那一场 */
function isLive(m) {
  return Boolean(m) && !m.isBye && !m.winnerAlbumId;
}

/** 比分：未定不显示，轮空不显示（与 BracketNode.scoreOf 一致） */
function scoreOf(m, side) {
  if (!m || m.isBye) return '';
  if (!m.winnerAlbumId) return '';
  return String(side === 'l' ? (m.leftVotes ?? 0) : (m.rightVotes ?? 0));
}

function sideClass(m, album) {
  if (!album || !m) return {};
  const w = winnerExtIdOf(m);
  if (w == null) return {};
  return String(album.albumId) === w ? { win: true } : { lose: true };
}
</script>

<style scoped>
/* 宽度**固定**，不随参赛张数增长 —— 这正是换清单版的目的。
   max-content 由 BracketTree 的 .bshot 承担，这里给确定值让导出尺寸可预期。
   窄屏时由 .btscroll 的横向滚动兜底（与横版同一套约定：可滚、不被裁）。 */
.blist {
  width: 820px;
}
.blist.compact {
  width: 640px;
}

.lblk + .lblk {
  margin-top: 16px;
}
.lhd {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 8px;
}
.ldot {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: var(--brand);
  flex: 0 0 auto;
}
.lhd b {
  font-size: 14px;
  font-weight: 800;
  color: var(--brand-deep);
  letter-spacing: 0.02em;
}
.lhd em {
  font-style: normal;
  font-size: 12px;
  color: var(--text3);
}

/* 左侧一条细线 = "这些场次都属于上面那个轮次"，一眼能看出分层 */
.lrows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-left: 3px;
  padding-left: 14px;
  border-left: 2px solid rgba(14, 165, 233, 0.28);
}

.lrow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border: 1px solid var(--gbd);
  border-radius: 11px;
  background: var(--glass2);
  box-shadow: var(--gsh-hi), 0 2px 8px var(--gsh);
}
.lrow.live {
  border-color: var(--brand);
  box-shadow: var(--gsh-hi), 0 0 0 2px rgba(14, 165, 233, 0.28);
}
.lrow.bye {
  border-style: dashed;
}

.lside {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.lside.rev {
  flex-direction: row-reverse;
  text-align: right;
}
.lside img {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  object-fit: cover;
  flex: 0 0 auto;
}
/* 没有封面时的占位：保证左右两边的名字列还能对齐 */
.lph {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  flex: 0 0 auto;
  background: rgba(11, 42, 66, 0.07);
}
.lnm {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13.5px;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.lsc {
  flex: 0 0 auto;
  min-width: 14px;
  text-align: center;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--text2);
}
.lsep {
  text-align: center;
  font-size: 13px;
  color: var(--text3);
}

/* ── 胜负口径与 BracketNode 完全一致 ── */
.lside.win .lnm,
.lside.win .lsc {
  color: var(--brand-deep);
  font-weight: 800;
}
.lside.lose img {
  filter: var(--out-filter);
  opacity: var(--out-opacity);
}
.lside.lose .lnm,
.lside.lose .lsc {
  color: var(--text3);
  font-weight: 500;
  opacity: 0.85;
}

/* ══════════ 紧凑版（结果页折叠里用）══════════
   尺寸收窄，但**字号下限仍守 12px**（前端设计守则：任何文字 ≥12px）。 */
.blist.compact .lblk + .lblk {
  margin-top: 12px;
}
.blist.compact .lhd {
  margin-bottom: 6px;
}
.blist.compact .lhd b {
  font-size: 13px;
}
.blist.compact .lhd em {
  font-size: 12px;
}
.blist.compact .lrows {
  gap: 4px;
  padding-left: 11px;
}
.blist.compact .lrow {
  padding: 5px 8px;
  gap: 5px;
}
.blist.compact .lside {
  gap: 5px;
}
.blist.compact .lside img,
.blist.compact .lph {
  width: 18px;
  height: 18px;
  border-radius: 5px;
}
.blist.compact .lnm {
  font-size: 12.5px;
}
.blist.compact .lsc,
.blist.compact .lsep {
  font-size: 12px;
}
</style>
