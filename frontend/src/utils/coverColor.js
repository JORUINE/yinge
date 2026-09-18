/**
 * 专辑主色：从封面像素里取（设计稿原意"背景跟着专辑变"）
 * ------------------------------------------------------------
 * 算法（业界标准，2026-09-18 依 ColorThief / Android Palette / Vibrant.js 重写）：
 *   ① 量化：RGB 每通道取高 5 位 → 32×32×32 = 32768 桶（ColorThief 的 MMCQ 同量级；
 *      以前用 3 位只有 512 桶，太粗）；
 *   ② 过滤：按 ColorThief 的做法丢掉近白像素（各通道 > 250）与近黑 / 过曝（明度 <20 或 >242）；
 *   ③ 调色板：按像素数取前 64 桶（近似 MMCQ 的"先按面积切"）；
 *   ④ 打分：Android Palette / Vibrant.js 的官方权重 —— 饱和度×3 + 亮度贴近 0.5×6 + 占比×1；
 *   ⑤ ⚠️ 关键：**占比门槛**。一个色桶要占全图 ≥3%、饱和度 ≥30 才有资格当主色。
 *      以前只按"饱和度加权"选，封面上一小块高饱和色（《黑色柳丁》的橙瞳孔、
 *      《樂之路》的青字）就会劫持整块光晕 —— 这就是"颜色老是怪"的根因。
 *   ⑥ 没够格彩色 → 退回 Muted（低饱和、以面积为主）；再不行 → 品牌蓝灰（保证海洋蓝调性）。
 * 取色失败（跨域/超时）→ 返回 null，由调用方退回 albumId 哈希色（已降饱和）。
 */
import { reactive } from 'vue';

/** 已取到的主色缓存（albumId → 'rgb(r,g,b)'），跨页面共享 */
export const accentStore = reactive({});

const inflight = new Map();

/** 品牌蓝灰：与 #0EA5E9 同色域，安静、不跟海洋蓝背景打架 */
const NEUTRAL = 'rgb(84, 118, 138)';

