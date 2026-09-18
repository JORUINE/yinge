/**
 * 专辑主色：从封面像素里取（设计稿原意"背景跟着专辑变"）
 * ------------------------------------------------------------
 * 做法（业界管线，Spotify / ColorThief 同思路）：
 *   把封面画到 48×48 的 canvas 上 → RGB 分桶量化 →
 *   滤掉近黑/近白/低饱和像素 → 按「像素数 × 鲜艳度」选出主色桶 →
 *   同色相合并 → 压进友好区间。
 *   ⚠️ 不要用"彩色像素求平均"：平均法会把封面平均成谁也不像的颜色（已踩坑）。
 * 灰白 / 黑白封面：没有彩色身份 → 返回中性灰（绝不退回随机高饱和色）。
 * 跨域失败 / 取色失败 → 返回 null，由调用方退回 albumId 哈希色（已降饱和）。
 */
import { reactive } from 'vue';

/** 已取到的主色缓存（albumId → 'rgb(r,g,b)'），跨页面共享 */
export const accentStore = reactive({});

const inflight = new Map();

function toRgba(rgb, alpha) {
  const m = rgb.match(/\d+/g);
  if (!m) return rgb;
  return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${alpha})`;
}

/** rgb → hsl（h:0-360, s/l:0-100），用于把刺眼色压进友好区间 */
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

/** 把主色压进"不刺眼但认得出"的友好区间（饱和度 16–40%，亮度 46–62%） */
function soften(rgb) {
  const m = rgb.match(/\d+/g);
  if (!m) return rgb;
  let [h, s, l] = rgbToHsl(+m[0], +m[1], +m[2]);
  s = Math.min(Math.max(s, 16), 40);
  l = Math.min(Math.max(l, 46), 62);
  return hslToRgb(h, s, l);
}

/** albumId 的稳定色相（取色失败时的兜底，同一张专辑永远是同一个颜色，且已降饱和） */
export function hashColor(albumId) {
  const key = String(albumId ?? '');
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  // 兜底也走友好区间：饱和度压到 36%、亮度 50%，不再用 70% 满饱和（避免灰封面变荧光色）
  return hslToRgb(h, 36, 50);
}

/** 取单张封面的主色（rgb 字符串），失败返回 null */
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

  const size = 48; // 量化需要比 24 更多的样本才稳
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

  // ① 量化：RGB 每通道取高 3 位 → 8×8×8 = 512 个色桶
  const buckets = new Map();
  const gray = { count: 0, r: 0, g: 0, b: 0 };
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i];
    const G = data[i + 1];
    const B = data[i + 2];
    const lum = 0.299 * R + 0.587 * G + 0.114 * B;
    if (lum < 26 || lum > 238) continue; // 近黑 / 近白：不属于封面的"身份色"
    const sat = Math.max(R, G, B) - Math.min(R, G, B);
    if (sat < 26) {
      // 低饱和：进灰池（黑白封面的兜底用）
      gray.count += 1;
      gray.r += R;
      gray.g += G;
      gray.b += B;
      continue;
    }
    const key = ((R >> 5) << 10) | ((G >> 5) << 5) | (B >> 5);
    const bkt = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bkt.count += 1;
    bkt.r += R;
    bkt.g += G;
    bkt.b += B;
    buckets.set(key, bkt);
  }

  // ② 纯灰 / 黑白 / 大面积浅色封面：中性灰，安静不抢戏。
  //    判据：没有彩色桶，或彩色像素不到灰像素的 6 成（浅色 / 暖白封面）→ 认作"没有彩色身份"，
  //    不硬凑一个彩色（否则白底封面会跑出粉/紫，这正是之前"颜色怪"的来源）。
  const coloredPixels = [...buckets.values()].reduce((sum, b) => sum + b.count, 0);
  if (!buckets.size || coloredPixels < gray.count * 0.6) {
    if (!gray.count) return null; // 整张都太暗 / 太亮
    const lum = (0.299 * gray.r + 0.587 * gray.g + 0.114 * gray.b) / gray.count;
    const l = Math.min(Math.max(Math.round((lum / 255) * 100), 46), 58);
    return hslToRgb(215, 6, l);
  }

  // ③ 打分：像素数 × 鲜艳度（"大面积的鲜艳色"才是这张封面的角色色）
  const scored = [];
  for (const bkt of buckets.values()) {
    const r = bkt.r / bkt.count;
    const g = bkt.g / bkt.count;
    const b = bkt.b / bkt.count;
    const [h, s, l] = rgbToHsl(r, g, b);
    const score = bkt.count * (0.15 + (s / 100) * 0.85) * (1 - Math.abs(l - 52) / 150);
    scored.push({ h, s, l, count: bkt.count, r: bkt.r, g: bkt.g, b: bkt.b, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // ④ 同色相合并（±26°）：防止冠军桶只是封面角落里一小块高饱和
  const win = scored[0];
  let count = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (const s of scored) {
    const d = Math.abs(s.h - win.h);
    if (Math.min(d, 360 - d) <= 26) {
      count += s.count;
      rSum += s.r;
      gSum += s.g;
      bSum += s.b;
    }
  }
  return soften(`rgb(${Math.round(rSum / count)}, ${Math.round(gSum / count)}, ${Math.round(bSum / count)})`);
}

/** 已取到主色就用它，否则退回哈希色 —— 统一给模板用的同步方法 */
export function accentStyleOf(album) {
  if (!album) return {};
  const key = String(album.albumId ?? album.name ?? '');
  const ac = accentStore[key];
  const color = ac || hashColor(key);
  return { '--ac': color, '--acs': toRgba(color, 0.34) };
}

/**
 * 确保某张专辑的主色已就位（先查缓存，没有就去取封面像素，失败用哈希兜底）
 * 返回 { ac, acs }，可直接绑到 CSS 变量 --ac / --acs
 */
export async function ensureAlbumAccent(album) {
  if (!album) return { ac: '#0ea5e9', acs: 'rgba(14,165,233,.34)' };
  const key = String(album.albumId ?? album.name ?? '');
  if (!accentStore[key]) {
    const c = await sampleCover(album.artworkUrl);
    accentStore[key] = c || hashColor(album.albumId);
  }
  const ac = accentStore[key];
  return { ac, acs: toRgba(ac, 0.34) };
}
