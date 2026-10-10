<template>
  <!--
    ⭐ 人格卡组件（2026-10-05）—— 把「人格卡demo v8」那套**已按成品卡逐项标定**的卡面搬进音格。

    结构 = 底图铺满(1) + 极淡色调层(2) + 文字层(3)
      · 长版 520×693 = 3:4，与素材 720×960 完全同比例 → 不裁切，构图与成品卡一致
      · 方版 420×420 = 1:1，3:4 素材用 object-position 定位取景（每型单独调，保证画面主体留在框里）

    ⚠️ 不要给 `.pcard > *` 写 `position: relative` —— 上一轮就是这么把装饰层挤进文档流、
       把文字整块挤出卡片的。层级只给 `.inner`，装饰层永远 absolute。

    ⚠️ 字号全部走「每张卡显式给值」的令牌，不再靠统一倍率：
       长版需要 ×1.20(副题)/×1.33(指标)/×2.09(条厚) 这种不成比例的上调，
       统一倍率做不到"只动该动的"。
    ⚠️ 令牌缺失 ⇒ `calc()` 计算值非法 ⇒ 字号**静默退回继承的 15px**。
       所以这里每个尺寸都保证有值（长版有 LONG_TYPO 兜底），并有写死的自检断言。
  -->
  <div ref="wrapEl" class="pcwrap" :style="{ height: boxH + 'px', maxWidth: maxWidth + 'px' }">
    <div
      class="pcard"
      :class="mode"
      :style="cardVars"
      :data-anchor="cfg.anchor"
      :data-panel="t.panel ? '1' : undefined"
      :data-icons="t.icons ? '1' : undefined"
      :data-stack="t.stack ? '1' : undefined"
      :data-mw="cfg.mw ? '1' : undefined"
      :data-glowbar="t.glowbar ? '1' : undefined"
      :data-keep="cfg.keep ? '1' : undefined"
      :data-rows="rows.length"
      :data-code="KEY"
    >
      <img class="bg" :src="bgUrl" :alt="name" crossorigin="anonymous" />
      <div class="tone"></div>
      <div class="inner">
        <div class="head" :data-halign="cfg.halign || 'center'">
          <div class="pname">{{ name }}</div>
          <div class="pdesc">{{ desc }}</div>
          <div v-if="t.div === 'line'" class="hair"></div>
          <div v-else-if="t.div === 'dot'" class="dot"></div>
        </div>

        <div class="metrics">
          <div v-for="(d, i) in rows" :key="d.key" class="dim" :class="{ ic: t.icons }">
            <span v-if="t.icons" class="ib" v-html="ICONS[ICON_ORDER[i % 3]]"></span>
            <div class="bd">
              <div class="row">
                <span class="lb">{{ d.label }}</span>
                <b class="vl">{{ d.ten }}<i>/10</i></b>
              </div>
              <div class="bar"><i :style="{ width: d.ten * 10 + '%' }"></i></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { CARD_TYPES, LONG_TYPO, CARD_ICONS } from '@/utils/personalityCardConfig.js';

const props = defineProps({
  code: { type: String, default: '' },
  name: { type: String, default: '' },
  desc: { type: String, default: '' },
  /** [{ key, label, ten }] —— 最多取 3 条（与成品卡一致，见下面的 pickRows） */
  dims: { type: Array, default: () => [] },
  mode: { type: String, default: 'long' }, // long | sq
  /** 设计稿宽（不传则由容器宽度自适应，最大不超过 1:1 原大） */
  maxWidth: { type: Number, default: 520 },
});

const NAT = { long: { w: 520, h: 693 }, sq: { w: 420, h: 420 } };
const ICONS = CARD_ICONS;
const ICON_ORDER = ['wave', 'drum', 'calm'];

const wrapEl = ref(null);
const scale = ref(1);
let ro = null;

function measure() {
  const el = wrapEl.value;
  if (!el) return;
  const avail = el.clientWidth || NAT[props.mode].w;
  scale.value = Math.min(1, avail / NAT[props.mode].w);
}
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined' && wrapEl.value) {
    ro = new ResizeObserver(measure);
    ro.observe(wrapEl.value);
  }
  window.addEventListener('resize', measure);
});
onBeforeUnmount(() => {
  ro?.disconnect();
  window.removeEventListener('resize', measure);
});

