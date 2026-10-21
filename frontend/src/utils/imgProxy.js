/**
 * 跨域图片 → 同源代理地址
 * ------------------------------------------------------------
 * ⚠️ 2026-10-21 第五十九批：导出丢图三轮无解的根因只有一个词：**跨域**。
 *   · 跨域 `<img>`（没带 crossorigin）画进 canvas 会**污染画布** ⇒ `toDataURL` 抛错；
 *   · 带 crossorigin 又依赖对方回 CORS 头、且 `fetch` 不被系统拦 —— 真机上都不稳；
 *   · Safari 对跨域位图的二次解码还可能直接失败。
 *   ⇒ 后端 `/api/img?u=` 做了一层**只放行图片白名单域名**的同源代理。
 *     导出时把地址换成它：同源 ⇒ 画布不污染 ⇒ `toDataURL` 必成 ⇒ SVG 里必有图。
 *     与设备/引擎/网络策略无关，这是结构性修法，不是再打一个补丁。
 *
 * 单独放一个文件是为了让 `saveImage.js` 与 `cardExport.js` 都能用，
 * 又不产生循环依赖（saveImage → cardExport 是单向的）。
 */

export function proxiedSrc(src) {
  const s = String(src || '');
  if (!s || s.startsWith('data:') || s.startsWith('blob:')) return s;
  if (!/^https?:\/\//i.test(s)) return s; // 相对路径本来就是同源
  try {
    const u = new URL(s, location.href);
    if (u.origin === location.origin) return s;
  } catch {
    return s;
  }
  return `/api/img?u=${encodeURIComponent(s)}`;
}
