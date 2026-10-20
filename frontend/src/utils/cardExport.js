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
export async function exportNodeToPng(el, { targetWidth = 1080, fallback = true, bg = null, preferHtml2canvas = false } = {}) {
  if (preferHtml2canvas) {
    const canvas = await html2canvas(el, {
      scale: Math.max(2, targetWidth / el.offsetWidth),
      backgroundColor: bg || null,
      useCORS: true,
      allowTaint: false,
      logging: false,
    });
    return canvas.toDataURL('image/png');
  }
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
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, c.width, c.height);
    }
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
      backgroundColor: bg || null,
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL('image/png');
  }
}