const boxH = computed(() => Math.round(NAT[props.mode].h * scale.value));

const KEY = computed(() => String(props.code || '').toUpperCase());
const t = computed(() => CARD_TYPES[KEY.value] || CARD_TYPES.MEL);
const cfg = computed(() => t.value[props.mode] || t.value.long);
const bgUrl = computed(() => `/img/personality/bg-${KEY.value}.jpg`);

/**
 * 卡上的维度条：**与页面右侧「完整维度得分」逐条对齐**（2026-10-06 改）。
 * ⚠️ 之前这里是 `slice(0, 3)`，只取 melody/rhythm/calm —— 于是卡面 3 条、页面 4 条。
 *    用户原话：「**为什么左边只有三个参数 右边有四条 这么明显的错误你居然没把逻辑对齐**」。
 *    当时我的理由是"你的成品卡上就是 3 条"，但**逻辑不对齐本身就是 bug**：
 *    同一个 `scores` 渲染出两个不同答案，用户没法判断哪个是真的。
 *    ⇒ 现在两边都按后端 DISPLAY_DIMS 的顺序全量上（通常 4 条）。
 *    样式语言没变（还是同一套 `.dim / .row / .bar`），只是多一行；
 *    排版是否挤到插画，由自检 `verify-r26-personality-glass.mjs` 量测兜着。
 * 缺哪个维度就跳过（不会少条），也不排序 —— 顺序 = 后端给的顺序，页面上同样顺序。
 */
const CARD_DIM_ORDER = ['melody', 'rhythm', 'arrangement', 'calm'];
const rows = computed(() => {
  const all = (props.dims || []).filter((d) => d && d.key != null);
  const picked = [];
  for (const k of CARD_DIM_ORDER) {
    const hit = all.find((d) => d.key === k);
    if (hit && !picked.includes(hit)) picked.push(hit);
  }
  for (const d of all) {
    if (!picked.includes(d)) picked.push(d);
  }
  return picked.map((d) => ({ key: d.key, label: d.label, ten: clamp(d.ten) }));
});
const clamp = (v) => Math.max(0, Math.min(10, Number(v) || 0));

const U = computed(() => (props.mode === 'sq' ? 0.808 : 1));

const cardVars = computed(() => {
  const a = cfg.value;
  const typo = props.mode === 'long' ? { ...LONG_TYPO, ...a } : a;
  const TYPO_KEYS = ['fsDesc', 'fsLb', 'fsVl', 'fsVi', 'fsBar', 'barW', 'mtBar', 'mtRow', 'mtDesc', 'lh', 'lsDesc', 'lsLb', 'fwTitle'];
  const vars = {
    '--u': U.value,
    '--ink': t.value.ink,
    '--ink2c': t.value.ink2 || t.value.ink,
    '--accent': t.value.accent,
    '--track': t.value.track,
    '--lb-c': t.value.lb || t.value.ink,
    '--vl-c': t.value.vl || t.value.ink,
    '--pad': a.pad,
    '--mx': a.mx,
    '--gap': a.gap,
    '--head-top': a.headTop,
    '--bgpos': a.bgpos,
    '--tsh': t.value.tsh,
    '--halign': a.halign || 'center',
    '--scale': scale.value,
  };
  // 标题 / 左栏大数字**永远要有值**：fsTitle|fsNum 优先，其次由 tch|stk × --u 现算
  const fsTitle = a.fsTitle !== undefined ? a.fsTitle : a.tch !== undefined ? +(a.tch * U.value).toFixed(2) : undefined;
  const fsNum = a.fsNum !== undefined ? a.fsNum : a.stk !== undefined ? +(a.stk * U.value).toFixed(2) : undefined;
  if (fsTitle !== undefined) vars['--fs-title'] = fsTitle;
  if (fsNum !== undefined) vars['--fs-num'] = fsNum;
  if (a.tch !== undefined) vars['--tch'] = a.tch;
  if (a.stk !== undefined) vars['--stk'] = a.stk;
  if (a.panelPad) vars['--panel-pad'] = a.panelPad;
  if (a.mw) vars['--mw'] = a.mw;
  if (a.halign === 'left') vars['--halign'] = 'left';
  vars[a.anchor === 'bottom' ? '--met-bottom' : '--met-top'] = a.anchor === 'bottom' ? a.metBottom : a.metTop;
  if (t.value.panel) vars['--panel-bg'] = t.value['panel-bg'];
  const tone = props.mode === 'sq' && t.value.toneSq ? t.value.toneSq : t.value.tone;
  if (tone) vars['--tone'] = tone;
  if (t.value.icons) {
    vars['--ico-bg'] = 'rgba(255,255,255,.22)';
    vars['--ico-bd'] = 'rgba(255,255,255,.5)';
    vars['--ico-c'] = '#fff';
  }
  for (const k of TYPO_KEYS) {
    if (typo[k] !== undefined) vars[`--${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`] = typo[k];
  }
  return vars;
});
</script>

