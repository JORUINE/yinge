<template>
  <div class="share">
    <div v-if="loading" class="state muted">正在加载…</div>

    <!-- ══════════ 对位赛 / 指定对决：不产生冠军，出「逐行对照表」分享图 ══════════
         ⚠️ 2026-09-21 用户报："对位赛里点分享跳过来看到『冠军还没决出』，这是什么问题"。
         以前这一页只做「夺冠之路」，而对位赛压根没有冠军 → 永远落进空态，看着像坏了。
         现在这里**也能出对位赛的图**：复用结果页那张简洁分享卡（同一个组件），
         这样不管从哪个入口进来，都有东西可看、可下载。 -->
    <template v-else-if="isAligned">
      <div class="page-head">
        <p class="eyebrow">对位赛 · 分享图</p>
        <h1>把这次对位做成一张图</h1>
        <p class="muted sub">
          对位赛是一组一组打对照表的玩法，<b>不产生冠军</b>，所以出的是这张「逐组对照表」。
        </p>
      </div>

      <div class="sharewrap">
        <div>
          <div ref="cardEl">
            <AlignedMiniCard
              :names="alignedSideNames"
              :score="alignedScore"
              :leader-text="leaderText"
              :rows="data.rows || []"
            />
          </div>
          <p class="cap">预览效果 · 导出为 2 倍图（约 1440px 宽）</p>
        </div>

        <div>
          <div class="hd"><b>导出设置</b><span>点下载即可保存到本地</span></div>

          <div class="note">
            <b>说明：</b>分享图是作品的「自传播」出口 —— 前端把这张卡片转成图片下载（html2canvas），
            别人点开链接就能来投票。二维码留到部署后再接（需要线上域名才有意义）。
          </div>

          <div class="btns">
            <button class="btn pri" type="button" :disabled="exporting" @click="download">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 16V4M8 8l4-4 4 4M5 20h14" />
              </svg>
              {{ exporting ? '正在生成…' : '下载图片' }}
            </button>
            <button class="btn ghost" type="button" @click="copyLink">复制链接分享</button>
            <RouterLink :to="{ name: 'battle-result', params: { id } }" class="btn ghost">
              看完整战报
            </RouterLink>
          </div>
        </div>
      </div>
    </template>

    <!-- ══════════ 杯赛制：夺冠之路 ══════════ -->
    <template v-else-if="champion">
      <div class="page-head">
        <p class="eyebrow">夺冠之路 · 分享图</p>
        <h1>把这次对决做成一张图</h1>
      </div>

      <div class="sharewrap">
        <div>
          <!-- 分享卡（导出对象）
               ⚠️ 2026-09-21 用户要求："背景做成和对决里一样的液态玻璃质感，
                  背景透明色取冠军专辑然后做渐变，不能影响可读性"。
               实现：三层叠出来 —— ① 左上冠军专辑主色柔光 ② 右下同色系补光
               ③ 深底渐变兜住对比度（文字始终是浅色，#e6f2fa 对深底 ≥ 12:1）。
               ⚠️ 不能真用 backdrop-filter：html2canvas 不认，导出会丢掉整层。 -->
          <div
            ref="cardEl"
            class="scard glassy"
            :class="{ square: shape === 'square' }"
            :style="cardStyle"
          >
            <!-- 模糊底：封面缩到 56px 再放大铺满 → 天然的"虚化封面"，导出也在 -->
            <img v-if="bgUrl" class="sbg" :src="bgUrl" alt="" aria-hidden="true" />
            <div>
              <div class="stop">音格 · YINGE.APP</div>
              <div class="stitle">我的专辑对决</div>
            </div>
            <div class="smain">
              <div class="crown">★ 冠 军 ★</div>
              <div class="art"><img :src="champion.artworkUrl" :alt="champion.name" crossorigin="anonymous" /></div>
              <div class="cname">{{ champion.name }}</div>
              <div class="cartist">{{ champion.artistName }} · {{ year(champion.releaseDate) }}</div>
              <div class="spath" v-if="opponents.length">
                <div v-for="(o, i) in opponents" :key="i">
                  <img :src="o.artworkUrl" :alt="o.name" crossorigin="anonymous" />
                </div>
              </div>
              <div class="roundline">{{ roundLine }}</div>
            </div>
            <div class="sfoot">
              <span>{{ footLine }}</span>
              <span v-if="withLink" class="sharel">{{ shareUrl }}</span>
            </div>
          </div>
          <p class="cap">预览效果 · 导出尺寸 {{ outSize }}</p>
        </div>

        <div>
          <div class="hd"><b>导出设置</b><span>选择后点下载即可保存到本地</span></div>
          <div class="opts">
            <div class="opt" :class="{ on: shape === 'portrait' }" @click="shape = 'portrait'">
              <span class="rd2"></span>
              <span class="tx"><b>竖版长图 1080 × 1440</b><span>适合发朋友圈、小红书、微博</span></span>
            </div>
            <div class="opt" :class="{ on: shape === 'square' }" @click="shape = 'square'">
              <span class="rd2"></span>
              <span class="tx"><b>方形图 1080 × 1080</b><span>适合发 Instagram、微博九宫格</span></span>
            </div>
            <div class="opt" :class="{ on: withLink }" @click="withLink = !withLink">
              <span class="rd2"></span>
              <span class="tx"><b>带上分享链接</b><span>把本场对决的链接印在图上，别人点开就能来投票</span></span>
            </div>
          </div>

          <div class="btns">
            <button class="btn pri" type="button" :disabled="exporting" @click="download">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 16V4M8 8l4-4 4 4M5 20h14" />
              </svg>
              {{ exporting ? '正在生成…' : '下载图片' }}
            </button>
            <button class="btn ghost" type="button" @click="copyLink">复制链接分享</button>
          </div>

          <div class="note">
            <b>说明：</b>分享图是作品的「自传播」出口 —— 前端把这张卡片转成图片下载（html2canvas），
            后端只记录一条分享记录用于「我的分享」找回。二维码留到部署后再接（需要线上域名才有意义）。
          </div>
        </div>
      </div>
    </template>

    <div v-else class="state g-card">
      <h2>冠军还没决出</h2>
      <p class="muted">先把对决投完，才能生成夺冠之路分享图。</p>
      <RouterLink :to="{ name: 'battle-pk', params: { id } }" class="btn pri">继续投票</RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { battleApi } from '@/api';
