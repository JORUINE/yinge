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
 * 把页面元素导出成 PNG dataURL。
 * @param {HTMLElement} el
 * @param {{targetWidth?: number, bg?: string}} opts
 */
export async function exportCardPng(el, { targetWidth = 1080, bg = null } = {}) {
  return exportNodeToPng(el, { targetWidth, bg });
}

/**
 * 保存 PNG 到本地 —— 三级降级，覆盖 iOS / Android / 微信 / 桌面。
 * @param {string} dataUrl PNG 的 dataURL
 * @param {string} fileName 文件名
 * @param {{silent?: boolean}} opts silent=true 时不弹"已保存"之类的提示（调用方自己提示）
 * @returns {Promise<'shared'|'downloaded'|'ios-longpress'|'failed'>} 走了哪条路
 */
export async function savePng(dataUrl, fileName, { silent = false } = {}) {
  const { ElMessage } = await import('element-plus');
  const blob = await (await fetch(dataUrl)).blob();
  const url = URL.createObjectURL(blob);

  // ① 系统分享面板（手机上存相册最顺的一条路；需要安全上下文，http://192.168.x.x 下会不可用）
  try {
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare?.({
      files: [file],
    }) && navigator.share) {
      await navigator.share({
        files: [file],
        title: '音格',
      });
      if (!silent) ElMessage.success('已调起分享，选「存储图像」即可存到相册');
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'shared'; // 用户主动取消，不算失败
  }

  // ② Blob URL + download 属性（桌面与部分安卓可用；iOS 点了没反应但不会报错）
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // ③ iOS：download 属性无效 ⇒ 新窗口打开图片，让用户长按保存
  if (isIOS()) {
    await new Promise((r) => setTimeout(r, 350));
    let opened = null;
    try {
      opened = window.open('', '_blank');
    } catch { /* 被浏览器拦截时 opened 为 null */ }
    if (opened) {
      // ⚠️ 不能直接把 2~5MB 的 baseURL 写进 document.write（iOS 上会被截断）⇒ 用 img 标签 + src
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
    if (!silent) {
      ElMessage.info(opened ? '已打开图片，长按即可存储到相册' : '请点右上角「···」用 Safari 打开后再保存');
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return 'ios-longpress';
  }

  if (!silent) ElMessage.success('已保存到本地');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}

/**
 * 一步到位：导出 + 保存。
 * @param {HTMLElement} el
 * @param {string} fileName
 * @param {{bg?: string, targetWidth?: number, exporting?: import('vue').Ref, busyValue?: any}} opts
 *   exporting  —— 传一个 ref 进来，本函数负责置忙/闲（调用方只管绑定按钮 disabled）
 *   busyValue  —— 忙时把 exporting.value 设成什么。默认 true；
 *                 如果模板用 `exporting === 'share'` 这种区分，就传 'share'；
 *                 闲时一律置回 false。
 */
export async function exportAndSave(el, fileName, { bg = null, targetWidth = 1080, exporting = null, busyValue = true } = {}) {
  const { ElMessage } = await import('element-plus');
  if (!el) return 'failed';
  if (exporting) exporting.value = busyValue;
  try {
    const dataUrl = await exportCardPng(el, { targetWidth, bg });
    return await savePng(dataUrl, fileName);
  } catch (err) {
    ElMessage.error('导出失败：' + (err?.message || '请稍后重试'));
    return 'failed';
  } finally {
    if (exporting) exporting.value = false;
  }
}

export default { isIOS, exportCardPng, savePng, exportAndSave };