<style scoped>
/* ⚠️ 这里不用 `transform: scale()` —— html2canvas 导出时对 transform 的处理会把
   文字栅格化在半路上（导出图发虚）。改用「设计尺寸 × 缩放系数」逐项算，
   导出走的是同一套 px 真值。 */
.pcwrap {
  position: relative;
  width: 100%;
  max-width: 520px;
  overflow: hidden;
  margin: 0 auto;
}
.pcard {
  position: relative;
  overflow: hidden;
  color: var(--ink);
  --u: 1;
  isolation: isolate;
  box-shadow: 0 26px 58px -30px rgba(4, 30, 51, 0.55);
  transform-origin: top left;
}
.pcard.long {
  width: calc(520px * var(--scale));
  height: calc(693px * var(--scale));
  /* ⚠️ 2026-10-07 第三十三批：圆角与「人格图鉴」的卡片对齐。
     图鉴卡 16px / 368px 宽 = 4.35% 的相对圆角；这里设计宽 520 ⇒ 520 × 4.35% ≈ 22.6px。
     原来写死 26px（相对 5.0%），两处放一起看就是"圆角不一样"。 */
  border-radius: calc(22.6px * var(--scale));
}
.pcard.sq {
  width: calc(420px * var(--scale));
  height: calc(420px * var(--scale));
  /* 同 long：按图鉴卡 4.35% 的相对圆角算（420 × 4.35% ≈ 18.3px） */
  border-radius: calc(18.3px * var(--scale));
}
/* ⭐ 2026-10-07 第三十三批：1px 白色描边，与图鉴卡一致。
   ⚠️ 必须用 ::after 画在最上层、不能用 border/inset-shadow：
       · border 会挤内容（卡面宽高是 calc 死的）；
       · inset box-shadow 画在**背景之上、子元素之下** ⇒ 会被 .bg 那张插画整片盖住。
   ::after 作为卡面的最后一份子元素、z-index 抬高，描边才压在插画上（正是图鉴卡的效果）。 */
.pcard::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
  border-radius: inherit;
  border: 1px solid rgba(255, 255, 255, 0.95);
}
.pcard .bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: var(--bgpos, 50% 50%);
  display: block;
  z-index: 0;
}
.pcard .tone {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: var(--tone, none);
  pointer-events: none;
}
.pcard .inner {
  position: absolute;
  inset: 0;
  z-index: 2;
  /* 注意：这里**不设** font-size —— 设了会让"忘了给字号"的元素静默变成 1px，
     反而更难查。每个文本元素的字号都在下面显式给了值。 */
}

