/**
 * 卡片导出（2026-10-07 第三十一批）
 * ------------------------------------------------------------
 * ⚠️ 为什么换掉 html2canvas：
 *   用户反馈「导出的分享图里标题与副标题贴在一起」（网页上正常）。
 *   排查用了 7 种写法（margin / padding / absolute / inline style / CSS 变量 /
 *   运行时注入样式 / 同一元素内 line-height），**导出图 md5 全部与改前一致** ⇒ 完全不生效。
 *   根因：**html2canvas 有自己的布局引擎，不渲染真 DOM**，凡 `calc(var(…))` 之类
 *   它自己算不对，间距就整个丢掉。
 *
 * ✅ 本方案（用户提示的"直接截图"方向）：
 *   ① 克隆节点
 *   ② 用 `getComputedStyle` 把**每个元素的最终样式**内联成 style 属性
 *      —— 此时 CSS 变量/calc 都已经被浏览器解析成**具体数值**，不再有变量
 *   ③ 图片转 base64（否则 SVG 里加载不出来 / 污染 canvas）
 *   ④ 包进 `<svg><foreignObject>`，交给**浏览器自己的渲染引擎**画进 canvas
 *   ⇒ 因为走的是真渲染，字号/间距/圆角/字体/渐变全都与页面一致（真正所见即所得）。
 *
 * 实测（音色控 1080×1438）：导出图里标题→副标题间距存在且与网页等比；
 * 同一张卡用 html2canvas 导出则间距为 0（对照图见 tools/pw 的输出）。
 */
import html2canvas from 'html2canvas';

/**
 * 去掉克隆树里的所有注释节点
 * ------------------------------------------------------------
 * ⚠️⚠️ 2026-10-21 第五十七批：**这就是"导出走 html2canvas"的真因（桌面端一直如此，只是没人发现）**
 *   我们的模板里写了大段说明性注释（`<!-- ⚠️⚠️ … —— … -->`）。
 *   `cloneNode(true)` 会把注释一起克隆，`XMLSerializer` 再把它原样写进 SVG。
 *   而 **XML 规定注释里不能出现 `--`**，且中文档里还有大段含破折号的说明
 *   ⇒ DOMParser 直接报 `Unexpected end of stream: still inside the root element`
 *   ⇒ `new Image().decode()` 抛 "The source image cannot be decoded."
 *   ⇒ 整条 SVG 主路径作废、悄悄退到 html2canvas（移动端就是"图丢、错位"）。
 *   注释对渲染 **零影响**，删掉既修 bug 又顺带把 SVG 缩了一大截。
 */
function stripComments(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const doomed = [];
  while (walker.nextNode()) doomed.push(walker.currentNode);
  doomed.forEach((n) => n.parentNode && n.parentNode.removeChild(n));
}

/**
 * 这些属性对**静态截图**没有任何影响（过渡/动画/交互/滚动条/无障碍偏好等），
 * 但它们的计算值往往很长（`transition-property` 常是一整串、`animation-*` 同理）。
 * 内联它们只会撑大 SVG —— 而 SVG 越大，真机越容易解不动（见下面 inlineStyles 的说明）。
 */
const SKIP_PROPS = new Set([
  'transition', 'transition-property', 'transition-duration', 'transition-timing-function',
  'transition-delay', 'transition-behavior',
  'animation', 'animation-name', 'animation-duration', 'animation-timing-function',
  'animation-delay', 'animation-iteration-count', 'animation-direction',
  'animation-fill-mode', 'animation-play-state', 'animation-timeline',
  'animation-range', 'animation-range-start', 'animation-range-end',
  'will-change', 'cursor', 'pointer-events', 'user-select', '-webkit-user-select',
  'touch-action', '-webkit-tap-highlight-color', 'caret-color', 'accent-color',
  'resize', 'appearance', '-webkit-appearance', 'contain', 'content-visibility',
  'scroll-behavior', 'overscroll-behavior', 'overscroll-behavior-x', 'overscroll-behavior-y',
  'scroll-margin', 'scroll-margin-top', 'scroll-margin-right', 'scroll-margin-bottom',
  'scroll-margin-left', 'scroll-padding', 'scroll-padding-top', 'scroll-padding-right',
  'scroll-padding-bottom', 'scroll-padding-left', 'scrollbar-gutter', 'scrollbar-width',
  'scrollbar-color', 'anchor-name', 'anchor-scope', 'position-anchor', 'position-area',
  'position-try', 'position-try-fallbacks', 'position-try-order', 'position-visibility',
  'timeline-scope', 'view-transition-name', 'view-transition-class',
  'speak', 'quotes', 'hyphenate-character', 'print-color-adjust', '-webkit-print-color-adjust',
]);

