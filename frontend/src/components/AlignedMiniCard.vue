<template>
  <div class="arep-mini">
    <div class="mini-top">
      <span class="stop">音格 · YINGE.APP</span>
      <span class="pillx">对位赛 · 战报</span>
    </div>

    <div class="mini-score">
      <span class="msn">{{ names[0] }}</span>
      <b class="msv num">{{ score[0] }} : {{ score[1] }}</b>
      <span class="msn">{{ names[1] }}</span>
    </div>

    <div class="mini-sub">{{ leaderText }}　|　共 {{ rows.length }} 场对位</div>

    <div class="mini-rows">
      <!-- ⚠️ 2026-09-23 用户："分享图应该让别人看到所有内容，不应该出现'还有两组未显示'"。
           原先这里 `rows.slice(0, maxRows)`（默认只列 10 组）→ 超过就写一句"还有 N 组未列出"。
           现在**全列**，卡片随内容变高（配合 BattleShareView 的自适应高度）。 -->
      <div v-for="(r, i) in rows" :key="i" class="mrow">
        <div class="mhalf" :class="{ win: sideOf(r) === 'left' }">
          <img :src="r.left?.artworkUrl" :alt="r.left?.name" />
          <span class="mtx">{{ short(r.left?.name) }}</span>
          <b class="mv num">{{ r.leftVotes ?? 0 }}</b>
        </div>
        <span class="mdiv"></span>
        <div class="mhalf rt" :class="{ win: sideOf(r) === 'right' }">
          <b class="mv num">{{ r.rightVotes ?? 0 }}</b>
          <span class="mtx rt">{{ short(r.right?.name) }}</span>
          <img :src="r.right?.artworkUrl" :alt="r.right?.name" />
        </div>
      </div>
    </div>

    <div class="mini-foot">音格 · 专辑对决 · 对位赛不产生冠军 · 点封面即投票</div>
  </div>
</template>

<script setup>
/**
 * 对位赛「简洁分享卡」（结果页与分享页共用）
 * ------------------------------------------------------------
 * 2026-09-21 从 BattleResultView 抽成组件，原因有两个：
 *   ① 分享页 /battle/:id/share 也要能出对位赛的图（以前那条路只有"夺冠之路"，
 *      对位赛没有冠军 → 用户点进去只看到「冠军还没决出」，像坏了）；
 *   ② **导出文字要在一处修**（见下面 scoped 样式里的 font-family 注释）。
 *
 * 版式：720px 宽紧凑卡 —— 顶部品牌行 + 大比分 + 每组一行（左右对称，长名字不挤变形）。
 */
const props = defineProps({
  /** [左名, 右名] */
  names: { type: Array, default: () => ['', ''] },
  /** [左总分, 右总分] */
  score: { type: Array, default: () => [0, 0] },
  /** 领先者那句，如「陶喆 领先 5 场」/「双方打平 · 各胜 4 场」 */
  leaderText: { type: String, default: '' },
  /** 后端 result 的 rows（每行一组对位） */
  rows: { type: Array, default: () => [] },
  /**
   * @deprecated 2026-09-23 起**不再截断**（用户要求"分享图要让别人看到所有内容，
   * 不应该出现'还有 N 组未列出'"）。字段保留只为兼容旧调用方传参，已不参与渲染。
   */
  maxRows: { type: Number, default: 0 },
});

/** 这一行谁赢了：winnerAlbumId 是「外部专辑标识」，与 left/right 的 albumId 同口径 */
function sideOf(r) {
  if (!r?.winnerAlbumId) return null;
  if (String(r.winnerAlbumId) === String(r.left?.albumId)) return 'left';
  if (String(r.winnerAlbumId) === String(r.right?.albumId)) return 'right';
  return null;
}

/**
 * 名字截断（**在 JS 里做，不用 CSS 的 ellipsis**）
 * ------------------------------------------------------------
 * 原因见样式里那段注释：CSS 截断会让 html2canvas 把文字水平压扁。
 * 这里按"视觉宽度"估个长：中日韩字符算 1 格、拉丁字符算 0.55 格，超过 22 格就截断加省略号。
 * 单列版式下名字可用宽度 ≈ 270px，12.5px 字号能放约 21 个汉字 → 22 格是安全的截止线。
 */
function short(name) {
  const s = String(name || '');
  let w = 0;
  for (let i = 0; i < s.length; i += 1) {
    w += /[\u3000-\u9fff\uff00-\uffef]/.test(s[i]) ? 1 : 0.55;
    if (w > 22) return `${s.slice(0, i)}…`;
  }
  return s;
}
</script>