.head {
  position: absolute;
  left: calc(var(--pad) * 1px * var(--scale));
  right: calc(var(--pad) * 1px * var(--scale));
  top: var(--head-top);
  text-align: var(--halign, center);
}
.pname {
  font-family: 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', SimSun, serif;
  font-weight: var(--fw-title, 500);
  line-height: 1.16;
  letter-spacing: var(--ls-title, 0.045em);
  font-size: calc(var(--fs-title) * 1px * var(--scale));
  text-shadow: var(--tsh, none);
}
.pdesc {
  font-family: var(--font-body, sans-serif);
  font-weight: 450;
  font-size: calc(var(--fs-desc) * 1px * var(--scale));
  letter-spacing: var(--ls-desc, 0.04em);
  /* ⚠️ 2026-10-07 第三十批：这里原来是 12 → 渲染出来只有 **10px**（还要再乘 --scale≈0.85），
     用户看着"标题和副标题挤在一起"（导出图 48% 预览里最明显）。
     提到 17（渲染 ≈14px），副标题与下方维度条的余量仍够 ——
     实测六型"副标题→第一条维度条"最紧的是探索者 17px，减 4px 后还有 13px（+行盒底部空白≈18px 视觉）。 */
  margin: calc(var(--mt-desc, 17) * 1px * var(--scale)) 0 0;
  color: var(--ink2c, var(--ink));
  opacity: 0.94;
  line-height: 1.5;
  /* ⭐⭐ 2026-10-06 描述**最多两行**。
     为什么要钳：标题块是 `position:absolute` 靠 metTop 定位的，描述一长就把标题块撑高、
     直接压到下面的维度条上（实测用真实长文案时 CLM/EXP/LYR 三型间距只剩 4/-2/2px）。
     而描述来自后台、长度不可控 ⇒ 不能靠"文案刚好不长"。

     ⚠️⚠️ 钳制方式**必须用 max-height，不能用 `-webkit-line-clamp`**：
       `-webkit-line-clamp` 依赖 `display:-webkit-box`，浏览器渲染没问题，
       但 **html2canvas 不支持这个显示模式** —— 导出分享图时它把多行文字拆错位，
       画出来是**明显变形的字形**（用户报的"导出的分享图 文字被压缩了"就是这个）。
       实测：去掉 -webkit-box 后同一张导出图两行都正常（诊断图见 tools/pw 的输出）。
       `max-height + overflow:hidden` 是 html2canvas 支持的普通裁切，导出安全。
     ⚠️ 代价：第三行是硬切、没有省略号。六型描述实测都 ≤2 行（最长的探索者正好两行），
       这条只是防后台文案变长的兜底。 */
  max-height: calc(2 * 1.5em);
  overflow: hidden;
}
.hair {
  width: calc(62px * var(--u) * var(--scale));
  height: calc(1.5px * var(--scale));
  margin: calc(17px * var(--u) * var(--scale)) auto 0;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.45;
}
.head[data-halign='left'] .hair {
  margin-left: 0;
  margin-right: auto;
}
.dot {
  width: calc(7px * var(--u) * var(--scale));
  height: calc(7px * var(--u) * var(--scale));
  border-radius: 50%;
  margin: calc(15px * var(--u) * var(--scale)) auto 0;
  background: var(--accent);
  box-shadow: 0 0 calc(14px * var(--u) * var(--scale)) calc(2px * var(--u) * var(--scale)) var(--accent);
}

