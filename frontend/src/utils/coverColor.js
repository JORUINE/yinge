/**
 * 专辑主色：从封面像素里取（设计稿原意"背景跟着专辑变"）
 * ------------------------------------------------------------
 * 做法：把封面画到 24×24 的 canvas 上，加权平均出主色
 *   · 过滤过亮 / 过暗的像素（黑白封面的暗部不该把整张染黑）
 *   · 灰白 / 黑白封面：拿不到"彩色主色"时，返回中性灰（绝不退回随机高饱和色）
 *   · 取到的彩色色也压到友好区间（饱和度 / 亮度收口），避免荧光刺眼
 * 跨域失败 / 取色失败 → 返回 null，由调用方退回 albumId 哈希色（也已降饱和）
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

/** 把任意取到的主色压进"不刺眼"的友好区间（饱和度 8–46%，亮度 46–60%） */
function soften(rgb) {
  const m = rgb.match(/\d+/g);
  if (!m) return rgb;
  let [h, s, l] = rgbToHsl(+m[0], +m[1], +m[2]);
  s = Math.min(Math.max(s, 8), 46);
  l = Math.min(Math.max(l, 46), 60);
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

  const size = 24;
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

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0; // 彩色像素累计
  let gr = 0;
  let gg = 0;
  let gb = 0;
  let gn = 0; // 全部（含灰）像素累计
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i];
    const G = data[i + 1];
    const B = data[i + 2];
    const lum = 0.299 * R + 0.587 * G + 0.114 * B;
    if (lum < 20 || lum > 246) continue; // 太暗/太亮
    const sat = Math.max(R, G, B) - Math.min(R, G, B);
    gr += R; gg += G; gb += B; gn += 1; // 全部像素都计入，用于判断"这封面是不是灰的"
    if (sat < 14) continue; // 灰像素不进彩色累计
    r += R; g += G; b += B; n += 1;
  }
  if (!gn) return null; // 整张都太暗/太亮，取不到
  if (n) {
    // 有彩色像素：取彩色平均色，再压进友好区间
    return soften(`rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`);
  }
  // 纯灰 / 黑白封面：返回中性灰（带极弱的冷暖倾向，避免死板），绝不退回随机高饱和色
  const avgR = gr / gn;
  const avgG = gg / gn;
  const avgB = gb / gn;
  const neutralL = Math.min(Math.max(0.299 * avgR + 0.587 * avgG + 0.114 * avgB, 120), 200);
  // 蓝分量略高 → 偏冷灰；红分量略高 → 偏暖灰；否则中性冷灰
  const neutralH = avgB > avgR ? 215 : avgB < avgR ? 30 : 215;
  return hslToRgb(neutralH, 6, Math.round((neutralL / 255) * 100));
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
