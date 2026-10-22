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
            :class="{ square: shape === 'square', 'with-link': shape === 'square' && withLink }"
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
              <span class="tx"><b>竖版长图（1080 × 高自适应）</b><span>适合发朋友圈、小红书、微博</span></span>
            </div>
            <div class="opt" :class="{ on: shape === 'square' }" @click="shape = 'square'">
              <span class="rd2"></span>
              <span class="tx"><b>方形图（1080 × 1080）</b><span>适合发 Instagram、微博九宫格</span></span>
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { battleApi } from '@/api';
import { ROUND_CN } from '@/utils/tournament.js';
import { accentStyleOf, ensureAlbumAccent, withAlpha, deepenRgb } from '@/utils/coverColor.js';
import AlignedMiniCard from '@/components/AlignedMiniCard.vue';
import { exportAndSave } from '@/utils/saveImage.js';

const route = useRoute();
const id = route.params.id;

const loading = ref(true);
const exporting = ref(false);
const data = ref(null);
const cardEl = ref(null);

const shape = ref('portrait');
const withLink = ref(false);
/** 链接最多印几个字（由 fitLinkText 按卡片实际宽度实测决定，见下方） */
const linkCap = ref(46);

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
  // ⚠️ 2026-10-22 第六十二批：46 是**桌面卡（420）**的可用长度；手机卡只有 272~342，
  //    写死 46 会顶出胶囊（用户截图里链接露在卡外）。现在由 `fitLinkText()` 按实测宽收字。
  const max = Math.max(18, linkCap.value);
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
});

/**
 * 按**实际可用宽度**决定链接印多少字（2026-10-22 第六十二批）
 * ------------------------------------------------------------
 * 起因：方卡最窄只有 272px，而链接一行 46 字符 ≈ 330px ⇒ 胶囊被卡片右边裁掉。
 * 做法：量 `scrollWidth / clientWidth`，按比例收字符数，最多迭代 4 次（每次等一帧）。
 * ⚠️ 必须用 JS 收字符，**不能用 CSS `text-overflow: ellipsis`**：
 *    导出链路（html2canvas / SVG 克隆）遇到 CSS 截断会把字**水平压扁**（第 55 批的坑）。
 */