.metrics {
  position: absolute;
  left: calc(var(--mx) * 1px * var(--scale));
  right: calc(var(--mx) * 1px * var(--scale));
  top: var(--met-top);
  display: flex;
  flex-direction: column;
  gap: calc(var(--gap) * 1px * var(--scale));
}
.pcard[data-anchor='bottom'] .metrics {
  top: auto;
  bottom: var(--met-bottom);
}
.pcard[data-mw='1'] .metrics {
  right: auto;
  width: calc(var(--mw) * 1px * var(--scale));
}
.dim .row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: calc(10px * var(--scale));
  line-height: var(--lh, 1.15);
  margin: calc(var(--mt-row, 10) * 1px * var(--scale)) 0;
}
.lb {
  font-family: var(--font-body, sans-serif);
  font-weight: 500;
  font-size: calc(var(--fs-lb) * 1px * var(--scale));
  letter-spacing: var(--ls-lb, 0.04em);
  /* ⚠️ 2026-10-07 第三十三批：标签/数值也要吃 `--tsh` 文字阴影。
     起因：RHY 的维度底板改成**浅色**（用户要的"统一到标准"）后，白字在变亮的橙底上
     对比度掉到 1.53 —— 已经看不清楚了。正解不是把板改回黑（那是退回黑框），
     而是**给文字加暗描边**（text-shadow 属于文字自身，不算"框"）。 */
  text-shadow: var(--tsh, none);
  /* ⚠️ 2026-10-07 第三十三批：标签/数值也要吃 `--tsh` 文字阴影。
     起因：RHY 的维度底板改成**浅色**（用户要的"统一到标准"）后，白字在变亮的橙底上
     对比度掉到 1.53 —— 已经看不清楚了。正解不是把板改回黑（那是退回黑框），
     而是**给文字加暗描边**（text-shadow 属于文字自身，不算"框"）。 */
  text-shadow: var(--tsh, none);
  /* ⚠️⚠️ 2026-10-07 第三十二批：标签**绝不能折行**。
     用户导出图里出现「旋律敏 / 感」这种折行 —— 根因是**导出时的字体回退不同**：
     headless 环境回退到较窄的字体，有头浏览器（Edge/雅黑）更宽 ⇒ 同一句
     「旋律敏感」在导出图里被挤断。加 nowrap 一劳永逸，网页与导出都受益。 */
  white-space: nowrap;
  color: var(--lb-c, var(--ink));
}
.vl {
  font-family: var(--font-body, sans-serif);
  font-weight: 700;
  font-size: calc(var(--fs-vl) * 1px * var(--scale));
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--vl-c, var(--ink));
  text-shadow: var(--tsh, none);
  text-shadow: var(--tsh, none);
}
.vl i {
  font-style: normal;
  font-weight: 500;
  font-size: calc(var(--fs-vi) * 1px * var(--scale));
  opacity: 0.72;
  margin-left: 1px;
}
/* --bar-w：条状长度。音色控那两张成品卡上的条只占行宽约 58%（不是铺满）。 */
.bar {
  height: calc(var(--fs-bar) * 1px * var(--scale));
  border-radius: 99px;
  background: var(--track);
  overflow: hidden;
  width: var(--bar-w, 100%);
  margin-top: calc(var(--mt-bar, 10) * 1px * var(--scale));
}
/* ⭐ 2026-10-06：维度条从 3 行变 4 行之后（为了和页面右侧「完整维度得分」逐条对齐），
   标定好的行节奏（mt-row 10 / gap 28 / mt-bar 10）会让维度块**撑出卡片下沿 59px**。
   实测：卡面 137~723，维度块 354~782。
   ⇒ 这里**只压缩行与行之间的间距**（不动字号、不动条厚、不动插画），把 4 行塞回卡内。
      3 行的成品卡标定**一个字都不改**（规则挂在 [data-rows='4'] 上，3 行不命中）。
   省下的高度（系数 0.42 / 0.38 / 0.38）：gap≈25 + mt-row≈26 + mt-bar≈13 = 64px。
   实测 4 行比 3 行多出 74px，只省 54px 还差 5px —— 系数再收一档到 0.42/0.38 才够，
   最终维度块 354~705、离卡底 18px（自检钉着 ≥8px）。
   ⚠️ **不要**顺手把 metrics 往上提：原来 metTop 37% 换算出来是 354，标题块底是 355，
      本来就是紧挨着的（上移 20px 会直接压上去 18px —— 自检当场抓到）。
      3 行时这两块也是这个关系、用户已确认过，所以**保持原位**，只压行距。
   ⚠️ 自检 verify-r26-personality-glass.mjs 里有"不溢出且不与标题重叠"的断言钉着这条。 */
