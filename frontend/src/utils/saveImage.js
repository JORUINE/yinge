/**
 * 保存图片到本地（2026-10-17 第四十四/四十五批）
 * ------------------------------------------------------------
 * ⚠️ 为什么要有这个文件：第四十四批我把"移动端友好的下载"内联写在了 BattleShareView 里，
 *   结果**漏了另外 3 个导出入口**（人格结果页 / 保存晋级图 / 保存详细战报）。
 *   用户真机实测（iOS，官方 + 第三方浏览器）反馈："显示下载到本地了 但是我实测没有"。
 *   ⇒ 又把同一套逻辑复制到第 4 处，正是项目规矩说的"改一处改全部引用"。
 *   **正解是抽成共享函数**，以后新增导出入口自动获得移动端能力。
 *
 * 旧实现为什么在手机上必失败（两个原因都实测确认）：
 *   ① `<a download="xxx.png">` + `click()` —— **iOS Safari 与微信内置浏览器都不支持 download 属性**，
 *      点击只会尝试打开图片，存不下来；
 *   ② `canvas.toDataURL('image/png')` 把整张图编成 base64 塞进 href ——
 *      1080×1439 的 PNG 动辄 2~5MB，手机上这个 URL 长度/内存直接被判死。
 *
 * 本模块的两件事：
 *   ① `exportCardPng(el, opts)` —— 用项目里已验证的 exportNodeToPng 渲染（真渲染引擎，所见即所得）
 *   ② `savePng(dataUrl, fileName)` —— 移动端友好的三级降级下载
 *
 * ⚠️ iOS 限制（写在这里免得再踩）：
 *   `navigator.share({files})` 需要**安全上下文**（HTTPS 或 localhost）。
 *   用 `http://192.168.x.x` 真机访问时它不存在 ⇒ 直接走后面的兜底，这是预期的。
 */
import { exportNodeToPng } from './cardExport.js';

/** 是不是 iOS（含 iPadOS；iPad 桌面模式下 UA 是 Macintosh，用 maxTouchPoints 兜底） */
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * 是不是**手机/平板**（决定导出引擎与保存方式）
 * ------------------------------------------------------------
 * ⚠️ 2026-10-18 第五十批：**不能用 `navigator.share` 是否存在来判断"是不是手机"**。
 *   实测（Windows Chrome 1440）：`navigator.share` 存在 ⇒ 桌面点保存会唤起
 *   Windows 系统「共享」窗口（用户截图："以前都是直接浏览器就保存了，多方便"）。
 *   正解：按**触屏 + 窄屏**判断设备形态，桌面一律走 `<a download>` 直接下载。
 */
export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  const narrow = window.matchMedia('(max-width: 820px)').matches;
  const touch = (navigator.maxTouchPoints || 0) > 1 || 'ontouchstart' in window;
  // 两者都满足才算移动端：桌面触摸屏（窄窗口以外）不会被误判
  return narrow && touch;
}

/**
 * 导出前把所有 `<img>` 转成 dataURL，导出完再换回来。
 * ------------------------------------------------------------
 * ⚠️⚠️ 2026-10-20 第五十五批：**主路径从 fetch 改成 canvas 重绘**
 *   用户真机复现：分享图 / 对位赛战报 / 人格卡**保存下来封面与缩略图全变空白框**，
 *   而页面上的封面是好的。上一批（第五十四批）我以为是 SVG 引擎的图片问题，
 *   实测发现真正的根因是 **`fetch(src, {mode:'cors'})` 在真机上会失败**：
 *     · 实验（_r55-imgdiag.mjs）：只 abort `resourceType==='fetch'` 的图片请求、
 *       让 `<img>` 正常加载 ⇒ 复现"图丢字留"（导出色数 669 → 283）；
 *     · 同一次实验里 **canvas 重绘 100% 成功**（即使 fetch 被完全拦掉）。
 *   为什么 canvas 一定行：这些 `<img>` 都带 `crossorigin="anonymous"` 且**已经在页面上
 *   加载成功了**（否则用户根本看不到封面）⇒ 浏览器已拿到带 CORS 头的位图
 *   ⇒ `drawImage` 进画布不会污染 ⇒ `toDataURL()` 可用。**不依赖再发一次网络请求。**
 *   ⇒ 抓不到的图不再只能是空白框：回源不到就保持原地址，至少不阻断导出。
 * @returns {Promise<() => void>} 还原函数（务必在 finally 里调用）
 */
