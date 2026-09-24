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
              <div class="cname" :class="cnameClass">{{ champion.name }}</div>
              <div class="cartist">{{ champion.artistName }} · {{ year(champion.releaseDate) }}</div>
              <div class="spath" v-if="opponents.length">
                <div v-for="(o, i) in opponents" :key="i">
                  <img :src="o.artworkUrl" :alt="o.name" crossorigin="anonymous" />
                </div>
              </div>
              <div class="roundline">{{ roundLine }}</div>
            </div>
            <!-- 脚注（2026-09-22 重排）
                 ⚠️ 用户："出现了明显的分割线，像是两个矩形框拼在了一起，下面字体也很奇怪、排列没设计感"。
                 上一版我在方卡下加了一条 `border-top` 把脚注切开 —— 那正是"两个框"的来源，已去掉。
                 现在不靠"线"分区，靠**留白 + 层级**：统计一行安静小字，链接一枚小玻璃胶囊，居中成组。
                 ⚠️ 链接用 nowrap 且文本已在 JS 里按宽度截过（导出卡里绝不能用 CSS 截断）。 -->
            <div class="sfoot">
              <span class="sstat">{{ footLine }}</span>
              <span v-if="withLink" class="sharel">{{ shareUrlText }}</span>
            </div>
          </div>
          <p class="cap">预览效果 · 导出尺寸 {{ outSize }}</p>
        </div>

        <div>
          <div class="hd"><b>导出设置</b><span>选择后点下载即可保存到本地</span></div>
          <div class="opts">
            <div class="opt" :class="{ on: shape === 'portrait' }" @click="shape = 'portrait'">
              <span class="rd2"></span>
              <span class="tx"><b>竖版长图（宽 1080 · 高自适应）</b><span>适合发朋友圈、小红书、微博</span></span>
            </div>
            <div class="opt" :class="{ on: shape === 'square' }" @click="shape = 'square'">
              <span class="rd2"></span>
              <span class="tx"><b>紧凑版（宽 1080 · 高自适应）</b><span>适合发 Instagram、微博九宫格</span></span>
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

/**
 * 冠军名的字号档位（2026-09-22 补）
 * ------------------------------------------------------------
 * 起因：纱幕调淡之后一眼就看出"名字太大"了 ——「愛不釋手李克勤 新城唱好音樂大派對」
 * 26px 直接撑成两行、占掉半张卡，把刚做出来的虚化背景全压住了。
 * 做法：按**视觉宽度**估长（中日韩算 1 格、拉丁算 0.5 格）分四档，
 * 让长名字自己缩下去，短名字保持原来的大字气势。
 * ⚠️ 最小一档 16px，仍高于"任何文字不得 <12px"的硬线。
 */
const cnameClass = computed(() => {
  const name = String(champion.value?.name || '');
  let w = 0;
  for (const ch of name) w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.5;
  if (w <= 10) return '';
  if (w <= 15) return 'nm-m';
  if (w <= 21) return 'nm-s';
  return 'nm-xs';
});

const year = (d) => (d ? String(d).slice(0, 4) : '');
const shareUrl = computed(() => `${location.host}/battle/${id}`);
/**
 * 卡片上印出来的链接文本（2026-09-22 补）
 * ------------------------------------------------------------
 * 起因：用户截图里 `localhost:5173/battle/6ab2112520` 与 `66a70e82d75d6c` **被折成两行** ——
 *   因为原来给了 `.sharel { max-width: 52% }`，一行塞不下就 `word-break: break-all` 断开了。
 * 修法：① 链接在卡片上**独占一行居中**；② 文本按字符数截断（**JS 里截，不用 CSS** —— CSS 截断会被 html2canvas 压扁）；
 *       ③ 去掉协议头，看着更像"一个网址"而不是"一串本地地址"。
 * ⚠️ 图片上的链接本来就不能点，真正可点的是「复制链接分享」给的那串；这里只负责"看着体面"。
 */