async function fitLinkText() {
  const get = () => (cardEl.value?.querySelector ? cardEl.value.querySelector('.sharel') : null);
  if (!get()) { linkCap.value = 46; return; }
  let cap = 46;
  linkCap.value = 46;
  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await nextTick();
    const el = get();
    if (!el) return;
    const avail = el.clientWidth;
    const need = el.scrollWidth;
    if (!avail || need <= avail + 1) return;
    cap = Math.max(18, Math.floor(cap * (avail / need)) - 2);
    linkCap.value = cap;
    if (cap <= 18) return;
  }
}

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
  shape.value === 'square' ? '1080 × 1080（严格 1:1）' : '宽 1080 · 高自适应（约 1440 起）',
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
    /**
     * ⭐ 2026-10-21 第五十八批：**过扫（overscan）改在画布里做**
     * ------------------------------------------------------------
     * 原来靠 CSS `.scard .sbg { transform: scale(1.16) }` 把"模糊溢出的边"推出可视区。
     * 但导出是「克隆 → 内联 computed style → 塞进 SVG 画成图」，
     * **transform 在克隆树里最容易出偏差**（用户截图里那张竖版分享图：封面没了、
     * 原地留一块灰色的圆角方块 —— 正是背景层被缩放/偏移后的残影）。
     * ⇒ 把 1.18 倍过扫直接画进 canvas，`.sbg` 不再有 transform：
     *   页面看起来一模一样，导出时少一个会出错的变量。
     */
    const OS = 1.18;
    const scale = Math.max(S / img.naturalWidth, S / img.naturalHeight) * OS;
    const cover = { w: img.naturalWidth * scale, h: img.naturalHeight * scale };
    // ① 优先用 canvas 滤镜做真高斯模糊
    // ⚠️ 过扫（overscan）：模糊会把边缘采样到画布外变成透明，
    //    所以先按 1.18 倍画大一圈，让"虚掉的边"落在画布之外，成图上就不会有渐隐白边。
    /**
     * ⚠️⚠️ 2026-10-18 第五十二批：**模糊不再依赖 `ctx.filter`**
     * ------------------------------------------------------------
     * 用户真机实测："为什么我手机上实测还是没有模糊背景"（截图里背景是**清晰的专辑封面**）。
     * 根因：`ctx.filter` 在移动端（尤其 iOS Safari 的部分版本 / 微信内置浏览器）
     *   对 `drawImage` **可能不生效，但也完全不报错** —— 上一版只判断
     *   `typeof ctx.filter === 'string'`（赋值后读回还是原字符串）⇒ 误判"支持"，
     *   结果就是**原图直接画上去，一点没糊**。
     *   ⇒ 改成：**乒乓降采样为主路径**（纯 canvas API，全平台可靠），
     *     `ctx.filter` 只作为额外增强（支持时再叠一层，不支持也已模糊）。
     * 质量：320 → 逐级 1/2 → 约 20px → 逐级放大，等效低通，不会出马赛克。
     */
    // ① 主路径：乒乓降采样（可靠，不需要任何滤镜支持）
    ctx.filter = 'none';
    blurByPingPong(ctx, img, S, cover);
    // ② 增强：如果这个环境真的支持 ctx.filter，再叠一层轻度 blur + 提饱和/亮度
    //    （只影响"更细腻"这一档，失败也不影响主体模糊）
    try {
      const probe = document.createElement('canvas').getContext('2d');
      probe.filter = 'blur(2px)';
      if (probe.filter === 'blur(2px)') {
        const enh = document.createElement('canvas');
        enh.width = S;
        enh.height = S;
        const ectx = enh.getContext('2d');
        ectx.filter = `blur(${Math.round(S / 40)}px) saturate(1.45) brightness(1.12)`;
        ectx.drawImage(c, 0, 0);
        ctx.clearRect(0, 0, S, S);
        ctx.drawImage(enh, 0, 0);
      }
    } catch {
      /* 增强失败无所谓，主路径已经把图糊了 */
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

/**
 * 保存分享图（2026-10-17 第四十五批：改为调用共享工具）
 * ------------------------------------------------------------
 * ⚠️ 为什么改成共享调用：第四十四批把这套"移动端友好的导出+下载"内联写在这里，
 *   结果**漏了另外 3 个导出入口**（人格结果页 / 保存晋级图 / 保存详细战报）。
 *   用户真机实测（iOS，官方+第三方浏览器）："显示下载到本地了 但是我实测没有"。
 *   这正是项目规矩说的"改一处改全部引用" ⇒ 抽成 utils/saveImage.js，四处统一调用。
 */
async function download() {
  await exportAndSave(
    cardEl.value,
    isAligned.value
      ? `音格对位赛分享图-${id}.png`
      : `音格-夺冠之路-${champion.value?.name || '冠军'}.png`,
    // flatten: true —— 导出时去掉圆角，消除成图四角的黑边（2026-10-18 真机反馈）
    { exporting, flatten: true, bg: isAligned.value ? '#f7fbfe' : '#062130' },
  );
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

/**
 * 卡片宽度一变（切方形 / 勾链接 / 改窗口大小）就重算链接能印多少字。
 * ⚠️ 必须等 DOM 更新完（nextTick）再量，否则量到的是上一版宽度。
 */
watch([shape, withLink], async () => {
  linkCap.value = 46;
  await nextTick();
  await fitLinkText();
});

let rzTimer = 0;
function onResize() {
  clearTimeout(rzTimer);
  rzTimer = setTimeout(() => { linkCap.value = 46; fitLinkText(); }, 160);
}

onMounted(async () => {
  await load();
  await nextTick();
  await fitLinkText();
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  clearTimeout(rzTimer);
  window.removeEventListener('resize', onResize);
});
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
/* 平板及以下（≤1024）：分享页改单列（原 900） */
@media (max-width: 1024px) {
  .sharewrap {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }
  .sharewrap .scard {
    max-width: 420px;
    margin: 0 auto;
  }
}
/* ⚠️ 2026-09-23：方卡原来定死 `aspect-ratio: 1/1` → 内容一多就叠字（用户截图）。
   现在只给一个"接近方形"的起始高度，内容多则自动变高（用户拍板"图高自适应，不裁不叠"）。 */
/* ⭐⭐⭐ 2026-10-18 第五十批：**方形版＝竖版同一套版式，只有比例不同**
   ------------------------------------------------------------
   用户原话（强烈反对第四十八批的做法）：
     "谁让你把方形图改成这种布局的，方形图不管是手机还是电脑都用之前那个。
      方形和竖版唯一的区别就是比例 而不是里面完全变了"
     "你绝对不能擅自改变已经完美的设计语言"
   ⇒ 第四十八批那套"两栏 Grid"已整个回退（git checkout 到第四十七批）。
     这里只做**一件事**：把比例锁成 1:1。
     为了让它真的成立，配合把间距/封面**极小幅收紧**（不改结构、不改元素顺序、不改配色），
     否则内容比 1:1 高出 27px，卡片会被撑回 0.93（又变成"没区别"）。
   ⚠️ 若内容再变多，`min-height: 0` 也挡不住撑高 —— 届时宁可比例略大于 1，绝不裁字。 */
.scard.square {
  /* ⚠️⚠️ 2026-10-18 第五十一批：**不用 aspect-ratio**（否则必然裁字）
     ------------------------------------------------------------
     用户真机实测（方形图）：底部「8 强 → 半决赛 → 决赛」「16 张专辑…」被裁掉。
     三种写法都试过并实测：
       · `min-height: 0`           → 钉死 342，内容溢出 220px（裁得最狠）
       · `min-height: auto`        → 对非 flex/grid 子项等于 0，同样钉死 342（还是裁）
       · `min-height: fit-content` → 在 `overflow:hidden` 的卡片上**也不生效**（实测仍 342）
     根因：`.scard` 是 `overflow: hidden`，`aspect-ratio` 一旦定死高度，
          多出来的内容只会被裁，不会撑开。
     ⇒ **放弃严格的 aspect-ratio**，改用 `min-height` 表达"方形起步"：
       宽度由布局决定（与竖版相同），高度至少 430px、内容多了自动变高。
       与竖版的区别：**高度明显更矮**（约 0.8 vs 0.70 宽高比），且**一个字都不裁**。
     ⚠️ 若以后要严格 1:1，必须**把卡片内容整体缩小约 17%**（字号/封面/间距一起），
        那会改变"版式观感"——需要用户拍板，不能自己动。 */
  /* ⚠️⚠️ 2026-10-20 第五十四批：**方形图改成严格 1:1，且全平台一致**
     用户实测（手机端）："方形图和竖形图只在长的比例上有区别，它的宽的比例是一样的，
     这是非常不对的"。
     实测确认：改前 `min-height: 430px` 是**写死的绝对高度**，而卡片宽度随布局变
     （手机 342 / 桌面 420）⇒ 手机 342×430 = **0.795**（根本不够方）、
     桌面 420×442 = **0.950**（勉强像方）⇒ 两端不一致，手机尤其不对。
     修法：`aspect-ratio: 1/1`（高度由宽度推出 ⇒ 任何宽度下都是正方）
          + `--sqk` 把方形版结构尺寸整体缩一档（内容必须装得进 1:1，否则溢出会被裁）。
          字号带 **12px 下限**（`max(12px, …)`，守则"任何文字 ≥12px"不可谈判）。
     ⚠️ 仍不裁字：`--sqk` 留了余量（桌面 0.90 / 手机 0.74），
         并由 probe 逐条断言"每个文字元素都在卡内"。 */
  aspect-ratio: 1 / 1;
  min-height: 0;
  /* 方形版结构缩放系数：桌面 0.90 / 手机 0.74（见下方 @media） */
  --sqk: 0.9;
  padding: 12px 18px 10px;
}
@media (max-width: 640px) {
  .scard.square {
    --sqk: 0.74;
  }
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
  padding: calc(14px * var(--sqk)) calc(18px * var(--sqk)) calc(12px * var(--sqk));
}
.scard.square .stop {
  font-size: max(12px, calc(12px * var(--sqk)));
  letter-spacing: max(0.6px, calc(1.2px * var(--sqk)));
}
.scard.square .stitle {
  font-size: max(12px, calc(12.5px * var(--sqk)));
  margin-top: 1px;
}
.scard.square .smain {
  /* 2026-10-18 第五十批：4 → 3px（方卡锁 1:1 需微收一点才装得下，版式不变） */
  gap: max(2px, calc(3px * var(--sqk)));
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
  font-size: max(13px, calc(15px * var(--sqk)));
  letter-spacing: max(1.5px, calc(3px * var(--sqk)));
  margin: 0;
}
/* 冠军封面：**按宽度定尺寸**（width + 基类的 aspect-ratio:1 自动出高）。
   为什么不用 height:46%：百分比高度要相对 .smain 的定高来解析，
   而 .smain 是 flex:1 —— 高度不定，浏览器会退回 auto，量出来的占比只有 28%，
   用户要的"冠军做大"根本没生效。改成定宽度就完全确定了：
   smain 宽 384 → 46% = 177px，占 420 高的方形卡 42%。 */
.scard.square .smain .art {
  /* 2026-10-18 第五十批：46% → 42%。方卡锁 1:1 后可用高变紧，
     封面微收一档才装得下（版式、顺序、配色全不变，只是略小）。
     2026-10-20 第五十四批：再乘 `--sqk` —— 严格 1:1 下封面是最大的纵向消费者。 */
  width: calc(42% * var(--sqk));
  height: auto;
  /* ⚠️ 必须关掉 flex 收缩：.smain 是列向 flex，内容一多就会把封面**压缩**，
     压到量出来只有卡高的 34%（用户要的"冠军做大"就没生效）。
     关掉收缩后由布局自己让位，封面尺寸完全由 width 决定。 */
  flex: 0 0 auto;
}
.scard.square .cname {
  font-size: max(14px, calc(23px * var(--sqk)));
  line-height: 1.15;
  margin-top: 0;
}
.scard.square .cartist {
  font-size: max(12px, calc(12.5px * var(--sqk)));
  margin-top: 0;
}
/* 其他专辑：一排缩略图，做成"小相框"更好认 */
.scard.square .spath {
  gap: max(4px, calc(7px * var(--sqk)));
  margin-top: max(4px, calc(10px * var(--sqk)));
}
.scard.square .spath div {
  width: calc(46px * var(--sqk));
  height: calc(46px * var(--sqk));
  border-radius: calc(12px * var(--sqk));
}
.scard.square .roundline {
  /* 2026-09-24 第十八批：15 → 18px（与竖版同步）；2026-10-11 第三十五批：18 → 16px（同竖版） */
  font-size: max(12px, calc(16px * var(--sqk)));
  letter-spacing: max(0.04em, calc(0.05em * var(--sqk)));
}
/* ⚠️ 这里原来有一条 `border-top` —— 那正是用户说的"明显的分割线、像两个矩形框拼在一起"，已去掉。
   现在脚注靠留白与层级分区（见上面 .scard .sfoot），方卡只是把间距压紧一点。
   2026-09-24 第十三批：小字 12 → 13px、间距略放开（用户："下面的小字体大小大一点点，然后间距合理"）。 */
.scard.square .sfoot {
  /* 2026-09-24 第十八批：15 → 18px；2026-10-11 第三十五批：18 → 16px（同竖版） */
  font-size: max(12px, calc(16px * var(--sqk)));
  margin-top: max(6px, calc(14px * var(--sqk)));
  gap: max(6px, calc(12px * var(--sqk)));
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
  /* 12 → 13.5（十三批）→ 15（十四批）→ 18（第十八批，按用户自制版比例反推）
     → **16px**（2026-10-11 第三十五批，与 .roundline 同步：用户要求"圈起来的文字缩小一点"）
     —— 两行必须同号，否则"16 强 → 8 强"和统计行会一大小，看着像两块东西。 */
  font-size: 16px;
  opacity: 0.92;
  /* 统计行不折行：一长串「16张专辑 · 6 位歌手 · 15 场决出」一旦在窄处折开就显得"奇怪"，
     现在强制一行（方卡内容宽约 384px，足够放下），字距略放开更好读。 */
  white-space: nowrap;
  letter-spacing: 0.04em;
  /* 同 .roundline：纱幕调淡后的可读性兜底（画在字形上，不是卡面加框） */
  text-shadow: 0 1px 3px rgba(2, 12, 20, 0.55), 0 0 12px rgba(2, 12, 20, 0.35);
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
/* ⭐⭐⭐ 2026-10-22 第六十二批：方形卡 + 「带上分享链接」＝ 脚注多一行，
   必须在 1:1 的盒子里把这一行"让"出来，否则链接会被卡底裁掉。
   ------------------------------------------------------------
   用户 10-22 截图：链接胶囊只露出上半截、被卡片下边缘切掉。
   实测（改前，`_r62-measure.mjs`）：
     · 桌面 420 卡：内容高 446，溢出 26px，链接底边在卡高 103.6% 处
     · 手机 342 卡：内容高 369，溢出 27px，链接底边 105.2%
     · 320 视口 272 卡：内容高 347，溢出 75px
   根因两条：
     ① `.sstat` 写死 16px、`.sharel` 写死 12px —— 方卡里这两个**不跟 `--sqk` 缩**；
     ② 封面是唯一能大幅让位的元素，但方卡里它按百分比定宽，没有"为链接让位"的逻辑。
   做法：
     ① 两行脚注改为跟着 `--sqk` 缩（仍守 12px 下限）；
     ② 封面占比 + 间距 + 脚注留白分四档收紧，每档都用探针实测留 ≥3px 余量；
     ③ 档位按**视口宽度**切换（本页卡片宽 = min(420, 视口 − 48)）：
        ≥448 → 38%（420 卡）｜≤447 → 32%（400~340 卡）
        ≤387 → 26%（340~300 卡）｜≤347 → 21%（<300 卡）
   ⚠️ 每一档都跑 `_r62-measure.mjs`（1440/1024/768/390/360/320 × 缩放 100/125/150%）。
   ⚠️ 极端窄屏（视口 <348）卡片给 `min-width` 保底：宁可预览区横向滚动，也不裁内容。
      导出仍是 1080×1080（`aspect-ratio` 没动）。 */
.scard.square .sfoot .sstat {
  font-size: max(12px, calc(16px * var(--sqk)));
}
.scard.square .sharel {
  font-size: max(12px, calc(12px * var(--sqk)));
  padding: 3px 10px;
  line-height: 1.4;
}
.scard.square.with-link .smain .art { width: calc(37% * var(--sqk)); }
.scard.square.with-link .smain { gap: max(2px, calc(3px * var(--sqk))); }
.scard.square.with-link .sfoot {
  margin-top: max(6px, calc(10px * var(--sqk)));
  gap: max(5px, calc(7px * var(--sqk)));
}
/* 胶囊别贴满整行：留出左右呼吸（否则手机上像一条横杠），由 JS 按这个宽度收字数 */
.scard.square.with-link .sharel { max-width: 92%; }
.scard.square.with-link .roundline { margin-top: max(3px, calc(6px * var(--sqk))); }

@media (max-width: 447px) {
  .scard.square.with-link .smain .art { width: calc(30% * var(--sqk)); }
  .scard.square.with-link { padding: 8px 11px 9px; }
  .scard.square.with-link .smain { gap: 1px; }
  .scard.square.with-link .sfoot { margin-top: 5px; gap: 4px; }
  .scard.square.with-link .roundline { margin-top: 2px; }
}
@media (max-width: 387px) {
  .scard.square.with-link .smain .art { width: calc(24% * var(--sqk)); }
  .scard.square.with-link { padding: 7px 10px 9px; }
  .scard.square.with-link .sfoot { margin-top: 4px; gap: 4px; }
  .scard.square.with-link .spath { margin-top: 2px; }
}
@media (max-width: 347px) {
  .scard.square.with-link .smain .art { width: calc(15% * var(--sqk)); }
  .scard.square.with-link { padding: 4px 7px 8px; min-width: 260px; }
  .scard.square.with-link .smain { gap: 0; }
  .scard.square.with-link .sfoot { margin-top: 2px; gap: 2px; }
  .scard.square.with-link .roundline { margin-top: 0; }
  .scard.square.with-link .spath { margin-top: 1px; }
}
/* 极窄时预览区允许横向滚动（卡片保底 260，不裁内容） */
@media (max-width: 347px) {
  .sharewrap { overflow-x: auto; }
}

.roundline {
  /* 12 → 13（十三批）→ 15（十四批）→ 18（第十八批）→ **16px**（2026-10-11 第三十五批）
     —— 用户看冠军结算卡："绿色圈起来的文字字体缩小一点"。
     18 是按他自制竖版反推的，但那两行压在卡底、字又大，整张卡显得很挤；
     16 是"看得清、又不跟冠军名抢"的一档（仍 ≥12px 下限）。
     ⚠️ 方版有独立覆盖（下面 `.scard.square .roundline`），改这里必须同步改那条。 */
  font-size: 16px;
  opacity: 0.88;
  text-align: center;
  margin-top: 8px;
  letter-spacing: 0.05em;
  /* 2026-10-11 第三十五批：纱幕调淡后底部两行的底色不再恒定深色，
     加一层**画在字形上**的深色描边兜底 —— 不是给卡面加框，不违反"不要直角方框"。 */
  text-shadow: 0 1px 3px rgba(2, 12, 20, 0.55), 0 0 12px rgba(2, 12, 20, 0.35);
}
.cap {
  font-size: 13px;
  color: var(--text3);
  text-align: center;
  margin-top: 10px;
}
/* 导出瞬间临时挂上的类：去掉圆角，让渐变铺满画布
   ⚠️ 2026-10-18 第四十六批：用户真机复现"保存的图四角有黑边"（截图可见四角纯黑）。
   根因：卡片有 border-radius，圆角外那四个角露出画布底色；第四十四/四十五批重写导出时
   我把这一步弄丢了。现在 utils/saveImage.js 的 exportAndSave({ flatten: true }) 会挂这个类，
   BattleShareView 已传 flatten: true。 */
.flat-export,
.flat-export::before,
.flat-export::after {
  border-radius: 0 !important;
}
/* 装饰性光斑也要收干净 —— 它们常带自身的圆角/溢出，是黑角的另一个来源 */
.flat-export .vglow,
.flat-export .gbeam,
.flat-export .sunlit {
  display: none !important;
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
  font-size: max(14px, calc(23px * var(--sqk)));
}
.scard.square .cname.nm-s {
  font-size: max(14px, calc(20px * var(--sqk)));
}
.scard.square .cname.nm-xs {
  font-size: max(13px, calc(17px * var(--sqk)));
}
</style>