async function preloadImagesAsDataUrl(el) {
  const imgs = [...el.querySelectorAll('img')];
  const saved = [];
  for (const im of imgs) {
    const src = im.currentSrc || im.src;
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) continue;
    let b64 = null;
    const pngish = /\.png(\?|$)|image\/png/i.test(src);

    // ① 主路径：canvas 重绘（不发网络请求，真机可靠）
    try {
      if (!im.complete || !im.naturalWidth) {
        // 还没解码完就先等它（拿不到就自然落到兜底）
        // eslint-disable-next-line no-await-in-loop
        await im.decode?.().catch(() => {});
      }
      if (im.complete && im.naturalWidth > 0) {
        const c = document.createElement('canvas');
        c.width = im.naturalWidth;
        c.height = im.naturalHeight;
        c.getContext('2d').drawImage(im, 0, 0);
        // 透明图（PNG）必须保留 alpha，JPEG 会把透明区涂黑
        b64 = c.toDataURL(pngish ? 'image/png' : 'image/jpeg', pngish ? undefined : 0.92);
      }
    } catch {
      /* 画布被污染 / 其它异常 → 走兜底 */
    }

    // ② 兜底一：fetch → blob → base64（canvas 不可用时才退到这里）
    if (!b64 || b64.length < 64) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await fetch(src, { mode: 'cors' });
        // eslint-disable-next-line no-await-in-loop
        const blob = await r.blob();
        // eslint-disable-next-line no-await-in-loop
        b64 = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = () => rej(new Error('read'));
          fr.readAsDataURL(blob);
        });
      } catch {
        /* 单个失败不阻断整体导出 */
      }
    }

    /**
     * ③ 终局兜底：**用一个带 crossorigin 的新 Image 重新加载，再 canvas 重绘**
     * ------------------------------------------------------------
     * ⚠️ 2026-10-21 第五十六批：用户真机复现"专辑结算分享、人格卡片仍然丢图"。
     *   前两条路都可能失败：
     *     · 原 `<img>` **没写 `crossorigin`** ⇒ 浏览器按 no-cors 加载，图能显示但
     *       `drawImage` 会**污染画布** ⇒ `toDataURL()` 抛 SecurityError（canvas 路直接废）
     *     · `fetch(跨域)` 在真机上本身就可能失败
     *   ⇒ 用 `crossOrigin='anonymous'` **重新拉一次**：只要图片服务器返回 CORS 头
     *     （分享卡的 img 一直带 crossorigin 且正常显示，说明服务器是放的），
     *     新画布就干净 ⇒ `toDataURL()` 可用。
     *   ⚠️ 这条同时兜住"原图还没解码完 / 原图画布被污染"两种情形。
     */
    if (!b64 || b64.length < 64) {
      try {
        const fresh = new Image();
        fresh.crossOrigin = 'anonymous';
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve, reject) => {
          fresh.onload = () => resolve();
          fresh.onerror = () => reject(new Error('reload'));
          fresh.src = src;
        });
        // ⚠️ 零尺寸保护：naturalWidth/Height 为 0 时 canvas 会是 0×0，
        //    drawImage 直接抛 InvalidStateError、toDataURL 也可能产出空串 ——
        //    与其静默拿到一张空白图，不如明确放弃、保持原地址。
        if (fresh.naturalWidth > 0 && fresh.naturalHeight > 0) {
          const c = document.createElement('canvas');
          c.width = fresh.naturalWidth;
          c.height = fresh.naturalHeight;
          c.getContext('2d').drawImage(fresh, 0, 0);
          b64 = c.toDataURL(pngish ? 'image/png' : 'image/jpeg', pngish ? undefined : 0.92);
        }
      } catch {
        /* 三条路都拿不到就保持原地址，至少不阻断导出 */
      }
    }

    if (!b64 || b64.length < 64) continue;
    saved.push({ im, src: im.getAttribute('src') });
    im.setAttribute('src', b64);
    // 等换过来的图真正解码完，避免 SVG 抓到一个还没解码的 img
    // eslint-disable-next-line no-await-in-loop
    await im.decode?.().catch(() => {});
  }
  return () => {
    saved.forEach(({ im, src }) => {
      if (src) im.setAttribute('src', src);
    });
  };
}

/**
 * 把页面元素导出成 PNG dataURL。
 * @param {HTMLElement} el
 * @param {{targetWidth?: number, bg?: string}} opts
 */
export async function exportCardPng(el, { targetWidth = 1080, bg = null } = {}) {
  // ⚠️⚠️ 2026-10-18 第五十二批：**两端统一用 SVG 方案**
  //   用户："为什么手机端导出的竖形图和方形图完全不如 pc 端 手机端保存的图效果应该要和电脑端的一样"。
  //   之前按设备分流（手机 html2canvas / 桌面 SVG）⇒ 两端效果必然不同：
  //     · html2canvas 自己算布局，CSS 变量（--ink/--pcf 等）解析不全
  //       ⇒ 人格卡副标题/维度标签发暗、几乎看不清（用户截图）
  //     · SVG 方案走真渲染，变量在 inlineStyles 时已解析成具体色值 ⇒ 字色正确
  //   现在统一用 SVG，靠上面的**串行预转图片**解决真机丢图问题。
  const restore = await preloadImagesAsDataUrl(el);
  try {
    return await exportNodeToPng(el, { targetWidth, bg, preferHtml2canvas: false });
  } finally {
    restore();
  }
}