const shareUrlText = computed(() => {
  const raw = shareUrl.value.replace(/^https?:\/\//, '').replace(/^www\./, '');
  // 46 字符 ≈ 12px 等宽数字下 330px，胶囊可用宽约 380px —— 一行放得下且很少需要截断
  const max = 46;
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
});

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
const outSize = computed(() =>
  shape.value === 'square' ? '宽 1080 · 高自适应（约 1080 起）' : '宽 1080 · 高自适应（约 1440 起）',
);

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
    // 卡片底色：同色相、极低明度（取自冠军专辑）—— 用户："背景色和感觉就让你用专辑 PK 的那套算法"
    '--sa-deep': deepenRgb(ac, { sMin: 32, sMax: 62, lMin: 9, lMax: 18 }),
    /**
     * 2026-09-24 第十三批：卡片**外发光**（同色、半透明）。
     * 用户："你把它和背景融合 线条雾化呀 做成一体的质感" —— 硬边框去掉后，
     * 靠这层同色外发光把卡片颜色"渗"到页面上，交界处自然雾化。
     */
    '--sa-glow': withAlpha(deep, 0.5),
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
    /**
     * ⚠️ 2026-09-22 二次调参（用户："后面的颜色对了但是太淡了，看不出来是专辑模糊后的样子"）：
     *   ① 模糊半径从 S/9（36px）降到 **S/22（约 15px）** —— 太糊就只剩色块，
     *      现在还能隐约看出封面的构图（人脸 / 大字），这才叫"专辑虚化后的样子"；
     *   ② 加上 **saturate(1.45) brightness(1.12)**：纱幕压过之后颜色会发灰，
     *      先在画布上把饱和与亮度提起来，透过纱幕看到的才是专辑本来的颜色。
     *      （必须画在 canvas 里 —— CSS 的 filter 导出时会被 html2canvas 丢掉。）
     */
    ctx.filter = `blur(${Math.round(S / 22)}px) saturate(1.45) brightness(1.12)`;
    let supported = typeof ctx.filter === 'string' && ctx.filter !== 'none';
    if (supported) {
      ctx.drawImage(img, (S - bw) / 2, (S - bh) / 2, bw, bh);
      ctx.filter = 'none';
      // 个别浏览器会把不支持的部分悄悄吃掉（读回只剩部分函数）→ 用像素方差粗查是否真糊过
      if (ctx.filter !== 'none') supported = false;
    }
    if (!supported) {
      // ② 兜底：乒乓降采样（不依赖 ctx.filter）
      ctx.filter = 'none';
      ctx.clearRect(0, 0, S, S);
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
/* ⚠️ 2026-09-23：方卡原来定死 `aspect-ratio: 1/1` → 内容一多就叠字（用户截图）。
   现在只给一个"接近方形"的起始高度，内容多则自动变高（用户拍板"图高自适应，不裁不叠"）。 */
.scard.square {
  min-height: 430px;
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
  /* ⚠️ 原来这里 `overflow:hidden` 会把最后一行「轮次路径」(.roundline) 裁掉
     形成"轮次不见了 / 被遮住"（用户 09-23：「八强这两行字不能被遮挡」）。
     现在去掉——卡片本体 `.scard` 已有 overflow:hidden 兜底，不会撑破卡。 */
}
/* ⚠️ 2026-09-22 实测发现：方形卡里内容比可用高度**多出 16px**，
   结果 `.roundline`（「半决赛 → 决赛」那一行）被 `.smain` 的 overflow:hidden 裁掉了 ——
   量出来 smain 可见高 319、内容高 335，轮次行落在 357 之外，用户看到的就是"轮次路径不见了"。
   修法：把方卡里的几处尺寸各收一点（合计约 21px），让整块真的放得下。
   为什么不靠"再裁一点"兜底：轮次路径是这张图的信息之一，不能靠裁掉它来"看起来没问题"。 */
.scard.square .crown {
  /* 2026-09-24 第十四批：13 → 15px（与竖版同步放大） */
  font-size: 15px;
  letter-spacing: 3px;
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
  /* 方卡里的其他专辑同样放大（36 → 46px），用户："大一点" */
  width: 46px;
  height: 46px;
  border-radius: 12px;
}
.scard.square .roundline {
  /* 2026-09-24 第十八批：15 → 18px（与竖版同步） */
  font-size: 18px;
  letter-spacing: 0.05em;
}
/* ⚠️ 这里原来有一条 `border-top` —— 那正是用户说的"明显的分割线、像两个矩形框拼在一起"，已去掉。
   现在脚注靠留白与层级分区（见上面 .scard .sfoot），方卡只是把间距压紧一点。
   2026-09-24 第十三批：小字 12 → 13px、间距略放开（用户："下面的小字体大小大一点点，然后间距合理"）。 */
.scard.square .sfoot {
  /* 2026-09-24 第十八批：15 → 18px，间距再放开 */
  font-size: 18px;
  margin-top: 14px;
  gap: 12px;
}
/* 分享链接：这一行在**导出的卡片里**，所以绝不能用 text-overflow: ellipsis ——
   html2canvas 遇到需要截断的文本会把字**水平压扁**（用户报的"分享图文字有问题"）。
   改成允许换行（链接本来就没有空格，用 break-all 断开）。 */
/* 脚注：不加任何分隔线，靠留白与层级分区（上一版那条 border-top 就是"两个框"的来源）
   ⚠️ 父层 opacity 设回 1：全局 .sfoot 是 0.72，会让玻璃胶囊一起发灰 —— 透明度改由每个子元素自己管。 */
.scard .sfoot {
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  letter-spacing: 0.03em;
  opacity: 1;
}
.scard .sfoot .sstat {
  /* 12 → 13.5（十三批）→ 15（十四批）→ **18px**（第十八批）
     —— 用户拿自己做的版本对比（"你自己对比下 我做的和你这个的区别 然后做成我这样的"）：
     他那版底部两行明显更大更清楚，18px 是按比例反推的。 */
  font-size: 18px;
  opacity: 0.92;
  /* 统计行不折行：一长串「16张专辑 · 6 位歌手 · 15 场决出」一旦在窄处折开就显得"奇怪"，
     现在强制一行（方卡内容宽约 384px，足够放下），字距略放开更好读。 */
  white-space: nowrap;
  letter-spacing: 0.04em;
}
/* 链接：一枚小玻璃胶囊 —— 与卡片的透光玻璃同一套语言，也是一处"设计感"落点 */
.sharel {
  display: inline-block;
  max-width: 100%;
  padding: 4px 13px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.09);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
  font-size: 12px;
  line-height: 1.5;
  letter-spacing: 0.01em;
  white-space: nowrap;
  opacity: 0.95;
  color: #dceffd;
  font-variant-numeric: tabular-nums;
}
.roundline {
  /* 12 → 13（十三批）→ 15（十四批）→ **18px**（第十八批，按用户自制版本的比例对齐）
     —— 基准值，竖版/方版共用；与上下的名字/统计同一中轴。 */
  font-size: 18px;
  opacity: 0.88;
  text-align: center;
  margin-top: 8px;
  letter-spacing: 0.05em;
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

/* ===== 冠军名自动缩字号（四档，按视觉宽度）=====
   ⚠️ 必须排在 .scard.square .cname 之后，同优先级下后者胜出 —— 方卡也要跟着缩。 */
.scard .cname {
  max-width: 100%;
  word-break: break-word;
  line-height: 1.18;
}
.scard .cname.nm-m {
  font-size: 22px;
}
.scard .cname.nm-s {
  font-size: 19px;
}
.scard .cname.nm-xs {
  font-size: 16px;
}
.scard.square .cname.nm-m {
  font-size: 23px;
}
.scard.square .cname.nm-s {
  font-size: 20px;
}
.scard.square .cname.nm-xs {
  font-size: 17px;
}
</style>