import { ROUND_CN } from '@/utils/tournament.js';
import { accentStyleOf, ensureAlbumAccent, withAlpha, deepenRgb } from '@/utils/coverColor.js';
import AlignedMiniCard from '@/components/AlignedMiniCard.vue';

const route = useRoute();
const id = route.params.id;

const loading = ref(true);
const exporting = ref(false);
const data = ref(null);
const cardEl = ref(null);

const shape = ref('portrait');
const withLink = ref(false);

const champion = computed(() => data.value?.champion || null);
/**
 * 对位赛 / 指定对决是"不出冠军"的玩法（B/C 线）。
 * ⚠️ 2026-09-21 用户报：对位赛里点分享跳进来看到「冠军还没决出」，以为坏了。
 * 现在**不再给空态**：对位赛直接渲染「逐组对照表」分享卡（见模板第一个分支）。
 */
// 后端 result 的 type 只有 'aligned'（对位/指定对决）与 'standard'（杯赛）
const isAligned = computed(() => data.value?.type === 'aligned');

/* ── 对位赛分享卡用到的几个量（口径与结果页一致）── */
const alignedSideNames = computed(() => {
  const rows = data.value?.rows || [];
  if (rows.length) return [rows[0].left?.artistName || '左', rows[0].right?.artistName || '右'];
  const ps = data.value?.points || [];
  return [ps[0] ? '左侧' : '左', ps[1] ? '右侧' : '右'];
});
const alignedScore = computed(() => {
  let l = 0;
  let r = 0;
  for (const row of data.value?.rows || []) {
    l += Number(row.leftVotes) || 0;
    r += Number(row.rightVotes) || 0;
  }
  return [l, r];
});
const leaderText = computed(() => {
  const ps = data.value?.points || [];
  if (!ps.length) return '暂无胜场';
  const top = ps[0].wins;
  const leaders = ps.filter((p) => p.wins === top);
  if (leaders.length > 1) return '双方打平';
  return `${alignedSideNames.value[0]} 领先 ${top} 场`;
});

const year = (d) => (d ? String(d).slice(0, 4) : '');
const shareUrl = computed(() => `${location.host}/battle/${id}`);

