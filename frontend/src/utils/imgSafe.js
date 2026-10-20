/**
 * 封面图「带 crossorigin 加载」的安全网
 * ============================================================
 * ⚠️ 2026-10-21 第五十六批：导出丢封面的**真因**
 *   页面上的 `<img>` 如果**没写 `crossorigin`**，浏览器按 no-cors 模式拉图：
 *     · 图**能正常显示**（用户看不出任何问题）
 *     · 但 `drawImage()` 会把画布**污染** ⇒ `toDataURL()` 抛 SecurityError
 *       ⇒ 导出时这张图只能变成空白框（用户说的"丢图"）
 *   所以结算页 / 对位赛战报 / 晋级图 / 人格卡的封面统一加了 `crossorigin="anonymous"`。
 *
 * ⚠️ 但加了 crossorigin 就有新风险：**如果某张图的服务器不回 CORS 头，
 *    浏览器会直接拒绝渲染**（图裂）。这比"导出丢图"更严重 —— 那是**页面上看不见图**。
 *
 * ⇒ 这里挂一个**捕获阶段的全局兜底**：
 *     任何带 crossorigin 的 img 加载失败 → **去掉 crossorigin 重试一次**（无 CORS 模式）。
 *   结果是：最坏情况退回"能看但导出丢这张"，**永远不会从"能看"变成"裂图"**。
 *
 * 只重试一次（用 dataset 打标），避免死循环。
 */
export function installImgCrossOriginFallback() {
  if (typeof window === 'undefined') return;
  if (window.__yingeImgFallbackInstalled) return;
  window.__yingeImgFallbackInstalled = true;

  // 捕获阶段：img 的 error 不冒泡，只能在 window 的捕获阶段接住
  window.addEventListener(
    'error',
    (e) => {
      const el = e.target;
      if (!el || el.tagName !== 'IMG') return;
      if (el.dataset.coRetried === '1') return;
      if (!el.hasAttribute('crossorigin')) return;
      el.dataset.coRetried = '1';
      el.removeAttribute('crossorigin');
      const src = el.getAttribute('src');
      if (!src) return;
      // 加个无副作用的参数强制重新发起请求（不带 CORS 头）
      el.setAttribute('src', src + (src.includes('?') ? '&' : '?') + '_noco=1');
    },
    true,
  );
}
