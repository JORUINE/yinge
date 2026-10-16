# -*- coding: utf-8 -*-
"""
第四十批 · 生成 PWA 图标（「加到主画面」用）
====================================================================
用户拍板（2026-10-15）：**PWA 要做**，图标先不急，
"用占位符这种替代或者用**目前排行榜最高的专辑图片**放进去"。

本脚本就是那句话的可复跑实现：
  ① 从排行榜接口取当前第 1 名专辑的封面（`GET /api/rank/albums?limit=1`）
  ② 套上音格的「音乐海洋」渐变底 + 圆角 + 白描边，输出三种尺寸

⚠️ 为什么是"占位"而非终版：排行榜第一名会变，图标不该跟着变。
   正式上线前换一张固定素材即可 —— 改 `--source` 传本地图片路径，其余不变。
⚠️ maskable 安全区：Android 会把图标裁成圆形/水滴形，
   内容必须落在中心 80% 以内，所以封面只占 58.6%（300/512）。

用法：
  python make-pwa-icons.py --album-art /tmp/top.jpg --out ../public/icons
  或   python make-pwa-icons.py --source 我的图.png --out ../public/icons
"""
import argparse
import os
import sys
from PIL import Image, ImageDraw

BRAND_TOP = (125, 211, 252)   # #7DD3FC 天蓝
BRAND_MID = (14, 165, 233)    # #0EA5E9 主色
BRAND_DEEP = (3, 105, 161)    # #0369A1 深蓝


def ocean_gradient(size):
    """斜向渐变底：与 app 的「音乐海洋」调性一致"""
    base = Image.new("RGB", (size, size), BRAND_MID)
    px = base.load()
    for y in range(size):
        for x in range(size):
            # 左上 → 右下的对角权重
            t = (x + y) / (2 * (size - 1))
            if t < 0.5:
                k = t / 0.5
                c = tuple(round(BRAND_TOP[i] + (BRAND_MID[i] - BRAND_TOP[i]) * k) for i in range(3))
            else:
                k = (t - 0.5) / 0.5
                c = tuple(round(BRAND_MID[i] + (BRAND_DEEP[i] - BRAND_MID[i]) * k) for i in range(3))
            px[x, y] = c
    return base


def make_icon(src_path, size, out_path, cover_ratio=0.586, radius_ratio=0.115, border_ratio=0.016):
    canvas = ocean_gradient(size).convert("RGBA")
    d = ImageDraw.Draw(canvas)

    cover = Image.open(src_path).convert("RGBA")
    cw = int(size * cover_ratio)
    cover = cover.resize((cw, cw), Image.LANCZOS)

    # 圆角遮罩
    r = int(cw * (radius_ratio / cover_ratio) * 1.2)
    mask = Image.new("L", (cw, cw), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, cw - 1], radius=r, fill=255)

    # 白描边：先画一个略大的白色圆角块，再把封面贴上去
    b = max(2, int(size * border_ratio))
    ox = (size - cw) // 2
    oy = (size - cw) // 2
    d.rounded_rectangle([ox - b, oy - b, ox + cw + b - 1, oy + cw + b - 1], radius=r + b, fill=(255, 255, 255, 235))
    canvas.paste(cover, (ox, oy), mask)

    canvas.convert("RGB").save(out_path, "PNG", optimize=True)
    return out_path, os.path.getsize(out_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--album-art", help="排行榜第 1 名专辑封面（本地文件）")
    ap.add_argument("--source", help="直接指定素材图（优先于 --album-art）")
    ap.add_argument("--out", required=True, help="输出目录")
    args = ap.parse_args()

    src = args.source or args.album_art
    if not src or not os.path.exists(src):
        print(f"[x] 素材不存在：{src}", file=sys.stderr)
        return 2
    os.makedirs(args.out, exist_ok=True)

    jobs = [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]
    for name, size in jobs:
        p, sz = make_icon(src, size, os.path.join(args.out, name))
        print(f"  √ {name:24} {size}x{size}  {sz/1024:.1f} KB")
    print(f"\n素材来源：{src}")
    print("⚠️ 占位图标 —— 上线前可换固定素材（--source 传本地图即可），内容占比 58.6% 已按 maskable 安全区留白")
    return 0


if __name__ == "__main__":
    sys.exit(main())
