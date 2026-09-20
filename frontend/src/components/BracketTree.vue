<template>
  <div v-if="tree" class="btwrap">
    <div class="btscroll">
      <div class="btrow" :class="{ compact }">
        <BracketNode :node="tree" :compact="compact" />
        <div class="champcard" :class="{ empty: !champion, mini: compact }">
          <span class="ct">★ 冠军 ★</span>
          <img v-if="champion" :src="champion.artworkUrl" :alt="champion.name" />
          <b class="cn">{{ champion ? champion.name : '等待决出' }}</b>
          <span v-if="champion" class="ca">
            {{ [champion.artistName, year(champion.releaseDate)].filter(Boolean).join(' · ') }}
          </span>
        </div>
      </div>
    </div>
    <p class="bthint">
      完整晋级图：共 <b>{{ nodes }}</b> 场淘汰赛，从左往右看 —— 每往右一格，就是上一轮的两个胜者相遇。
      <template v-if="!compact">横向内容较多时可左右滑动查看。</template>
    </p>
  </div>
</template>

<script setup>
/**
 * 完整晋级图（横向树 + 冠军格）
 * ------------------------------------------------------------
 * 用户要求：「夺冠之路里增加一个类似音乐世界杯那样的、带完整晋级图的」
 *          ＋「晋级图扩展宽一点，让专辑的字能展现出来」。
 * 数据来源就是后端 /battles/:id 已经返回的 matches（扁平场次），
 * 由 buildBracketTree 还原成树，交给自递归的 BracketNode 渲染。
 */
import { computed } from 'vue';
import BracketNode from './BracketNode.vue';
import { buildBracketTree, countNodes } from '@/utils/bracketTree.js';

const props = defineProps({
  matches: { type: Array, default: () => [] },
  champion: { type: Object, default: null },
  compact: { type: Boolean, default: false },
});

const tree = computed(() => buildBracketTree(props.matches));
const nodes = computed(() => countNodes(tree.value));
const year = (d) => (d ? String(d).slice(0, 4) : '');
</script>

<style scoped>
.btwrap {
  margin-top: 10px;
}
.btscroll {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 6px 4px 10px;
}
.btrow {
  display: inline-flex;
  align-items: center;
  min-width: 100%;
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