.pcard[data-rows='4'] .metrics {
  gap: calc(var(--gap) * 0.42 * 1px * var(--scale));
}
/* ⭐⭐ 2026-10-06 竖向节奏（用户：「人格卡你应该把[名字]这个大字和[解释]的小字放在上面位置」
   「得分的四条…离开底部太近 可读性也很差」，并且「全部有排布问题的卡片都按这个要求重新优化」）。

   先量了六型在 440×586 下的真实数字（tools/pw/probe-card-rhythm.mjs），问题很具体：
     code | 标题块顶 | 头→条 | 离卡底
     CLM  |    94   |  13  | 194     ← 标题压太下、标题与条贴太紧
     MEL  |    50   | 190  |  53
     RHY  |    65   | 199  |  47
     EXP  |    56   |  21  | 206
     LYR  |    97   |  23  |  10     ← ⚠️ 离卡底只有 10px，就是用户说的"离底部太近"
     TMB  |    50   | 203  |  18     ← ⚠️ 同样贴底
   判据：标题块顶 ≥40px（名字在上面）｜头→条 ≥18px（不压在一起）｜离卡底 ≥40px（不贴底）。
   改法（**只在 [data-rows='4'] 下生效，3 行的成品卡标定一个字都不动**）：
     ① 标题块统一 top:7%（=41px）—— 六型一律把名字放到卡面上方；
     ② 底锚型（MEL/RHY/TMB）整体上抬 4%（≈23px）；
     ③ 顶锚型逐型给 metTop —— EXP 的标题特别高（fsTitle 74），30% 会压上去，要 32%；
        LYR 的条最高（359px），要 28% 才离得开卡底。 */
.pcard[data-rows='4'] .head {
  top: 7%;
}
.pcard[data-rows='4'][data-anchor='bottom'] .metrics {
  bottom: calc(var(--met-bottom) + 4%);
}
.pcard[data-rows='4'][data-anchor='top'] .metrics {
  top: 30%;
}
.pcard[data-rows='4'][data-code='EXP'] .metrics {
  top: 33.5%;
}
.pcard[data-rows='4'][data-code='LYR'] .metrics {
  /* 词句收藏家的条最高（实测 359px），28% 时描述文字底到第一条只剩 2px —— 提到 31% */
  top: 31%;
}
/* 节拍动物：卡面正中是**最亮的一团橙色光晕**（跳舞的小人就在那）。
   维度条从 3 行变 4 行之后，最后一行无论怎么摆都落在那团光里 ——
   实测只靠挪位置：+4% 时标签/数值 1.73/1.73，压到 +8% 变成 1.42/1.85，**都过不了 1.8 的判据**
   （3 行时是 2.65/2.74/2.81，是本轮加第 4 行造成的回归）。
   ⇒ 给这一型单独加一层**柔和暗底板**：上下淡出、左右也淡出，只把四行文字托住，
      数字对比度 1.73 → 4.7（实测），构图与配色一字未改。
      ⚠️ 只给 RHY 加：其余五型不需要（CLM 8.4 / MEL 8.8 / EXP 9.6 / TMB 6.0 / LYR 1.8 是
      另一个早就挂着的"忠于成品卡"取舍，见 _证据与痕迹/改动记录.md 记录 17）。 */
.pcard[data-rows='4'][data-code='RHY'] .metrics {
  padding: calc(10px * var(--scale)) calc(16px * var(--scale)) calc(8px * var(--scale));
  margin-left: calc(-16px * var(--scale));
  margin-right: calc(-16px * var(--scale));
  /* ⚠️⚠️ 2026-10-07 第三十三批：**从「暗棕」改成「暖白」**。
     用户把详情页的节拍动物定为"标准"（"所有的节拍动物都以这个为标准"），
     他图里那块维度底板是**浅色半透明**（比橙底亮）；而这里原来是 `rgba(58,18,0,.42)`
     的**暗棕**（第二十七批为压暗底色、保白字对比度而加）——
     两处放一起就是"一个浅一个黑"，正是他说的"不是让你全部统一吗"。
     ⇒ 改成暖白半透明（与橙色同源、比底色亮），统一到用户的标准。
     ⚠️ 代价：白字对比度进一步下降（远低于 4.5），是**用户知情的取舍**；
        verify-r30 里 RHY 已单列为"用户取舍"断言，不再当 bug 报红。 */
  background: radial-gradient(125% 135% at 50% 50%, rgba(255, 236, 214, 0.20) 0%, rgba(255, 236, 214, 0.13) 60%, rgba(255, 236, 214, 0) 100%);
}
.pcard[data-rows='4'] .dim .row {
  margin: calc(var(--mt-row, 10) * 0.38 * 1px * var(--scale)) 0;
}
.pcard[data-rows='4'] .bar {
  margin-top: calc(var(--mt-bar, 10) * 0.38 * 1px * var(--scale));
}
.bar > i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--accent);
}
.pcard[data-glowbar='1'] .bar > i {
  box-shadow: 0 0 calc(12px * var(--scale)) var(--accent);
}

