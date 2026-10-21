/**
 * 封面同源代理 `GET /api/img?u=<原图地址>`
 * ============================================================
 * ⚠️⚠️ 2026-10-21 第五十九批：**为什么需要它**
 *   导出图片时要把 `<img>` 的位图搬进 canvas，再转成 dataURL 塞进 SVG。
 *   而这一步在真机（iOS Safari / 微信内置浏览器）上极不稳定：
 *     · 图是跨域的（`is1-ssl.mzstatic.com`）⇒ 只要没带 `crossorigin` 就**污染画布**；
 *     · 带了 `crossorigin` 时，`fetch` 仍可能被系统策略拦下；
 *     · `canvas` 与 `Safari` 的二次解码又会偶发 `The source image cannot be decoded`。
 *   三轮真机反馈都是同一表现：**文字在、图没了**。
 *
 *   根因只有一个：**跨域**。
 *   ⇒ 后端把图**转一手**：同源、带长缓存、带 `Access-Control-Allow-Origin`。
 *     前端导出时只要把封面地址换成这个代理地址，
 *     `drawImage` 就永远不污染画布、`toDataURL` 永远可用、SVG 里也一定有图 ——
 *     与设备、引擎、网络策略都无关。
 *
 * ⚠️ 安全边界：
 *   ① **只允许白名单域名**（iTunes / Apple 的封面 CDN），不做开放代理；
 *   ② 只允许 http/https、只返回图片 content-type；
 *   ③ 有超时与体积上限（防止被拿去做慢速大文件中转）。
 */

import { Router } from 'express';

const router = Router();

/** 允许代理的域名（子域匹配） */
const ALLOW_HOSTS = [
  'mzstatic.com', // Apple / iTunes 封面（本项目唯一外部图源）
  'music.126.net',
  'p1.music.126.net',
  'p2.music.126.net',
];

const MAX_BYTES = 8 * 1024 * 1024; // 8MB：封面不可能这么大
const TIMEOUT_MS = 8000;

function hostAllowed(host) {
  const h = String(host || '').toLowerCase();
  return ALLOW_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

router.get('/', async (req, res) => {
  const raw = String(req.query.u || '');
  if (!raw) return res.status(400).json({ code: 4000, message: '缺少 u 参数' });

  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).json({ code: 4001, message: 'u 不是合法地址' });
  }
  if (!/^https?:$/.test(target.protocol)) {
    return res.status(400).json({ code: 4002, message: '只支持 http/https' });
  }
  if (!hostAllowed(target.hostname)) {
    return res.status(403).json({ code: 4003, message: '该域名不在代理白名单内' });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(target.toString(), {
      signal: ctrl.signal,
      headers: { Accept: 'image/*' },
    });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\//i.test(type)) {
      return res.status(502).json({ code: 4004, message: `上游返回 ${r.status} / ${type}` });
    }
    const len = Number(r.headers.get('content-length') || 0);
    if (len && len > MAX_BYTES) {
      return res.status(413).json({ code: 4005, message: '图片过大' });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) {
      return res.status(502).json({ code: 4006, message: '图片内容异常' });
    }
    // 封面 URL 带版本号，内容不会变 ⇒ 长缓存，避免每次导出都回源
    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=604800, immutable');
    // 同源其实不需要 CORS，但加上无害：万一以后前端换域名也能用
    res.set('Access-Control-Allow-Origin', '*');
    return res.send(buf);
  } catch (err) {
    return res.status(504).json({ code: 4007, message: err?.name === 'AbortError' ? '上游超时' : '取图失败' });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
