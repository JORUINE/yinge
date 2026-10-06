/**
 * 虚化底图工具（2026-10-06）
 * ------------------------------------------------------------
 * 从 `BattleShareView.vue` 的分享卡虚化底抽出来的通用版。
 *
 * ⚠️ 为什么一定要在 canvas 里做，而不能用 CSS：
 *   `filter: blur()` / `backdrop-filter` **html2canvas 不渲染**，导出时整层丢掉。
 *   分享卡要导出，所以必须预先把图糊好再当图片用。
 *   （结果页这块面板不在导出范围内 —— `.cardshot` 才是导出目标 —— 但沿用同一套做法，
 *     一是观感一致，二是万一以后要把面板一起导出也不会翻车。）
 *
 * ⚠️ 三个不能用的做法（都踩过）：
 *   ❌ CSS `filter: blur()`
 *   ❌ `backdrop-filter`
 *   ❌ 只铺径向渐变 —— 那是"色晕"不是"模糊"
 *   ❌ 把图缩到 56px 再放大 —— 双线性插值把像素边缘拉成方块，看着是**马赛克**不是模糊
 *
 * 参数取自分享卡 2026-09-22 二次调参后定稿的值（用户确认过"能隐约看出封面的构图"）：
 *   采样 320 → 模糊半径 S/22 ≈ 15px，再 saturate(1.45) brightness(1.12) 把纱幕压过的灰补回来。
 * 这里默认采样更小一点（300）并且**不缩放**（保持素材原始比例），
 * 让调用方用 CSS 的 `background-size: cover` 去取景 —— 取景是表现层的事，不该烧进位图。
 */

/** 不支持 ctx.filter 时的兜底：乒乓降采样（逐级 1/2 缩小再放大，等效低通，不会出马赛克） */
function blurByPingPong(ctx, img, w, h) {
  const steps = [];
  let cur = document.createElement('canvas');
  cur.width = w;
  cur.height = h;
  cur.getContext('2d').drawImage(img, 0, 0, w, h);
  let cw = w, ch = h;
  while (cw > 12 && ch > 12) {
    cw = Math.max(12, Math.round(cw / 2));
    ch = Math.max(12, Math.round(ch / 2));
    const next = document.createElement('canvas');
    next.width = cw;
    next.height = ch;
    next.getContext('2d').drawImage(cur, 0, 0, cw, ch);
    steps.push(next);
    cur = next;
  }
  for (let i = steps.length - 2; i >= 0; i -= 1) {
    const target = steps[i];
    const tctx = target.getContext('2d');
    tctx.clearRect(0, 0, target.width, target.height);
    tctx.drawImage(cur, 0, 0, target.width, target.height);
    cur = target;
  }
  ctx.drawImage(cur, 0, 0, w, h);
}

/**
 * 把一张图做虚化，返回 dataURL。
 * @param {string} src 同源图片路径（跨域要先设 crossOrigin，否则 canvas 被污染、toDataURL 抛错）
 * @param {{long?:number, blurDiv?:number, saturate?:number, brightness?:number, quality?:number, wash?:number}} opt
 * @returns {Promise<string>} dataURL；失败返回 ''（调用方退回纯色渐变，页面依旧可读）
 */
export async function makeBlurBackdrop(src, opt = {}) {
  const {
    long = 300,        // 长边采样尺寸：太小放大后出马赛克，太大浪费
    blurDiv = 22,      // 模糊半径 = long / blurDiv（分享卡定稿值 320/22≈15）
    saturate = 1.45,
    brightness = 1.12,
    quality = 0.9,
    /**
     * ⭐ `wash`：在糊完之后**再叠一层白**，把位图压成"浅色调"（0.45 = 45% 白 + 55% 虚化图）。
     * 为什么必须有：面板上的文字是品牌色（暗），底色太暗就读不清。
     * 直接把糊好的原图铺上去，探索者（暗金棕）、旋律捕手（夜色紫）这两张会把面板压到灰黑。
     * 先在**位图里**洗白，CSS 那层的纱幕就能调薄 ⇒ 虚化质感透得出来、文字还读得清。
     * （洗白必须画在 canvas 里 —— CSS 的 filter 导出时会被 html2canvas 丢掉。）
     */
    wash = 0.45,
  } = opt;
  if (!src) return '';
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('load fail'));
      img.src = src;
    });
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return '';
    const k = long / Math.max(nw, nh);
    const w = Math.max(8, Math.round(nw * k));
    const h = Math.max(8, Math.round(nh * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    // ⚠️ 过扫（overscan）：模糊会采样到画布外变成透明，成图边缘会有一圈渐隐白边。
    //    先按 1.18 倍画大一圈，让"虚掉的边"落在画布之外。
    const OS = 1.18;
    const bw = w * OS, bh = h * OS;
    const radius = Math.round(long / blurDiv);
    ctx.filter = `blur(${radius}px) saturate(${saturate}) brightness(${brightness})`;
    let supported = typeof ctx.filter === 'string' && ctx.filter !== 'none';
    if (supported) {
      ctx.drawImage(img, (w - bw) / 2, (h - bh) / 2, bw, bh);
      ctx.filter = 'none';
      // 有些浏览器会悄悄吃掉不支持的部分（读回只剩部分函数）→ 再确认一次
      if (ctx.filter !== 'none') supported = false;
    }
    if (!supported) {
      ctx.filter = 'none';
      ctx.clearRect(0, 0, w, h);
      blurByPingPong(ctx, img, w, h);
    }
    // 洗白：把糊好的图压成"浅色调"，CSS 纱幕才敢调薄（见上面 wash 的说明）
    if (wash > 0) {
      ctx.save();
      ctx.globalAlpha = wash;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    return c.toDataURL('image/jpeg', quality);
  } catch (err) {
    // ⚠️ 不要静默吞掉：之前这里 `catch { return '' }`，结果"虚化底没出来"在页面上完全看不出，
    //    自检只能报一个 false，查下去才发现是这里吞掉了真正的异常。失败要喊一声。
    console.warn('[blurBackdrop] 生成失败：', err);
    return '';
  }
}