const opponents = computed(() =>
  (data.value?.path || []).map((p) => p.opponent).filter(Boolean).slice(0, 5),
);
const roundLine = computed(() => {
  const names = (data.value?.path || []).map((p) => ROUND_CN[p.roundName] || p.roundName);
  return names.length ? names.join(' → ') : '专辑对决';
});
const footLine = computed(() => {
  const b = data.value?.battle || {};
  const parts = [];
  if (b.poolTarget) parts.push(`${b.poolTarget} 张专辑`);
  if ((b.artists || []).length) parts.push(`${b.artists.length} 位歌手`);
  parts.push(`${b.stepTotal || 0} 场决出`);
  return parts.join(' · ');
});
const outSize = computed(() => (shape.value === 'square' ? '1080 × 1080' : '1080 × 1440'));

/**
 * 冠军卡取色：把冠军专辑的封面主色做成配色变量。
 * ⚠️ 必须先 `deepenRgb` 压深再用 —— 取到的色可能是浅色（白裙 / 浅蓝封面），
 *    直接铺会把卡片左上角染亮，而品牌行与标题是浅色字 → 可读性事故。
 */
const cardStyle = computed(() => {
  const s = accentStyleOf(champion.value);
  const ac = s['--ac'];
  if (!ac) return {};
  const deep = deepenRgb(ac);
  return {
    '--sa-58': withAlpha(deep, 0.58),
    '--sa-38': withAlpha(deep, 0.38),
    '--sa-20': withAlpha(deep, 0.2),
  };
});

/**
 * 虚化底图（2026-09-21 用户："这背景取色和模糊效果还是没做出来" → 2026-09-22 二次修正：
 * "为什么后面是马赛克？不应该是马赛克，应该是那种渐变模糊，整体是 iOS 的液态玻璃质感"）
 * ------------------------------------------------------------
 * 第一版做错了什么：我把封面缩到 **56×56** 再放大铺满 —— 放大倍数太大，
 * 双线性插值会把像素边缘拉成方块，看着就是**马赛克**，不是"模糊"。
 *
 * 三个不能用的做法：
 *   ❌ CSS `filter: blur()` —— html2canvas **不渲染 filter**，导出会整层丢掉；
 *   ❌ `backdrop-filter` —— 同样不渲染；
 *   ❌ 只靠径向渐变 —— 那是"色晕"不是"模糊"。
 *
 * 正确做法：**在 canvas 里真的做一次高斯模糊，再把结果当作一张图片用**。
 *   · 采样 320×320（足够大，放大倍数只有 ~1.3 倍，不会有像素块）；
 *   · 用 canvas 自己的滤镜 `ctx.filter = 'blur(Npx)'` —— 注意这是 **Canvas2D 的滤镜**，
 *     不是 CSS 滤镜，它作用在绘制结果上，产出的是**已经糊掉的位图**，
 *     所以导出时 html2canvas 只是在画一张普通图片，完全认得；
 *   · 兜底：个别浏览器不支持 `ctx.filter`（赋值后读回为空）→ 退回"多次降采样再升采样"
 *     的乒乓法（每级 1/2 缩小再放大，等效低通），也不会出马赛克。
 */
const bgUrl = ref('');

/** 不支持 ctx.filter 时的兜底：乒乓降采样（逐级 1/2 缩小到 1/16，再逐级放大回来） */
function blurByPingPong(ctx, img, S, cover) {
  let cur = document.createElement('canvas');
  cur.width = S;
  cur.height = S;
  const c0 = cur.getContext('2d');
  c0.drawImage(img, (S - cover.w) / 2, (S - cover.h) / 2, cover.w, cover.h);
  const steps = [];
  let size = S;
  while (size > 8) {
    size = Math.max(8, Math.round(size / 2));
    const next = document.createElement('canvas');
    next.width = size;
    next.height = size;
    next.getContext('2d').drawImage(cur, 0, 0, size, size);
    steps.push(next);
    cur = next;
  }
  // 从最小的一级逐级放大回去（每级都用双线性插值 → 累积成柔和渐变）
  for (let i = steps.length - 2; i >= 0; i -= 1) {
    const target = steps[i];
    const tctx = target.getContext('2d');
    tctx.clearRect(0, 0, target.width, target.height);
    tctx.drawImage(cur, 0, 0, target.width, target.height);
    cur = target;
  }
  ctx.drawImage(cur, 0, 0, S, S);
}