/** 把元素克隆出来、逐元素内联 computed style */
function inlineStyles(src, dst) {
  if (src.nodeType !== 1 || dst.nodeType !== 1) return;
  const cs = getComputedStyle(src);
  const parentCs = src.parentElement && src !== document.documentElement
    ? getComputedStyle(src.parentElement)
    : null;
  let css = '';
  for (let i = 0; i < cs.length; i++) {
    const k = cs[i];
    const v = cs.getPropertyValue(k);
    if (SKIP_PROPS.has(k)) continue;
    /**
     * ⭐⭐ 2026-10-21 第五十七批：**只保留"真正改过"的 CSS 变量**
     * ------------------------------------------------------------
     * 实测：99 个元素写出了 **1.87 MB** 的 style（平均每个 19 KB）——
     * 因为 CSS 变量是**可继承**的，`:root` 上那两百来个 `--el-*` / `--font-*` / `--bg-wash`
     * 会被**每一个后代元素**的 computed style 再抄一遍。
     * 后果：整段 SVG 序列化到 **1.9 MB**，真机（尤其 iOS）解不动这个 data URL
     * ⇒ 主路径失效 ⇒ 掉到 html2canvas ⇒ 用户看到"图丢了"。
     * 修法：子元素上如果某个变量的值**与父元素完全相同**（= 纯继承、没被重新定义），就跳过；
     *   被局部重定义过的（例如 `.bshot.exporting { --text3: … }` 这类的对比度兜底）**照旧保留**。
     * 这是"语义上等价"的裁剪：继承本来就会把同一个值传下去。
     */
    if (k.startsWith('--') && parentCs && parentCs.getPropertyValue(k) === v) continue;
    css += `${k}:${v};`;
  }
  dst.setAttribute('style', css);
  const sc = [...src.children];
  const dc = [...dst.children];
  // ⚠️ 必须先递归完**真子元素**再插伪元素：insertBefore 会改变 dc 的下标，
  //    若先插，sc[0]/dc[0] 就配不上了（会把伪元素当成第一个真子元素去递归）。
  for (let i = 0; i < sc.length && i < dc.length; i++) inlineStyles(sc[i], dc[i]);
  materializePseudo(src, dst);
}

/**
 * ⭐⭐⭐ 2026-10-20 第五十四批：把 `::before` / `::after` **实体化**成真元素
 * ------------------------------------------------------------
 * 用户真机反馈："导出的图片和我在结算页面看到的图片并不一致，不管是色调还是
 * 左上角的音格的可读性，导出的版本都是有问题的，但是结算页的版本是很好看的"。
 *
 * 根因（实测确认）：导出走的是 `el.cloneNode(true)` + `inlineStyles`，
 *   · `cloneNode` 只克隆**真元素** —— 伪元素根本不在 DOM 树里；
 *   · `inlineStyles` 只用 `getComputedStyle(src)`（不传伪元素参数）⇒ 拿不到伪元素样式；
 *   · 克隆节点脱离了 `<style>` 表 ⇒ 样式表里的伪元素规则一条都不生效。
 * 而音格分享卡的**整套配色都在伪元素里**：
 *   `.scard.glassy::before` = 顶部压暗 + 冠军色三层柔光 + 深色纱幕 + 底部托底（**色调**）
 *   `.scard.glassy::after`  = 左上主高光 + 斜穿光带 + 底部微光（**玻璃质感**）
 * ⇒ 导出的图只剩「模糊封面 + 纯色底 + 文字」，品牌行「音格 · YINGE.APP」
 *   正好压在**没有顶部压暗**的亮封面上 ⇒ 可读性差、色调发飘。
 *
 * 修法：克隆时为每个有内容的伪元素造一个真 `div`，把它的 computed style 整体内联，
 *   再插回克隆树（`::before` 插最前、`::after` 插最后）——
 *   z-index 与定位都由内联样式带着，与真渲染一致。
 * ⚠️ 这一步同时修好**人格卡**（`.ptcard-v2::after` 白纱幕等同理）：
 *   用户原话"包括音乐人格的那些导出也要遵循这个规则"。
 */