<style scoped>
/* ===== 简洁分享卡（720px）=====
   ⚠️ 2026-09-21 用户报"分享图下载打开文字有问题"（导出 PNG 里的中文字形发虚、像换了字体）。
   根因：全站字体栈以 `-apple-system / SF Pro SC` 打头，Windows 上这两个都不存在，
   html2canvas 自己给 canvas 设 `ctx.font` 时对这种"多段回退 + 引号"的组合解析不稳，
   解析失败就退回 canvas 的默认字体 → 导出的字和页面上看到的不是一个字体。
   对策：导出卡片**自己声明一段只含真名字体的栈**（中文优先、无引号歧义），
   并且不依赖任何需要合成（synthetic）的字重，让 canvas 和 DOM 用同一个字体。 */
.arep-mini {
  width: 720px;
  max-width: 100%;
  padding: 20px 22px 16px;
  border-radius: 18px;
  background: linear-gradient(160deg, #eaf6ff 0%, #f7fbfe 55%, #eefaf6 100%);
  border: 1px solid var(--gbd);
  font-family: 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC',
    'Source Han Sans SC', 'Segoe UI', Arial, sans-serif;
}
.arep-mini .mini-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.arep-mini .stop {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: var(--brand-deep);
}
.arep-mini .mini-score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
}
.arep-mini .msn {
  font-size: 17px;
  font-weight: 700;
}
.arep-mini .msv {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: var(--brand-deep);
  font-variant-numeric: tabular-nums;
}
.arep-mini .mini-sub {
  text-align: center;
  font-size: 13.5px;
  color: var(--text2);
  margin: 6px 0 14px;
}
.arep-mini .mini-rows {
  display: grid;
  /* ⚠️ 2026-09-21 从「两列」改成「单列」：
     两列时每一行的名字只剩 ~90px（卡片 720 − 内边距 − 封面 − 空格 − 分数），
     中文名 3 个字就顶满 —— 这正是用户看到"封面旁边的字被压扁"的直接原因。
     单列后名字有 ~270px，13 个字的专辑名（含 (Remastered 2019) 这种后缀）能一行放下。
     代价只是卡片变高一点，对分享图来说完全可接受，可读性优先。 */
  grid-template-columns: minmax(0, 1fr);
  gap: 7px;
}
.arep-mini .mrow {
  display: flex;
  align-items: center;
  gap: 7px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 11px;
  padding: 6px 9px;
}
.arep-mini .mrow .mhalf {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1 1 0;
  min-width: 0;
}
.arep-mini .mrow .mhalf.rt {
  justify-content: flex-end;
}
/* ⚠️ 2026-09-21 用户："对战报设计旁边那么多空白啥意思优化掉"。
   真因：右半边的专辑名当时**没有右对齐**（漏了 .rt 类），于是名字紧贴中间的分隔线，
   而封面对齐在最右边 —— 名字和封面之间就空出一大块。
   加上 .rt 之后：两边都变成「名靠封面、分靠中间」，左右完全对称，空白自然消失。 */
.arep-mini .mtx.rt {
  text-align: right;
}
.arep-mini .mrow .mhalf.win .mtx,
.arep-mini .mrow .mhalf.win .mv {
  font-weight: 700;
  color: var(--brand-deep);
}
.arep-mini .mrow .mdiv {
  flex: 0 0 auto;
  width: 1px;
  height: 18px;
  background: var(--line);
}
/* 30px 小缩略图统一用一个中性底色，非方形封面也不会露出透明边 */
.arep-mini .mrow img {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  object-fit: cover;
  flex: 0 0 auto;
  background: #eaf1f6;
}
.arep-mini .mtx {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.35;
  /* ⚠️⚠️ 2026-09-21 修掉"分享图文字有问题"的真根因：
     这里原来写的是 `overflow:hidden + text-overflow:ellipsis + white-space:nowrap`。
     html2canvas 在遇到"必须截断的文本"时，会把文字**水平缩放**塞进盒子
     （而不是裁掉），于是导出的专辑名被压扁、还发虚 —— 已用真实导出图复现并确认。
     改成允许正常换行（不做任何截断）：html2canvas 就不会走那条缩放分支。
     名字过长由脚本按字数截断（字数在 12.5px 下已经足够放两行），
     所以这里既不需要 ellipsis、也不需要 line-clamp。 */
  white-space: normal;
  word-break: break-word;
  overflow: visible;
}
.arep-mini .mtx.rt {
  text-align: right;
}
.arep-mini .mv {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 700;
  color: var(--text2);
  font-variant-numeric: tabular-nums;
}
.arep-mini .mini-more {
  text-align: center;
  font-size: 12.5px;
  color: var(--text3);
  margin: 10px 0 0;
}
.arep-mini .mini-foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed rgba(14, 165, 233, 0.32);
  text-align: center;
  font-size: 12.5px;
  color: var(--text3);
}
</style>