async function buildBlurBg() {
  const url = champion.value?.artworkUrl;
  if (!url) return;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('load'));
      img.src = url;
    });
    // 采样尺寸要够大：太小（56）放大后就是马赛克
    const S = 320;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');
    // cover 语义：按短边裁切后铺满（等比，不留白）
    const scale = Math.max(S / img.naturalWidth, S / img.naturalHeight);
    const cover = { w: img.naturalWidth * scale, h: img.naturalHeight * scale };
    // ① 优先用 canvas 滤镜做真高斯模糊
    // ⚠️ 过扫（overscan）：模糊会把边缘采样到画布外变成透明，
    //    所以先按 1.18 倍画大一圈，让"虚掉的边"落在画布之外，成图上就不会有渐隐白边。
    const OS = 1.18;
    const bw = cover.w * OS;
    const bh = cover.h * OS;
    ctx.filter = `blur(${Math.round(S / 9)}px)`;
    const supported = typeof ctx.filter === 'string' && ctx.filter !== 'none';
    if (supported) {
      ctx.drawImage(img, (S - bw) / 2, (S - bh) / 2, bw, bh);
      ctx.filter = 'none';
    } else {
      // ② 兜底：乒乓降采样
      ctx.filter = 'none';
      blurByPingPong(ctx, img, S, cover);
    }
    bgUrl.value = c.toDataURL('image/jpeg', 0.86);
  } catch {
    // 取不到（CORS / 网络）就退回纯色渐变底 —— 卡片依然可读，只是少了虚化层
    bgUrl.value = '';
  }
}

async function load() {
  loading.value = true;
  try {
    data.value = await battleApi.result(id);
    // 取色与模糊底都是异步的：先把卡片渲出来，好了自动更新
    if (champion.value) {
      ensureAlbumAccent(champion.value);
      buildBlurBg();
    }
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
    data.value = null;
  } finally {
    loading.value = false;
  }
}