function materializePseudo(src, dst) {
  for (const pseudo of ['::before', '::after']) {
    let cs;
    try {
      cs = getComputedStyle(src, pseudo);
    } catch {
      continue; // 老浏览器不支持伪元素查询：跳过（退回旧行为）
    }
    if (!cs) continue;
    const content = cs.getPropertyValue('content');
    // 没有伪元素 / 不渲染
    if (!content || content === 'none' || content === 'normal' || content === '""' || content === "''") {
      // content:"" 的纯装饰伪元素**仍然要实体化**（渐变层就是它）
      if (!content || content === 'none' || content === 'normal') continue;
    }
    const d = document.createElement('div');
    d.setAttribute('data-pseudo', pseudo.slice(2));
    let css = '';
    for (let i = 0; i < cs.length; i++) {
      const k = cs[i];
      // content 在真元素上不生效（foreignObject 里更不会生效），
      // 若它是文本就改用 textContent 承载
      if (k === 'content') continue;
      css += `${k}:${cs.getPropertyValue(k)};`;
    }
    d.setAttribute('style', css);
    // 伪元素的文本内容（如 `content: "×"`）搬成真实文本节点
    const text = content.replace(/^["']/, '').replace(/["']$/, '');
    if (text && !/^(url\(|counter\(|attr\(|open-quote|close-quote|no-open-quote|no-close-quote)/.test(text)) {
      d.textContent = text;
    }
    if (pseudo === '::before') dst.insertBefore(d, dst.firstChild);
    else dst.appendChild(d);
  }
}

/**
 * 图片转 dataURL（同源也走一遍，避免 SVG 里出现外部引用）
 * ------------------------------------------------------------
 * ⚠️⚠️ 2026-10-20 第五十五批：**主路径改成 canvas 重绘**
 *   用户真机复现「保存下来封面/缩略图全变空白框」。实测根因是
 *   `fetch(src,{mode:'cors'})` 在真机上会失败（iOS Safari / 微信内置浏览器），
 *   而 SVG 当图片用时**不加载外部 URL** ⇒ 图上留一片空白。
 *   这些 `<img>` 都带 `crossorigin="anonymous"` 且已在页面上加载成功
 *   ⇒ 直接 `drawImage` 进画布不会污染 ⇒ `toDataURL()` 一定可用，
 *   **不依赖再发一次网络请求**，真机可靠性远高于 fetch。
 *   实测（_r55-imgdiag.mjs）：fetch 被完全拦断时 canvas 重绘仍 100% 成功。
 */
async function inlineImages(srcEl, dstEl) {
  const srcImgs = [...srcEl.querySelectorAll('img')];
  const dstImgs = [...dstEl.querySelectorAll('img')];
  await Promise.all(srcImgs.map(async (im, i) => {
    const s = im.currentSrc || im.src;
    if (!s || s.startsWith('data:') || !dstImgs[i]) return;
    let b64 = null;
    const pngish = /\.png(\?|$)|image\/png/i.test(s);
    // ① canvas 重绘（主路径）
    try {
      if (im.complete && im.naturalWidth > 0) {
        const c = document.createElement('canvas');
        c.width = im.naturalWidth;
        c.height = im.naturalHeight;
        c.getContext('2d').drawImage(im, 0, 0);
        b64 = c.toDataURL(pngish ? 'image/png' : 'image/jpeg', pngish ? undefined : 0.92);
      }
    } catch { /* 污染/异常 → 兜底 */ }
    // ② fetch 兜底
    if (!b64 || b64.length < 64) {
      try {
        const r = await fetch(s, { mode: 'cors' });
        const b = await r.blob();
        b64 = await new Promise((res) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.readAsDataURL(b);
        });
      } catch {
        /* 取不到就沿用原地址，能显示多少算多少 */
      }
    }
    // ③ 带 crossOrigin 重新加载再重绘（与 saveImage.js 同一套兜底）
    //    ⚠️ 这条同时兜住「loading="lazy" 且从没进过视口 ⇒ 原 img 根本没加载」的情况：
    //    新建的 Image 一定会去拉。
    if (!b64 || b64.length < 64) {
      try {
        const fresh = new Image();
        fresh.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          fresh.onload = () => resolve();
          fresh.onerror = () => reject(new Error('reload'));
          fresh.src = s;
        });
        if (fresh.naturalWidth > 0 && fresh.naturalHeight > 0) {
          b64 = canvasToB64(fresh, pngish);
        }
      } catch {
        /* 三条路都拿不到 → 保持原地址 */
      }
    }
    if (b64 && b64.length >= 64) dstImgs[i].setAttribute('src', b64);
  }));
}

/** 把一张已加载的图转成 dataURL；0 尺寸直接返回 null（避免 0×0 画布静默出空图） */
function canvasToB64(img, pngish) {
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL(pngish ? 'image/png' : 'image/jpeg', pngish ? undefined : 0.92);
}

/**
 * ⭐⭐ 2026-10-21 第五十七批：导出结果「真的把图带上了吗」
 * ------------------------------------------------------------
 * 用户 iOS 真机：文件存下来了、文字也在，**封面一片空白**；而桌面完全正常。
 * 这种失败**不会**被 `out.length < 5000` 抓到 —— 有文字有底色，体积照样很大。
 *
 * 做法：拿页面里每个 `<img>` 相对导出元素的位置，去导出画布的同一块区域**数颜色**。
 *   · 区域颜色数 ≤ 3 或明暗差 < 6 ⇒ 这片是纯色 ⇒ 图没进去
 *   · 超过一半的图是纯色 ⇒ 判定"图丢了"，抛出 → 外层自动换 html2canvas 重来
 * ⚠️ 这是**直接验证结果**，不是猜某个 CSS 属性有没有被支持；换成什么引擎都适用。
 * ⚠️ getImageData 抛异常（画布被污染）时**返回 true 而不是 false** ——
 *    宁可放过，也不要因为测不了就无脑切引擎（桌面现在是好的，不能把它拖下水）。
 */
function imagesSeemPresent(canvas, el) {
  let imgs;
  try {
    imgs = [...el.querySelectorAll('img')];
  } catch {
    return true;
  }
  if (!imgs.length) return true; // 没图可验（纯文字卡）⇒ 不算失败
  const base = el.getBoundingClientRect();
  if (!base.width || !base.height) return true;
  const SC = canvas.width / base.width;
  let g;
  try {
    g = canvas.getContext('2d');
  } catch {
    return true;
  }
  let checked = 0;
  let flat = 0;
  for (const im of imgs) {
    const r = im.getBoundingClientRect();
    const w = Math.round(r.width * SC);
    const h = Math.round(r.height * SC);
    if (w < 6 || h < 6) continue; // 太小（角标之类）不参与判断
    // 取图片区域的中心 60%，避开圆角与边框
    const cw = Math.max(4, Math.round(w * 0.6));
    const ch = Math.max(4, Math.round(h * 0.6));
    const x = Math.max(0, Math.min(canvas.width - cw, Math.round((r.left - base.left) * SC + (w - cw) / 2)));
    const y = Math.max(0, Math.min(canvas.height - ch, Math.round((r.top - base.top) * SC + (h - ch) / 2)));
    let d;
    try {
      d = g.getImageData(x, y, cw, ch).data;
    } catch {
      return true; // 读不了（污染）⇒ 不做判断
    }
    const cols = new Set();
    let minL = 255;
    let maxL = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
      cols.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    }
    checked += 1;
    if (cols.size <= 3 || maxL - minL < 6) flat += 1;
  }
  if (!checked) return true;
  return flat / checked < 0.5;
}

/**
 * 导出为 PNG dataURL。
 * @param {HTMLElement} el 要导出的元素（必须是页面里已渲染的）
 * @param {{targetWidth?: number, fallback?: boolean, bg?: string, preferHtml2canvas?: boolean}} opts
 *   bg —— 实心底色。**分享图必须实心底**（透明底的 PNG 发到朋友圈/小红书会变成黑块或灰块）；
 *   不传就保持透明（原来的行为）。
 *   preferHtml2canvas —— 直接用 html2canvas（跳过 SVG 方案）。
 *     ⚠️ 2026-10-18 第五十批：**移动端必须用它**。
 *     实测（probe-r50-export-diag）：卡片里 5 张 iTunes 封面 `fetch` 全部能转 base64，
 *     但在真机（iOS/安卓）上 SVG foreignObject 的渲染结果里封面**仍是 http URL ⇒ 空白框**
 *     （用户截图："保存好的图片里面专辑信息丢失了"），而桌面 Chrome 正常。
 *     html2canvas 走 DOM 快照 + `useCORS`，图片处理在移动端成熟得多。
 *     代价：它会自己算布局，`calc(var(...))` 类的间距可能略有偏差（第三十一批已知）。
 *     **用户明确要求"图片必须完整、以前那种就很好" ⇒ 优先保证图片不丢**。
 * @returns {Promise<string>} dataURL
 */
/**
 * 计算导出倍率
 * ------------------------------------------------------------
 * ⚠️ 2026-10-21 第五十七批：**加画布面积上限**。
 *   iOS Safari 对 canvas 的像素面积有硬上限（老机型只有 16,777,216 px ≈ 4096×4096），
 *   超过之后 `toDataURL()` 会返回空串或**残缺数据** —— 用户拿到的就是
 *   "2.1 MB 的 PNG、系统预览都打不开、图里还缺封面" 那种文件。
 *   所以倍率一律夹在「至少 2 倍（清晰度）」与「总面积 ≤ 1600 万 px」之间。
 * @returns {number}
 */
function calcScale(el, targetWidth) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (!(w > 0) || !(h > 0)) return 2;
  const want = Math.max(2, targetWidth / w);
  const MAX_AREA = 16_000_000;
  const capByArea = Math.sqrt(MAX_AREA / (w * h));
  const s = Math.min(want, Math.max(2, capByArea));
  return Number.isFinite(s) && s > 0 ? s : 2;
}

