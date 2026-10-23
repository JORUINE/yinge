/**
 * 剪贴板复制（全站唯一入口）
 * ============================================================
 * ⚠️ 为什么必须有这个文件（第六十四批）：
 *   第六十三批只修了「分享页」的复制按钮，另外两个复制入口
 *   （结算页「和好友一起玩 → 复制链接」、接龙页「复制这份签表链接」）
 *   还是老写法 `navigator.clipboard.writeText(url)` + catch 里 `ElMessage.info(url)`。
 *   局域网 `http://192.168.x.x` 不是安全上下文 ⇒ `navigator.clipboard` 是 undefined
 *   ⇒ 直接进 catch ⇒ **手机端只弹一条灰色链接提示，剪贴板里什么都没有**。
 *   这就是用户第二次反馈"和好友一起玩 这链接复制了 还是出这个灰色的"的真因。
 *
 * 复制策略（按可靠性排序）：
 *   ① 非安全上下文 ⇒ **同步** `document.execCommand('copy')`
 *      必须同步：`await` 之后浏览器会认为用户手势已结束，execCommand 失效。
 *   ② 安全上下文（https / localhost）⇒ Clipboard API
 *   ③ 再试一次 execCommand（有些浏览器 await 之后手势还在）
 *   ④ 都失败 ⇒ 返回 ok:false，由调用方弹 `CopyLinkDialog` 让用户长按复制
 *
 * ⚠️ 改动本文件会影响全部 3 个复制入口，改完必须跑 tools/pw/_r64-copy.mjs。
 */

/**
 * 用临时 textarea + execCommand 复制（同步，必须写在用户手势里）
 * @param {string} text
 * @returns {boolean} 是否复制成功
 */
export function copyByExecCommand(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // 1px + opacity:0：不闪屏，但仍可被 iOS 系统菜单识别为可选中文本
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;';
    document.body.appendChild(ta);

    // 备份用户原有选区，复制完还原（否则页面上的选中状态被清掉）
    const sel = document.getSelection();
    const ranges = sel && sel.rangeCount
      ? Array.from({ length: sel.rangeCount }, (_, i) => sel.getRangeAt(i))
      : [];

    ta.focus();
    ta.select();
    // iOS Safari：只调 select() 有时不生效，必须再 setSelectionRange
    if (ta.setSelectionRange) ta.setSelectionRange(0, text.length);

    const ok = document.execCommand('copy');
    document.body.removeChild(ta);

    if (sel) {
      sel.removeAllRanges();
      ranges.forEach((r) => sel.addRange(r));
    }
    return ok;
  } catch {
    return false;
  }
}

/**
 * 复制一段文本，自动选最可靠的方式
 * @param {string} text
 * @returns {Promise<{ok: boolean, method: 'exec'|'clipboard'|'none'}>}
 */
export async function copyText(text) {
  const str = String(text ?? '');
  if (!str) return { ok: false, method: 'none' };

  const secure = typeof window !== 'undefined' && window.isSecureContext;

  // ① 非安全上下文：先同步 execCommand（这一步不能放到 await 之后）
  if (!secure && copyByExecCommand(str)) return { ok: true, method: 'exec' };

  // ② 安全上下文：Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(str);
      return { ok: true, method: 'clipboard' };
    } catch {
      /* 落到 ③ */
    }
  }

  // ③ 再试一次 execCommand
  if (copyByExecCommand(str)) return { ok: true, method: 'exec' };

  // ④ 交给调用方弹兜底弹窗
  return { ok: false, method: 'none' };
}

export default { copyText, copyByExecCommand };