async function download() {
  if (!cardEl.value) return;
  exporting.value = true;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const targetW = 1080;
    const scale = Math.max(2, targetW / cardEl.value.offsetWidth);
    /**
     * ⚠️ 导出前把圆角去掉（临时类），导完再还原。
     * 原因：html2canvas 用 `backgroundColor` 填透明像素，圆角那四个角会被填成底色，
     * 在成图上就是"卡片外面套了一圈浅色边框"，很显脏。
     * 去掉圆角后渐变铺满整张画布 —— 成图是干净的长方形，发到聊天软件里本来也是矩形。
     */
    cardEl.value.classList.add('flat-export');
    let canvas;
    try {
      canvas = await html2canvas(cardEl.value, {
        scale,
        // ⚠️ 必须实心底色：透明底发到微信/QQ 会被压成黑底
        backgroundColor: isAligned.value ? '#f7fbfe' : '#062130',
        useCORS: true,
        logging: false,
      });
    } finally {
      cardEl.value.classList.remove('flat-export');
    }
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = isAligned.value
      ? `音格对位赛分享图-${id}.png`
      : `音格-夺冠之路-${champion.value?.name || '冠军'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    ElMessage.success('已保存到本地');
  } catch (err) {
    ElMessage.error('导出失败：' + (err?.message || '请稍后重试'));
  } finally {
    exporting.value = false;
  }
}

async function copyLink() {
  const url = `${location.origin}/battle/${id}`;
  try {
    await navigator.clipboard.writeText(url);
    ElMessage.success('链接已复制');
  } catch {
    ElMessage.info(url);
  }
}

onMounted(load);
</script>

<style scoped>
.share {
  padding-bottom: var(--sp-7);
}
.sub {
  font-size: 14px;
  margin-top: 6px;
}
.state {
  margin: var(--sp-8) auto;
  padding: var(--sp-6);
  max-width: 560px;
  text-align: center;
}
/* ⚠️ 原来 `.sharewrap` 在全局样式里**根本没定义** —— 两个子块退化成上下堆叠，
   分享卡被拉成整屏宽、3:4 的大块（用户："分享页面布局乱 / 拉这么长"）。
   这里补成「左卡右设置」两栏 + 两边距离约束（守则第 73 条）。 */
.sharewrap {
  display: grid;
  grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
  gap: 28px;
  align-items: start;
  max-width: 1120px;
  margin: 20px auto 0;
}
.sharewrap .scard {
  max-width: 420px;
}
@media (max-width: 900px) {
  .sharewrap {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .sharewrap .scard {
    max-width: 420px;
    margin: 0 auto;
  }
}
.scard.square {
  aspect-ratio: 1 / 1;
}
/**
 * 方形图的版式（2026-09-22 按用户给的草图重排）
 * ------------------------------------------------------------
 * 用户原话："方形图你应该参考我这个图里这样把冠军做大方中间，然后其他专辑在下面"，
 * 草图红框分上下两块：上半＝★冠军★ + 封面 + 名称 + 艺人·年份（居中做大），
 * 下半＝其他专辑缩略图一排 + 轮次路径。
 * ⚠️ 之前方形版只是"把竖版压扁 + 缩小封面"，冠军不够大、对手缩略图也太小，
 *    看起来就是"竖版缩了一下"，而不是为方形单独设计的版式。
 * 好在 DOM 顺序本来就是 冠军 → 对手 → 统计，所以这里**只调尺寸与间距**，不动结构。
 */
.scard.square {
  padding: 14px 18px 12px;
}
.scard.square .stop {
  font-size: 12px;
  letter-spacing: 1.2px;
}
.scard.square .stitle {
  font-size: 12.5px;
  margin-top: 1px;
}
.scard.square .smain {
  gap: 4px;
  /* 内容万一算多了，宁可裁掉最后一行也不要撑破卡片（卡片本身 overflow:hidden） */
  overflow: hidden;
}
/* ⚠️ 2026-09-22 实测发现：方形卡里内容比可用高度**多出 16px**，
   结果 `.roundline`（「半决赛 → 决赛」那一行）被 `.smain` 的 overflow:hidden 裁掉了 ——
   量出来 smain 可见高 319、内容高 335，轮次行落在 357 之外，用户看到的就是"轮次路径不见了"。
   修法：把方卡里的几处尺寸各收一点（合计约 21px），让整块真的放得下。
   为什么不靠"再裁一点"兜底：轮次路径是这张图的信息之一，不能靠裁掉它来"看起来没问题"。 */
.scard.square .crown {
  font-size: 13px;
  letter-spacing: 2px;
  margin: 0;
}
/* 冠军封面：**按宽度定尺寸**（width + 基类的 aspect-ratio:1 自动出高）。
   为什么不用 height:46%：百分比高度要相对 .smain 的定高来解析，
   而 .smain 是 flex:1 —— 高度不定，浏览器会退回 auto，量出来的占比只有 28%，
   用户要的"冠军做大"根本没生效。改成定宽度就完全确定了：
   smain 宽 384 → 46% = 177px，占 420 高的方形卡 42%。 */
.scard.square .smain .art {
  width: 46%;
  height: auto;
  /* ⚠️ 必须关掉 flex 收缩：.smain 是列向 flex，内容一多就会把封面**压缩**，
     压到量出来只有卡高的 34%（用户要的"冠军做大"就没生效）。
     关掉收缩后由布局自己让位，封面尺寸完全由 width 决定。 */
  flex: 0 0 auto;
}
.scard.square .cname {
  font-size: 23px;
  line-height: 1.15;
  margin-top: 0;
}
.scard.square .cartist {
  font-size: 12.5px;
  margin-top: 0;
}
/* 其他专辑：一排缩略图，做成"小相框"更好认 */
.scard.square .spath {
  gap: 7px;
}
.scard.square .spath div {
  width: 36px;
  height: 36px;
  border-radius: 9px;
}
.scard.square .roundline {
  font-size: 12px;
}
.scard.square .sfoot {
  font-size: 12px;
  margin-top: 4px;
  padding-top: 6px;
}
/* 分享链接：这一行在**导出的卡片里**，所以绝不能用 text-overflow: ellipsis ——
   html2canvas 遇到需要截断的文本会把字**水平压扁**（用户报的"分享图文字有问题"）。
   改成允许换行（链接本来就没有空格，用 break-all 断开）。 */
.sharel {
  max-width: 52%;
  word-break: break-all;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.85;
}
.roundline {
  font-size: 12px;
  opacity: 0.7;
  text-align: center;
}
.cap {
  font-size: 13px;
  color: var(--text3);
  text-align: center;
  margin-top: 10px;
}
/* 导出瞬间临时挂上的类：去掉圆角，让渐变铺满画布（否则成图会套一圈浅色边框） */
.flat-export,
.flat-export::before,
.flat-export::after {
  border-radius: 0 !important;
}
.btns {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}
</style>