/**
 * 把最终 dataURL 解开再验一遍（验的是"用户真正会存下来的那份文件"）
 * ------------------------------------------------------------
 * 判据只三条，都刻意放宽，避免误伤：
 *   ① 能解码（解不开 = 文件坏了，必须换引擎重来）
 *   ② 颜色数够多（纯色/近乎纯色 = 什么都没画上）
 *   ③ 卡片里每张封面所在的位置不是整片纯色
 * ⚠️ 任何一步读不出来（画布污染 / 浏览器不支持）都**判为通过** ——
 *    宁可放过，也不要因为测不了就把桌面端拖去走 html2canvas。
 */
async function pngSeemsRight(dataUrl, el) {
  let canvas;
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) return false;
    canvas = document.createElement('canvas');
    canvas.width = Math.min(img.naturalWidth, 480);
    canvas.height = Math.max(1, Math.round(img.naturalHeight * (canvas.width / img.naturalWidth)));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  } catch {
    return false; // 解不开 → 文件真的坏了
  }
  try {
    const g = canvas.getContext('2d');
    const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const cols = new Set();
    for (let i = 0; i < d.length; i += 4) cols.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    if (cols.size < 8) return false;
    // 复用同一套"逐图看像素"的判据（此时 canvas 是缩过的，按比例算即可）
    return imagesSeemPresent(canvas, el);
  } catch {
    return true; // 读不出来就不下结论
  }
}

