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
 * 模糊底图（2026-09-21 用户："这背景取色和模糊效果还是没做出来啊"）
 * ------------------------------------------------------------
 * 想要的是"封面放大、虚化成底"的液态玻璃质感。三个不能用的做法：
 *   ❌ CSS `filter: blur()` —— html2canvas **不渲染 filter**，导出会整层丢掉；
 *   ❌ `backdrop-filter` —— 同样不渲染；
 *   ❌ 只靠径向渐变 —— 那是"色晕"不是"模糊"，用户一眼就看出来没做。
 * 能同时满足"页面里好看 + 导出也在"的唯一做法：
 *   把封面先画到一张**很小的 canvas**（56×56），再让 CSS 把它**放大铺满整张卡** ——
 *   双线性插值放大本身就是模糊，而且是像素运算，导出工具完全认得（它就是画一张图）。
 * 56px 的小图 dataURL 只有 ~2KB，几乎不增加导出耗时。
 */
const bgUrl = ref('');

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
    const S = 56;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');
    // 先铺一层黑底：有些封面带透明通道，直接画会出现"透出卡片深底"的脏边
    ctx.fillStyle = '#04121d';
    ctx.fillRect(0, 0, S, S);
    // cover 语义：按短边裁切后铺满（等比，不留白）
    const scale = Math.max(S / img.naturalWidth, S / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
    bgUrl.value = c.toDataURL('image/jpeg', 0.82);
  } catch {
    // 取不到（CORS / 网络）就退回纯色渐变底 —— 卡片依然可读，只是少了模糊层
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
 * 方形图的硬伤兜底（2026-09-18）：封面原来是"按卡宽 58%"定尺寸的，
 * 换成 1:1 方卡后这个宽度对应的封面高度超出了可用高度，被 `overflow:hidden` 硬裁掉半张 ——
 * 用户的原话是"你这方形图就纯粹裁剪一下，把信息都搞没了"。
 * 这里改成**按高度定尺寸**（height:38% + aspect-ratio 自动出宽），封面就完整了。
 */
.scard.square .smain .art {
  width: auto;
  height: 38%;
}
.scard.square .smain {
  gap: 8px;
}
.scard.square .cname {
  font-size: 22px;
}
.scard.square .spath div {
  width: 26px;
  height: 26px;
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
