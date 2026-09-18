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
 * 把主色压进"不刺眼但认得出"的友好区间（饱和度 18–44%，亮度 48–58%）。
 * 上限从 34 提到 44：光晕本身是半透明的，饱和度太低会让"光晕跟专辑不够呼应"
 * （用户反馈）；44% 仍在大面积色块的舒适范围内。
 */
function soften(rgb) {
  const m = rgb.match(/\d+/g);
  if (!m) return rgb;
  let [h, s, l] = rgbToHsl(+m[0], +m[1], +m[2]);
  s = Math.min(Math.max(s, 18), 44);
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
    // 首次失败（超时 / 网络抖动）→ 带 cache-buster 再试一次，减少"偶发取不到颜色"
    try {
      img.src = url + (url.includes('?') ? '&' : '?') + 'yc=' + Date.now();
      await new Promise((resolve, reject) => {
        const t2 = setTimeout(() => reject(new Error('timeout')), timeout);
        img.onload = () => {
          clearTimeout(t2);
          resolve();
        };
        img.onerror = () => {
          clearTimeout(t2);
          reject(new Error('load'));
        };
      });
    } catch {
      clearTimeout(timer);
      return null;
    }
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

  // ④ 按「色相家族」聚合（±30°），**以面积为准**选出这张封面的整体色调。
  //    为什么不再用"饱和度加权"：封面上的标题 / logo 常常是一小块高饱和色 ——
  //    实测《七里香》：红字只占 8%，而整片草地是低饱和的绿系（29%+29%+21%）；
  //    按饱和度选就会把 logo 当主色，于是"绿封面配出红晕"，用户看到的就是"完全一塌糊涂"。
  //    按面积选，小块 logo 永远赢不过大片场景。
  const families = [];
  for (const c of palette) {
    let f = families.find((x) => {
      const dd = Math.abs(x.h - c.h);
      return Math.min(dd, 360 - dd) <= 30;
    });
    if (!f) {
      f = { h: c.h, count: 0, r: 0, g: 0, b: 0 };
      families.push(f);
    }
    f.count += c.count;
    f.r += c.r * c.count;
    f.g += c.g * c.count;
    f.b += c.b * c.count;
  }
  families.sort((a, b) => b.count - a.count);
  const win = families[0];
  if (!win) return NEUTRAL;
  const [fh, fs, fl] = rgbToHsl(win.r / win.count, win.g / win.count, win.b / win.count);

  // ⑤ 整张几乎没有彩色的封面（黑白 / 纯灰，如 reputation）→ 品牌蓝灰，保持海洋蓝调性
  if (fs < 6) return NEUTRAL;

  // ⑥ 压进友好区间：饱和度略提一点（×1.25，下限 22%）让光晕"看得出是这张专辑"，
  //    但上限 46% 防止刺眼；亮度收到 **42–56%** ——
  //    ⚠️ 上一版放到 46–64% 的结果是光晕变成"浅色"，衬在浅色海洋蓝背景上几乎看不见
  //    （用户反馈的"蓝色专辑取不到蓝色"其实多数是**对比度太低**，不是取色错）。
  return hslToRgb(fh, Math.min(Math.max(fs * 1.25, 22), 46), Math.min(Math.max(fl, 42), 56));
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

/** 已取到主色就用它；**取不到就用中性蓝灰**（绝不再退回随机哈希色） */
export function accentStyleOf(album) {
  if (!album) return {};
  const key = String(album.albumId ?? album.name ?? '');
  const color = accentStore[key] || NEUTRAL;
  return { '--ac': color, '--acs': toRgba(color, 0.32) };
}

/**
 * 确保某张专辑的主色已就位（先查缓存，没有就去取封面像素）。
 * 取不到 → **中性蓝灰**（用户口径："实在取不到的颜色就用中性"）。
 * ⚠️ 不要再退回"按 albumId 算的随机色相"：那会让取色失败的封面凭空冒出绿 / 粉，
 *    看起来像"颜色乱套了"（用户报过"七里香变粉、Midnights 变绿"）。
 */
export async function ensureAlbumAccent(album) {
  if (!album) return { ac: NEUTRAL, acs: toRgba(NEUTRAL, 0.32) };
  const key = String(album.albumId ?? album.name ?? '');
  if (!accentStore[key]) {
    if (!inflight.has(key)) inflight.set(key, sampleCover(album.artworkUrl));
    const c = await inflight.get(key);
    inflight.delete(key);
    accentStore[key] = c || NEUTRAL;
  }
  const ac = accentStore[key];
  return { ac, acs: toRgba(ac, 0.32) };
}