/** html2canvas 的统一调用（移动端兜底 + 强制走 html2canvas 时共用） */
async function runHtml2canvas(el, { targetWidth, bg }) {
  const scale = calcScale(el, targetWidth);
  // ⚠️ 2026-10-21 第五十七批：不把 clone 窗口撑到元素尺寸时，html2canvas 会按**视口**裁剪
  //    （实测手机上导出的晋级图被裁成 780×780 的方图）。
  const ew = Math.max(1, Math.round(el.scrollWidth || el.offsetWidth));
  const eh = Math.max(1, Math.round(el.scrollHeight || el.offsetHeight));
  const vw = document.documentElement.clientWidth || 0;
  const vh = document.documentElement.clientHeight || 0;
  const canvas = await html2canvas(el, {
    scale,
    backgroundColor: bg || null,
    useCORS: true,
    allowTaint: false,
    logging: false,
    width: ew,
    height: eh,
    // 页面可能被滚过 / 有 offsetParent 偏移，不锁死这三项时截出来会偏
    scrollX: 0,
    scrollY: 0,
    windowWidth: Math.max(vw, ew),
    windowHeight: Math.max(vh, eh),
  });
  const out = canvas.toDataURL('image/png');
  if (!out || out === 'data:,' || out.length < 5000) throw new Error('html2canvas 结果异常');
  return out;
}