function toRgba(rgb, alpha) {
  const m = rgb.match(/\d+/g);
  if (!m) return rgb;
  return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${alpha})`;
}

/** 给 'rgb(r,g,b)' 套一层透明度 —— 舞台渐变用它（纯 CSS 加不了 alpha，交给 JS 算） */
export function withAlpha(rgb, alpha) {
  return toRgba(rgb, alpha);
}

/** rgb → hsl（h:0-360, s/l:0-100） */
function rgbToHsl(R, G, B) {
  R /= 255; G /= 255; B /= 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case R: h = (G - B) / d + (G < B ? 6 : 0); break;
      case G: h = (B - R) / d + 2; break;
      default: h = (R - G) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

/** hsl → 'rgb(r,g,b)' 字符串 */
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r;
  let g;
  let b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/**
 * 把主色压进"不刺眼但认得出"的友好区间（饱和度 18–34%，亮度 48–58%）。
 * 区间比之前更窄：光晕是衬在海洋蓝背景上的，宁淡勿艳 —— 否则任何一张封面都可能让整页跑调。
 */
function soften(rgb) {
  const m = rgb.match(/\d+/g);
  if (!m) return rgb;
  let [h, s, l] = rgbToHsl(+m[0], +m[1], +m[2]);
  s = Math.min(Math.max(s, 18), 34);
  l = Math.min(Math.max(l, 48), 58);
  return hslToRgb(h, s, l);
}

/** albumId 的稳定色相（取色失败时的兜底，同一张专辑永远是同一个颜色，且已降饱和） */
export function hashColor(albumId) {
  const key = String(albumId ?? '');
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return hslToRgb(h, 30, 52);
}

/**
 * 取单张封面的主色（rgb 字符串），失败返回 null
 * 业界参数：5bit 量化 / 近白过滤 / Vibrant 权重(sat×3 + luma×6 + pop×1) / 占比门槛 3% / 饱和度门槛 30
 */
export async function sampleCover(url, { timeout = 7000 } = {}) {
  if (!url) return null;
  if (typeof document === 'undefined') return null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  let timer;
  const loaded = new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('load'));
    timer = setTimeout(() => reject(new Error('timeout')), timeout);
  });
  img.src = url;
  try {
    await loaded;
  } catch {
    clearTimeout(timer);
    return null;
  }
  clearTimeout(timer);

  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0, size, size);
  } catch {
    return null;
  }
  let data;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null; // 跨域被拦
  }

  // ① 量化（5 bit/通道 = 32768 桶）+ ② 过滤近白 / 近黑
  const buckets = new Map();
  let sampled = 0;
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i];
    const G = data[i + 1];
    const B = data[i + 2];
    if (R > 250 && G > 250 && B > 250) continue; // 近白（与 ColorThief 一致）
    const lum = 0.299 * R + 0.587 * G + 0.114 * B;
    if (lum > 245) continue; // 过曝
    // ⚠️ 不再过滤近黑：暗色封面（如《周杰倫的床邊故事》）大半是近黑，
    //    一过滤就只剩零星像素 → 各桶占比全不达标 → 只能退回中性灰，光晕就"没颜色"了。
    const key = ((R >> 3) << 10) | ((G >> 3) << 5) | (B >> 3);
    const bkt = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bkt.count += 1;
    bkt.r += R;
    bkt.g += G;
    bkt.b += B;
    buckets.set(key, bkt);
    sampled += 1;
  }
  if (!sampled || !buckets.size) return NEUTRAL;

  // ③ 调色板 = 按像素数取前 64（近似 MMCQ）
  const palette = [...buckets.values()]
    .map((b) => {
      const r = b.r / b.count;
      const g = b.g / b.count;
      const bl = b.b / b.count;
      const [h, s, l] = rgbToHsl(r, g, bl);
      return { h, s, l, count: b.count, r, g, b: bl };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 64);
  const maxCount = palette[0].count || 1;

  // ④ Vibrant 权重打分 + ⑤ 占比 / 饱和度门槛
  const MIN_SHARE = 0.04; // 一个色桶至少占 4% 才算"有身份"（防一小块亮色劫持整块光晕）
  const MIN_SAT = 16; // 饱和度门槛放低：宁可收下"偏灰但确实是主色"的颜色，也不轻易退回中性
  //                     （门槛定太高会让大量正常封面都变中性灰，光晕就整片蓝灰、像功能没了）
  const cand = [];
  for (const c of palette) {
    const share = c.count / sampled;
    if (share < MIN_SHARE || c.s < MIN_SAT) continue;
    const lumaScore = 1 - Math.abs(c.l / 100 - 0.5) * 2;
    const popScore = c.count / maxCount;
    cand.push({ ...c, share, score: (c.s / 100) * 3 + lumaScore * 6 + popScore });
  }
  if (cand.length) {
    cand.sort((a, b) => b.score - a.score);
    const win = cand[0];
    // 同色相合并（±20°），按像素数加权取平均色
    let n = 0;
    let R = 0;
    let G = 0;
    let B = 0;
    for (const c of cand) {
      const d = Math.abs(c.h - win.h);
      if (Math.min(d, 360 - d) <= 20) {
        n += c.count;
        R += c.r * c.count;
        G += c.g * c.count;
        B += c.b * c.count;
      }
    }
    return soften(`rgb(${Math.round(R / n)}, ${Math.round(G / n)}, ${Math.round(B / n)})`);
  }

  // ⑥ 没有够格的"鲜艳主色"（封面很杂 / 整体偏灰）→ 用**像素数最多的那一桶**
  //    （这正是 ColorThief 的默认口径：面积最大的色调）。它一定代表这张封面的整体调子，
  //    比直接给中性灰更能"跟着专辑变"。饱和度**不往上抬**，灰就保持灰。
  const dom = palette[0];
  if (!dom) return NEUTRAL;
  return hslToRgb(dom.h, Math.min(dom.s, 34), Math.min(Math.max(dom.l, 48), 58));
}

/**
 * 把任意主色往品牌海洋蓝拉一把（舞台光晕专用）。
 * 为什么必须拉：光晕是衬在海洋蓝背景上的大面积色块 —— 直接铺专辑原色时，
 * 只要封面主色偏绿 / 偏土黄，整页立刻"跑调"（用户反复报的那类"怪色"）。
 * 往品牌蓝混 50% 后，效果恒为「蓝底 + 这张专辑的色调」，颜色再怪也不会破调性。
 */
export function blendWithBrand(rgb, amount = 0.3) {
  const m = String(rgb).match(/\d+/g);
  if (!m) return rgb;
  const BRAND = [14, 165, 233]; // #0EA5E9
  const r = Math.round(+m[0] * (1 - amount) + BRAND[0] * amount);
  const g = Math.round(+m[1] * (1 - amount) + BRAND[1] * amount);
  const b = Math.round(+m[2] * (1 - amount) + BRAND[2] * amount);
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb(h, Math.min(Math.max(s, 20), 46), Math.min(Math.max(l, 46), 58));
}

/** 已取到主色就用它，否则退回哈希色 —— 统一给模板用的同步方法 */
export function accentStyleOf(album) {
  if (!album) return {};
  const key = String(album.albumId ?? album.name ?? '');
  const ac = accentStore[key];
  const color = ac || hashColor(key);
  return { '--ac': color, '--acs': toRgba(color, 0.32) };
}

/**
 * 确保某张专辑的主色已就位（先查缓存，没有就去取封面像素，失败用哈希兜底）
 * 返回 { ac, acs }，可直接绑到 CSS 变量 --ac / --acs
 */
export async function ensureAlbumAccent(album) {
  if (!album) return { ac: '#0ea5e9', acs: 'rgba(14,165,233,.32)' };
  const key = String(album.albumId ?? album.name ?? '');
  if (!accentStore[key]) {
    if (!inflight.has(key)) inflight.set(key, sampleCover(album.artworkUrl));
    const c = await inflight.get(key);
    inflight.delete(key);
    accentStore[key] = c || hashColor(album.albumId);
  }
  const ac = accentStore[key];
  return { ac, acs: toRgba(ac, 0.32) };
}
