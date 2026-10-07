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

/** 把元素克隆出来、逐元素内联 computed style */
function inlineStyles(src, dst) {
  if (src.nodeType !== 1 || dst.nodeType !== 1) return;
  const cs = getComputedStyle(src);
  let css = '';
  for (let i = 0; i < cs.length; i++) {
    const k = cs[i];
    css += `${k}:${cs.getPropertyValue(k)};`;
  }
  dst.setAttribute('style', css);
  const sc = [...src.children];
  const dc = [...dst.children];
  for (let i = 0; i < sc.length && i < dc.length; i++) inlineStyles(sc[i], dc[i]);
}

/** 图片转 dataURL（同源也走一遍，避免 SVG 里出现外部引用） */
async function inlineImages(srcEl, dstEl) {
  const srcImgs = [...srcEl.querySelectorAll('img')];
  const dstImgs = [...dstEl.querySelectorAll('img')];
  await Promise.all(srcImgs.map(async (im, i) => {
    const s = im.currentSrc || im.src;
    if (!s || s.startsWith('data:') || !dstImgs[i]) return;
    try {
      const r = await fetch(s, { mode: 'cors' });
      const b = await r.blob();
      const b64 = await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(b);
      });
      dstImgs[i].setAttribute('src', b64);
    } catch {
      /* 取不到就沿用原地址，能显示多少算多少 */
    }
  }));
}

/**
 * 导出为 PNG dataURL。
 * @param {HTMLElement} el 要导出的元素（必须是页面里已渲染的）
 * @param {{targetWidth?: number, fallback?: boolean}} opts
 * @returns {Promise<string>} dataURL
 */
export async function exportNodeToPng(el, { targetWidth = 1080, fallback = true } = {}) {
  try {
    const W = el.offsetWidth;
    const H = el.offsetHeight;
    const clone = el.cloneNode(true);
    inlineStyles(el, clone);
    await inlineImages(el, clone);

    const html = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
      + `<foreignObject x="0" y="0" width="${W}" height="${H}">${html}</foreignObject></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();

    const SC = Math.max(2, targetWidth / W);
    const c = document.createElement('canvas');
    c.width = Math.round(W * SC);
    c.height = Math.round(H * SC);
    const g = c.getContext('2d');
    g.scale(SC, SC);
    g.drawImage(img, 0, 0);
    const out = c.toDataURL('image/png');
    // 画布全白 = 渲染失败（svg 里图片跨域等），此时回退
    if (!out || out === 'data:,' || out.length < 5000) throw new Error('svg 渲染结果异常');
    return out;
  } catch (e) {
    if (!fallback) throw e;
    // 兜底：老的 html2canvas（已知会丢部分间距，但总比导出失败好）
    const canvas = await html2canvas(el, {
      scale: Math.max(2, targetWidth / el.offsetWidth),
      backgroundColor: null,
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL('image/png');
  }
}