export async function exportNodeToPng(el, { targetWidth = 1080, fallback = true, bg = null, preferHtml2canvas = false } = {}) {
  if (preferHtml2canvas) return runHtml2canvas(el, { targetWidth, bg });
  const DBG = typeof window !== 'undefined' && window.__yingeExportDebug;
  try {
    const W = el.offsetWidth;
    const H = el.offsetHeight;
    if (!(W > 0) || !(H > 0)) throw new Error('导出元素不可见（尺寸为 0）');
    if (DBG) console.log('[export] ① 尺寸', W, H, 'targetWidth', targetWidth);
    const clone = el.cloneNode(true);
    // ⚠️ 必须在序列化前剔掉注释（XML 注释里不允许 `--`，模板里这类注释很多）
    stripComments(clone);
    inlineStyles(el, clone);
    // inlineStyles / materializePseudo 也可能带进注释，最后再扫一遍
    stripComments(clone);
    await inlineImages(el, clone);
    if (DBG) console.log('[export] ② 图片内联完成');

    if (DBG) {
      // 找出克隆里仍然指向外部 http 的引用（SVG 当图片用时拉不到，还会污染画布）
      const hits = [];
      clone.querySelectorAll('*').forEach((n) => {
        const st = n.getAttribute('style') || '';
        const m = st.match(/[a-z-]+\s*:\s*[^;]*url\(\s*["']?https?:[^)]*\)/gi);
        if (m) hits.push(...m.slice(0, 2));
      });
      // 体积都花在哪些属性上（调优用）
      const stat = new Map();
      let total = 0;
      clone.querySelectorAll('[style]').forEach((n) => {
        const st = n.getAttribute('style') || '';
        total += st.length;
        st.split(';').forEach((kv) => {
          const k = kv.split(':')[0];
          if (!k) return;
          stat.set(k, (stat.get(k) || 0) + kv.length + 1);
        });
      });
      const top = [...stat.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 14);
      console.warn('[export] style 总字节', total, '元素数', clone.querySelectorAll('[style]').length);
      console.warn('[export] 体积榜：', top.map(([k, v]) => `${k}=${(v / 1024).toFixed(0)}K`).join(' '));
      const leftImg = [...clone.querySelectorAll('img')].filter((i) => /^https?:/.test(i.getAttribute('src') || '')).length;
      console.warn('[export] 外部引用', hits.length, '处；仍未内联的 img', leftImg, '个');
      if (hits.length) console.warn('[export] 示例：', hits.slice(0, 3).map((s) => s.slice(0, 120)));
    }
    const html = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
      + `<foreignObject x="0" y="0" width="${W}" height="${H}">${html}</foreignObject></svg>`;
    if (DBG) {
      // 让浏览器自己说哪里不合法（排障用，正常路径不执行）
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const pe = doc.querySelector('parsererror');
      if (pe) {
        const at = doc.documentElement.textContent || '';
        console.warn('[export] SVG 解析失败：', at.slice(0, 400));
        const i = at.match(/line (\d+) at column (\d+)/);
        if (i) {
          const line = Number(i[1]);
          const lines = svg.split('\n');
          console.warn('[export] 出错行附近：', (lines[line - 1] || '').slice(0, 300));
        }
      } else {
        console.log('[export] SVG 解析 OK');
      }
      console.warn('[export] SVG 结尾：', JSON.stringify(svg.slice(-220)));
    }
    /**
     * ⚠️⚠️ 2026-10-21 第五十七批排障记录 —— **别再走歪路**
     * ------------------------------------------------------------
     * 我一度怀疑"SVG 1.9 MB 太长、data URL 解不了"，改成了 `URL.createObjectURL(blob)`。
     * 结果：SVG 确实能解码了，但**画布被污染** —— 把 blob: 的 SVG（内含 foreignObject）
     * 画进 canvas 后 `toDataURL()` 抛 "Tainted canvases may not be exported."
     * ⇒ 只能回到 data URL。**真正的病根从来不是长度**：是模板串末尾的 `</svg>` 被漏掉，
     * DOMParser 报 `Unexpected end of stream` ⇒ 解码失败。已补回，
     * 并加了 `stripComments`（XML 注释里不允许 `--`，而我们的模板里大段说明性注释都带破折号）。
     */
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    if (DBG) console.log('[export] ③ SVG 长度', svg.length);
    await img.decode();
    if (DBG) console.log('[export] ④ SVG 解码完成', img.naturalWidth, img.naturalHeight);

    const SC = calcScale(el, targetWidth);
    // 排障开关：控制台里 `__yingeExportDebug = true` 就能看到导出真正用的尺寸
    if (typeof window !== 'undefined' && window.__yingeExportDebug) {
      // eslint-disable-next-line no-console
      console.log('[export] W,H,SC =', W, H, SC, '→', Math.round(W * SC), '×', Math.round(H * SC));
    }
    const c = document.createElement('canvas');
    c.width = Math.round(W * SC);
    c.height = Math.round(H * SC);
    const g = c.getContext('2d');
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, c.width, c.height);
    }
    g.scale(SC, SC);
    g.drawImage(img, 0, 0);

    // ⭐ 换引擎的判据：**逐图看像素**，而不是只看体积
    //   （"图丢字留"时体积很大，旧判据永远放行 —— 真机 iOS 就是这么漏掉的）
    if (!imagesSeemPresent(c, el)) throw new Error('导出结果里封面缺失');

    const out = c.toDataURL('image/png');
    // 画布全白 = 渲染失败（svg 里图片跨域等），此时回退
    if (!out || out === 'data:,' || out.length < 5000) throw new Error('svg 渲染结果异常');
    // ⭐⭐ 出图之后**再解一遍**：有些设备上 toDataURL 会"成功返回一段看着不小、
    //    实际解不开/缺内容"的数据（真机截图里那种 2 MB 却连缩略图都出不来）。
    //    这一步直接拿最终 PNG 当输入，验不过就换引擎重来 —— 验的是用户真正拿到的那份文件。
    if (!(await pngSeemsRight(out, el))) throw new Error('导出的 PNG 校验没通过');
    return out;
  } catch (e) {
    if (DBG) console.warn('[export] 主路径失败，改走 html2canvas：', e?.message || e);
    if (!fallback) throw e;
    // 兜底：html2canvas。移动端真机上它反而更可靠（自带图片管线，不依赖 SVG 的外链规则）。
    return runHtml2canvas(el, { targetWidth, bg });
  }
}