/**
 * 保存 PNG 到本地
 * ------------------------------------------------------------
 * ⚠️⚠️ 2026-10-18 第五十批（用户强烈反馈后重写）：
 *   用户原话："导出分享图现在电脑端会唤出这个窗口（系统共享面板） 以前都是直接浏览器就保存了
 *     多方便 以前那种那么好"；"ios里点了保存后 确实存到相册了 但是没有提示
 *     用户根本意识不到保存成功了"。
 *
 * 所以分成两条**互不干扰**的路：
 *   · **桌面端** → 只用 `<a download>` 直接下载。**绝不调 navigator.share**
 *     （Windows Chrome 也有 share，一调就弹系统共享窗，用户不要这个）。
 *   · **移动端** → 优先 `navigator.share({files})`（iOS 存相册最顺）；
 *     **等它真的 resolve 之后**再弹"已保存到相册"（不是提前弹）；
 *     share 不可用则退回 Blob 下载；iOS 再不行就新窗口打开提示长按。
 *
 * @param {string} dataUrl PNG 的 dataURL
 * @param {string} fileName 文件名
 * @param {{silent?: boolean}} opts silent=true 时不弹提示（调用方自己提示）
 * @returns {Promise<'shared'|'downloaded'|'ios-longpress'|'failed'>} 走了哪条路
 */
export async function savePng(dataUrl, fileName, { silent = false } = {}) {
  const { ElMessage } = await import('element-plus');
  const blob = await (await fetch(dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  const mobile = isMobileDevice();

  // ── 移动端①：系统分享面板（能存相册）──
  if (mobile) {
    try {
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: '音格' });
        // ⚠️ 这里 await 已经等用户走完系统面板了，才弹"已保存" —— 用户才看得见
        if (!silent) ElMessage.success('已保存到相册');
        return 'shared';
      }
    } catch (e) {
      // 用户主动取消：不算失败，也不再弹"已保存"
      if (e?.name === 'AbortError') return 'shared';
    }

    // ── 移动端②：Blob 下载（部分安卓浏览器可用）──
    const a0 = document.createElement('a');
    a0.href = url;
    a0.download = fileName;
    document.body.appendChild(a0);
    a0.click();
    a0.remove();

    // ── 移动端③：iOS 的 download 不生效 → 打开图片让用户长按 ──
    if (isIOS()) {
      await new Promise((r) => setTimeout(r, 350));
      let opened = null;
      try { opened = window.open('', '_blank'); } catch { /* 被拦截 */ }
      if (opened) {
        opened.document.write(
          '<!doctype html><meta charset="utf-8">'
          + `<title>${fileName}</title>`
          + '<body style="margin:0;background:#062130;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh">'
          + `<img src="${dataUrl}" style="max-width:100%;display:block" alt="">`
          + '<p style="color:#fff;font:14px -apple-system,sans-serif;padding:16px;text-align:center">长按图片即可「存储图像」</p>'
          + '</body>',
        );
        opened.document.close();
      }
      if (!silent) ElMessage.info(opened ? '已打开图片，长按即可存储到相册' : '请点右上角「···」用 Safari 打开后再保存');
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return 'ios-longpress';
    }

    if (!silent) ElMessage.success('已保存到本地');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'downloaded';
  }

  // ── 桌面端：只做直接下载（不碰 navigator.share）──
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (!silent) ElMessage.success('已保存到本地');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}

/**
 * 一步到位：导出 + 保存。
 * @param {HTMLElement} el
 * @param {string} fileName
 * @param {{bg?: string, targetWidth?: number, exporting?: import('vue').Ref, busyValue?: any, flatten?: boolean}} opts
 *   exporting  —— 传一个 ref 进来，本函数负责置忙/闲（调用方只管绑定按钮 disabled）
 *   busyValue  —— 忙时把 exporting.value 设成什么。默认 true；
 *                 如果模板用 `exporting === 'share'` 这种区分，就传 'share'；
 *                 闲时一律置回 false。
 *   flatten    —— 导出前临时去掉圆角（导完还原）。**分享图必须开**：
 *                 卡片的 border-radius 会让圆角外那四个角露出画布底色，
 *                 用户看到的就是"图四角有黑边/黑角"（2026-10-18 真机复现）。
 *                 旧实现（第四十四批之前）本来就有这一步（`.flat-export`），
 *                 我在重写时弄丢了 ⇒ 专门加回这个开关，默认 false 保持向后兼容。
 */
export async function exportAndSave(el, fileName, { bg = null, targetWidth = 1080, exporting = null, busyValue = true, flatten = false } = {}) {
  const { ElMessage } = await import('element-plus');
  if (!el) return 'failed';
  if (exporting) exporting.value = busyValue;

  const FLAT_CLASS = 'flat-export';
  if (flatten && el.classList) el.classList.add(FLAT_CLASS);
  // 等一帧让样式真正落上再克隆（exportNodeToPng 读的是 computed style）
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const dataUrl = await exportCardPng(el, { targetWidth, bg });
    return await savePng(dataUrl, fileName);
  } catch (err) {
    ElMessage.error('导出失败：' + (err?.message || '请稍后重试'));
    return 'failed';
  } finally {
    if (flatten && el.classList) el.classList.remove(FLAT_CLASS);
    if (exporting) exporting.value = false;
  }
}

export default { isIOS, exportCardPng, savePng, exportAndSave };
