/**
 * 专辑主色：从封面像素里取（设计稿原意"背景跟着专辑变"）
 * ------------------------------------------------------------
 * 做法：把封面画到 24×24 的 canvas 上，加权平均出主色
 *   · 过滤过亮 / 过暗的像素（黑白封面的暗部不该把整张染黑）
 *   · 过滤低饱和像素（灰白封面拿不到颜色时返回 null，调用方退回哈希色）
 * 需要 crossOrigin（iTunes 的 mzstatic 图源通常允许）；
 * 跨域失败 / 取色失败 → 返回 null，由调用方退回 albumId 哈希色。
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

/** albumId 的稳定色相（取色失败时的兜底，同一张专辑永远是同一个颜色） */
export function hashColor(albumId) {
  const key = String(albumId ?? '');
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 52%)`;
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
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i];
    const G = data[i + 1];
    const B = data[i + 2];
    const lum = 0.299 * R + 0.587 * G + 0.114 * B;
    if (lum < 20 || lum > 246) continue; // 太暗/太亮
    const sat = Math.max(R, G, B) - Math.min(R, G, B);
    if (sat < 14) continue; // 太灰
    r += R;
    g += G;
    b += B;
    n += 1;
  }
  if (!n) return null;
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
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
