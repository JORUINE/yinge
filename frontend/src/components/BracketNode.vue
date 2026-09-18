<template>
  <!-- 种子：还没打过，直接显示专辑 -->
  <div v-if="node && node.seed" class="bnode" :class="{ compact }">
    <div class="bcard seed">
      <img v-if="node.album.artworkUrl" :src="node.album.artworkUrl" alt="" loading="lazy" />
      <span class="tn">{{ node.album.name }}</span>
    </div>
  </div>

  <!-- 一场对阵：左边是产出两侧专辑的两场（递归下去），右边是本场卡片 -->
  <div v-else-if="node && node.match" class="bnode" :class="{ compact }">
    <div v-if="node.left || node.right" class="bkids">
      <div class="w"><BracketNode :node="node.left" :compact="compact" /></div>
      <div class="w"><BracketNode :node="node.right" :compact="compact" /></div>
    </div>
    <div class="bcard" :class="{ live: isLive, bye: node.match.isBye }">
      <span class="rnd">{{ ROUND_CN[node.match.roundName] || node.match.roundName }}</span>
      <div class="row" :class="sideClass(node.match.leftAlbum)">
        <img
          v-if="node.match.leftAlbum"
          :src="node.match.leftAlbum.artworkUrl"
          alt=""
          loading="lazy"
        />
        <span class="tn">{{ node.match.leftAlbum ? node.match.leftAlbum.name : '待定' }}</span>
        <b class="sc">{{ scoreOf(node.match, 'l') }}</b>
      </div>
      <div class="row" :class="sideClass(node.match.rightAlbum)">
        <img
          v-if="node.match.rightAlbum"
          :src="node.match.rightAlbum.artworkUrl"
          alt=""
          loading="lazy"
        />
        <span class="tn">
          {{ node.match.rightAlbum ? node.match.rightAlbum.name : node.match.isBye ? '轮空' : '待定' }}
        </span>
        <b class="sc">{{ scoreOf(node.match, 'r') }}</b>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 晋级图节点（**自递归**，靠文件名引用自己）
 * ------------------------------------------------------------
 * 横向铺开的 1v1 淘汰树：**左浅右深**，最右边是决赛 → 冠军。
 * 连线只用两段 CSS 画：
 *   ① 两个子节点各出一条横线伸到竖直母线（.w::after）
 *   ② 竖直线把两条横线连起来（.bkids::after：`top:25%; height:50%`）
 * 因为 .bkids 里每个 .w 都是 flex:1，两个子节点的中线**恰好**落在 25% / 75% 处，
 * 所以母线正好从上面孩子的中线连到下面孩子的中线 —— 这是 CSS 画支架图最省事又最准的写法。
 */
import { computed } from 'vue';
import { ROUND_CN } from '@/utils/tournament.js';
import { winnerExtIdOf } from '@/utils/bracketTree.js';

const props = defineProps({
  node: { type: Object, default: null },
  /** 紧凑版（结果页折叠里用）：小封面 + 小字，整棵树矮一截（2026-09-19 用户要求） */
  compact: { type: Boolean, default: false },
});

const isLive = computed(() => {
  const m = props.node?.match;
  return Boolean(m) && !m.isBye && !m.winnerAlbumId;
});

/** 比分：未定不显示，轮空不显示 */
function scoreOf(m, side) {
  if (!m || m.isBye) return '';
  if (!m.winnerAlbumId) return '';
  return String(side === 'l' ? (m.leftVotes ?? 0) : (m.rightVotes ?? 0));
}

function sideClass(album) {
  const m = props.node?.match;
  if (!album || !m) return {};
  const w = winnerExtIdOf(m);
  if (w == null) return {};
  return String(album.albumId) === w ? { win: true } : { lose: true };
}
</script>

<style scoped>
.bnode {
  display: inline-flex;
  align-items: center;
}
.bkids {
  display: flex;
  flex-direction: column;
  position: relative;
  margin-right: 20px;
}
/* 每个孩子占一半高度 → 中线恰在 25% / 75% */
.bkids > .w {
  position: relative;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
}
/* 横线：从孩子右缘伸到母线 */
.bkids > .w::after {
  content: '';
  position: absolute;
  left: 100%;
  top: 50%;
  width: 20px;
  height: 2px;
  background: var(--bkl, var(--line));
  transform: translateY(-1px);
}
/* 竖直母线 */
.bkids::after {
  content: '';
  position: absolute;
  left: 100%;
  top: 25%;
  height: 50%;
  width: 2px;
  background: var(--bkl, var(--line));
}

.bcard {
  flex: 0 0 auto;
  width: 206px;
  padding: 6px 8px;
  border: 1px solid var(--gbd);
  border-radius: 12px;
  background: var(--glass2);
  box-shadow: var(--gsh-hi), 0 2px 8px var(--gsh);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.bcard.bye {
  border-style: dashed;
  opacity: 0.9;
}
.bcard.live {
  border-color: var(--brand);
  box-shadow: var(--gsh-hi), 0 0 0 2px rgba(14, 165, 233, 0.28);
}
.bcard .rnd {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--text3);
}
.bcard .row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.bcard .row img {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  object-fit: cover;
  flex: 0 0 auto;
}
.bcard .tn {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
  /* 专辑名最多两行 —— 用户要的就是"字能展现出来"（以前只给一行、全被省略成…） */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.25;
}
.bcard .sc {
  flex: 0 0 auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text2);
}
.bcard .row.win .tn,
.bcard .row.win .sc {
  color: var(--brand-deep);
  font-weight: 800;
}
.bcard .row.lose {
  opacity: 0.5;
}
/* 冠军格：金色，比普通格更显眼 */
/* ⚠️ 种子格必须显式约束封面尺寸 —— 之前漏了这条规则，
  iTunes 的 600×600 原图直接被塞进卡里，一列 16 个种子就把整棵树撑到 2000px+ 高
   （这正是用户说的"现在这个太大太长了"）。改成横向小行：小封面 + 名字。 */
.bcard.seed {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  width: 178px;
  border-color: rgba(224, 135, 0, 0.45);
  background: rgba(224, 135, 0, 0.08);
}
.bcard.seed img {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  object-fit: cover;
  flex: 0 0 auto;
}
.bcard.seed .tn {
  -webkit-line-clamp: 2;
  font-size: 12.5px;
  color: var(--text);
}

/* ============ 紧凑版（结果页折叠里用） ============
   用户原话："完整晋级图就把上个版本那种只需要横向拉长……能看到小一点的专辑图和名字就行
   现在这个太大太长了"。做法：封面 22→16px、卡宽 206→148px、字号压到 12.5px、
   连线与留白一起收窄 —— 整棵树的高度大约降到原来的一半。 */
.bnode.compact .bkids {
  margin-right: 13px;
}
.bnode.compact .bkids > .w::after {
  width: 13px;
}
.bnode.compact .bcard {
  width: 148px;
  padding: 4px 6px;
  gap: 2px;
  border-radius: 10px;
}
.bnode.compact .bcard .rnd {
  font-size: 9.5px;
  letter-spacing: 0.04em;
}
.bnode.compact .bcard .row {
  gap: 5px;
}
.bnode.compact .bcard .row img {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}
.bnode.compact .bcard .tn {
  font-size: 12.5px;
  line-height: 1.2;
  -webkit-line-clamp: 2;
}
.bnode.compact .bcard .sc {
  font-size: 11px;
}
.bnode.compact .bcard.seed {
  width: 148px;
}
.bnode.compact .bcard.seed img {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}
</style>