/* 结构 B：指标放在玻璃面板里（音色控） */
.pcard[data-panel='1'] .metrics {
  background: var(--panel-bg);
  border-radius: calc(18px * var(--u) * var(--scale));
  padding: var(--panel-pad);
  box-shadow: 0 calc(10px * var(--scale)) calc(30px * var(--scale)) calc(-14px * var(--scale)) rgba(10, 60, 55, 0.45);
  -webkit-backdrop-filter: blur(calc(12px * var(--scale))) saturate(150%);
  backdrop-filter: blur(calc(12px * var(--scale))) saturate(150%);
}

/* 结构 B2：指标带圆形图标（节拍动物） */
.dim.ic {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: calc(15px * var(--u) * var(--scale));
  align-items: center;
}
.ib {
  width: calc(44px * var(--u) * var(--scale));
  height: calc(44px * var(--u) * var(--scale));
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--ico-bg);
  border: 1px solid var(--ico-bd);
  color: var(--ico-c);
}
.ib :deep(svg) {
  width: calc(24px * var(--u) * var(--scale));
  height: calc(24px * var(--u) * var(--scale));
  display: block;
}

/* 结构 C：左栏三段式（词句收藏家）—— 标签 / 大数字 / 条 */
.pcard[data-stack='1'] .dim .row {
  display: block;
}
.pcard[data-stack='1'] .lb {
  display: block;
}
.pcard[data-stack='1'] .vl {
  display: block;
  font-family: 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', SimSun, serif;
  font-weight: 700;
  line-height: 1.18;
  font-size: calc(var(--fs-num) * 1px * var(--scale));
  margin: calc(3px * var(--u) * var(--scale)) 0 calc(9px * var(--u) * var(--scale));
}
.pcard[data-stack='1'] .vl i {
  font-family: var(--font-body, sans-serif);
  font-weight: 600;
}
.pcard[data-stack='1'] .bar {
  margin-top: 0;
}

/* ⚠️ 方版里「用户已确认 ok」的 5 张：逐项锁回上一版的值，要改只需删掉这一节 */
.pcard.sq[data-keep='1'] .pname {
  font-size: calc(var(--tch) * var(--u) * 1px * var(--scale));
}
.pcard.sq[data-keep='1'] .pdesc {
  font-size: calc(15.5px * var(--u) * var(--scale));
  font-weight: 500;
  letter-spacing: 0.055em;
  margin-top: calc(11px * var(--u) * var(--scale));
}
.pcard.sq[data-keep='1'] .lb {
  font-size: calc(14.5px * var(--u) * var(--scale));
  font-weight: 500;
  letter-spacing: 0.05em;
}
.pcard.sq[data-keep='1'] .vl {
  font-size: calc(16.5px * var(--u) * var(--scale));
  font-weight: 700;
}
.pcard.sq[data-keep='1'] .vl i {
  font-size: calc(12px * var(--u) * var(--scale));
  font-weight: 500;
}
/* 方版条厚 = 长版 12 × 0.808 = 9.7px（与成品卡实测 10px 一致；同一个设计厚度） */
.pcard.sq[data-keep='1'] .bar {
  height: calc(12px * var(--u) * var(--scale));
  margin-top: calc(9px * var(--u) * var(--scale));
}
.pcard.sq[data-keep='1'] .dim .row {
  line-height: 1.6;
  margin: calc(18px * var(--scale)) 0;
}
.pcard.sq[data-keep='1'] .metrics {
  gap: calc(var(--gap) * var(--u) * var(--scale));
}
.pcard.sq[data-keep='1'][data-stack='1'] .vl {
  font-size: calc(var(--stk, 42) * var(--u) * 1px * var(--scale));
}
.pcard.sq[data-keep='1'][data-stack='1'] .bar {
  height: calc(12px * var(--u) * var(--scale));
}
</style>
