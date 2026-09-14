# -*- coding: utf-8 -*-
"""
ER 图生成器（零新依赖：仅用 Pillow，已安装）
用途：为《音格》毕业设计生成数据库 ER 图 PNG，可直接插入 Word 系统设计文档
运行：<venv>/python gen_er_diagram.py <输出png路径>
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

# ---------- 字体（Windows 自带中文字体，按优先级探测） ----------
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",      # 微软雅黑
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",    # 黑体
    r"C:\Windows\Fonts\simsun.ttc",    # 宋体
]
FONT_PATH = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
if not FONT_PATH:
    raise SystemExit("未找到可用中文字体")


def F(size):
    return ImageFont.truetype(FONT_PATH, size)


# ---------- 配色 ----------
BG = (255, 255, 255)
C_USER = (37, 99, 235)      # 蓝：用户域
C_MUSIC = (5, 150, 105)     # 绿：音乐数据域
C_BATTLE = (217, 119, 6)    # 橙：对决域
C_PSY = (124, 58, 237)      # 紫：测评域
C_LINE = (120, 130, 145)
C_TXT = (31, 36, 48)
C_SUB = (110, 120, 135)

# ---------- 表定义：类名 -> (中文名, 颜色, 字段列表) ----------
TABLES = {
    "users":                 ("用户", C_USER,   ["_id  PK", "account  账号", "passwordHash", "nickname", "role  角色"]),
    "favorites":             ("收藏", C_USER,   ["_id  PK", "userId  FK", "targetType", "targetId", "createdAt"]),
    "share_cards":           ("分享图记录", C_USER, ["_id  PK", "userId  FK", "type", "refId", "imageUrl"]),
    "artists":               ("歌手", C_MUSIC,  ["_id  PK", "artistId  外部ID", "name", "genre", "cachedAt"]),
    "albums":                ("专辑", C_MUSIC,  ["_id  PK", "albumId  外部ID", "artistId  FK", "name", "trackCount", "releaseDate"]),
    "tracks":                ("曲目", C_MUSIC,  ["_id  PK", "trackId  外部ID", "albumId  FK", "name", "previewUrl  试听"]),
    "battles":               ("对决", C_BATTLE, ["_id  PK", "userId  FK", "scopeType  范围", "status", "championAlbumId", "albumIds[]"]),
    "battle_matches":        ("对战场次", C_BATTLE, ["_id  PK", "battleId  FK", "roundIndex  轮次", "leftAlbumId  FK", "rightAlbumId  FK", "winnerAlbumId"]),
    "votes":                 ("投票", C_BATTLE, ["_id  PK", "matchId  FK", "albumId  FK", "userId  FK", "createdAt"]),
    "personality_questions": ("测评题目", C_PSY,    ["_id  PK", "order  题号", "type  题型", "title  题干", "options[{text,scores}]"]),
    "personality_types":     ("人格类型", C_PSY,    ["_id  PK", "code  类型码", "name  名称", "description", "recommendAlbumIds[]"]),
    "personality_results":   ("测评结果", C_PSY,    ["_id  PK", "userId  FK", "typeCode  FK", "answers[]", "scores{}", "aiComment  AI解读"]),
}

# ---------- 布局：4 列 × 3 行 ----------
LAYOUT = [
    ["users", "artists", "battles", "personality_questions"],
    ["favorites", "albums", "battle_matches", "personality_types"],
    ["share_cards", "tracks", "votes", "personality_results"],
]

# ---------- 关系线：(起点表, 终点表, 标签, 说明) ----------
RELATIONS = [
    ("users", "battles", "1:N", "发起对决"),
    ("users", "favorites", "1:N", "收藏"),
    ("users", "share_cards", "1:N", "生成分享图"),
    ("users", "votes", "1:N", "投票"),
    ("users", "personality_results", "1:N", "作答"),
    ("artists", "albums", "1:N", "拥有专辑"),
    ("albums", "tracks", "1:N", "包含曲目"),
    ("battles", "battle_matches", "1:N", "包含场次"),
    ("albums", "battle_matches", "N:M", "作为对阵双方"),
    ("battle_matches", "votes", "1:N", "产生投票"),
    ("personality_types", "personality_results", "1:N", "归属类型"),
]

# ---------- 画布参数 ----------
BOX_W, TITLE_H, ROW_H, PAD = 300, 44, 28, 14
COL_GAP, ROW_GAP = 170, 90
MARGIN_X, MARGIN_Y = 150, 96   # 左右留出「走线通道」，让连线绕开表格框
COLS, ROWS = 4, 3
W = MARGIN_X * 2 + COLS * BOX_W + (COLS - 1) * COL_GAP
H = MARGIN_Y + ROWS * 0 + MARGIN_Y  # 先占位，下面按内容重算

# 计算每个表的高度（随字段数变化）
def box_h(key):
    return TITLE_H + len(TABLES[key][2]) * ROW_H + PAD

# 每行高度取该行最高者
row_heights = [max(box_h(k) for k in row) for row in LAYOUT]
H = MARGIN_Y + sum(row_heights) + (ROWS - 1) * ROW_GAP + MARGIN_Y - 30

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)


def rounded(draw, box, r, fill, outline, width=2):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


# ---------- 计算每个表的矩形坐标 ----------
POS = {}
y = MARGIN_Y
for ri, row in enumerate(LAYOUT):
    x = MARGIN_X
    for key in row:
        h = box_h(key)
        POS[key] = (x, y, x + BOX_W, y + h)
        x += BOX_W + COL_GAP
    y += row_heights[ri] + ROW_GAP

# ---------- 先画关系线（在框下层） ----------
# 走线策略：所有跨列/跨多行的关系线，统统绕到画布左右两侧的「通道」上再折回，
# 保证不会穿过任何表格框。每条线占用独立的横向偏移，彼此不重叠。
COL_OF, ROW_OF = {}, {}
for _ri, _row in enumerate(LAYOUT):
    for _ci, _k in enumerate(_row):
        COL_OF[_k], ROW_OF[_k] = _ci, _ri


def route_kind(a, b):
    if COL_OF[b] > COL_OF[a]:
        return "R"
    if COL_OF[b] < COL_OF[a]:
        return "L"
    # 同一列：相邻行可垂直直连，跨行则必须绕通道
    if abs(ROW_OF[b] - ROW_OF[a]) == 1:
        return "V"
    return "L" if COL_OF[a] < 2 else "R"


CH_SP = 18
corridor = {"L": {}, "R": {}}
_cnt = {"L": 0, "R": 0}
pending_labels = []   # 关系标签延后绘制，避免被线/框遮挡

# 同一个表可能引出多条关系线，若都从框的正中间出线会挤在一起、标签重叠。
# 这里把出线点沿框的右/左侧边缘均匀错开。
out_by_src = {}
for rel in RELATIONS:
    out_by_src.setdefault(rel[0], []).append(rel)

exit_y = {}
for _src, _rels in out_by_src.items():
    _x1, _y1, _x2, _y2 = POS[_src]
    _top, _bot = _y1 + TITLE_H + 6, _y2 - 14
    _n = len(_rels)
    for _i, _r in enumerate(_rels):
        exit_y[_r] = (_top + _bot) / 2 if _n == 1 else _top + (_bot - _top) * _i / (_n - 1)

for rel in RELATIONS:
    k = route_kind(rel[0], rel[1])
    if k == "V":
        continue
    i = _cnt[k]
    corridor[k][rel] = (26 + i * CH_SP) if k == "L" else (W - 26 - i * CH_SP)
    _cnt[k] += 1

for a, b, card, label in RELATIONS:
    rel = (a, b, card, label)
    ax1, ay1, ax2, ay2 = POS[a]
    bx1, by1, bx2, by2 = POS[b]
    ay, by = (ay1 + ay2) / 2, (by1 + by2) / 2
    k = route_kind(a, b)
    sy = exit_y[rel]                      # 错开后的出线点，避免同一表的多条线挤在一起

    if k == "V":
        if by > ay:
            p1, p2 = ((ax1 + ax2) / 2, ay2), ((bx1 + bx2) / 2, by1)
        else:
            p1, p2 = ((ax1 + ax2) / 2, ay1), ((bx1 + bx2) / 2, by2)
        pts = [p1, p2]
        lab = ((ax1 + ax2) / 2 + 14, (p1[1] + p2[1]) / 2, "left")
    else:
        cx = corridor[k][rel]
        if k == "R":
            p1, p2 = (ax2, sy), (bx1, by)
            lab = (ax2 + 14, sy, "left")      # 标签紧贴源框出线口，落在列间空隙里
        else:
            p1, p2 = (ax1, sy), (bx2, by)
            lab = (ax1 - 14, sy, "right")
        pts = [p1, (cx, sy), (cx, by), p2]

    d.line(pts, fill=C_LINE, width=2, joint="curve")
    for p in (p1, p2):
        d.ellipse([p[0] - 4, p[1] - 4, p[0] + 4, p[1] + 4], fill=C_LINE)
    pending_labels.append((lab[0], lab[1], f"{label} · {card}", lab[2]))

# ---------- 再画表框 ----------
for key, (cn, color, fields) in TABLES.items():
    x1, y1, x2, y2 = POS[key]
    # 阴影
    rounded(d, (x1 + 3, y1 + 3, x2 + 3, y2 + 3), 10, (232, 236, 242), None, 0)
    # 主体
    rounded(d, (x1, y1, x2, y2), 10, (255, 255, 255), color, 2)
    # 标题栏
    rounded(d, (x1, y1, x2, y1 + TITLE_H), 10, color, color, 0)
    d.rectangle([x1, y1 + TITLE_H - 12, x2, y1 + TITLE_H], fill=color)
    ft = F(21)
    d.text((x1 + 16, y1 + 10), cn, font=ft, fill=(255, 255, 255))
    fk = F(15)
    kw = d.textlength(key, font=fk)
    d.text((x2 - 16 - kw, y1 + 15), key, font=fk, fill=(255, 255, 255, 220))
    # 字段行
    fr = F(16)
    for i, f in enumerate(fields):
        yy = y1 + TITLE_H + 8 + i * ROW_H
        col = C_TXT
        if "PK" in f:
            col = (200, 40, 40)
        elif "FK" in f:
            col = (30, 110, 200)
        d.text((x1 + 18, yy), f, font=fr, fill=col)

# ---------- 最后统一绘制关系标签（此时线上、框上都不会再覆盖它们） ----------
flab = F(15)
for lx, ly, txt, mode in pending_labels:
    tw = d.textlength(txt, font=flab)
    x0 = lx if mode == "left" else lx - tw
    d.rounded_rectangle([x0 - 8, ly - 12, x0 + tw + 8, ly + 12],
                        radius=6, fill=(248, 250, 252), outline=C_LINE, width=1)
    d.text((x0, ly - 10), txt, font=flab, fill=C_LINE)

# ---------- 标题与图例 ----------
ftig = F(30)
title = "图 1  《音格》数据库 ER 图（12 个集合）"
tw = d.textlength(title, font=ftig)
d.text(((W - tw) / 2, 26), title, font=ftig, fill=C_TXT)

leg = [("用户域", C_USER), ("音乐数据域", C_MUSIC), ("对决域", C_BATTLE), ("测评域", C_PSY)]
fx, fy = MARGIN_X, 66
fl = F(16)
for name, color in leg:
    d.rounded_rectangle([fx, fy + 4, fx + 18, fy + 18], radius=4, fill=color)
    d.text((fx + 26, fy), name, font=fl, fill=C_SUB)
    fx += 26 + d.textlength(name, font=fl) + 34
d.text((fx + 10, fy), "｜ 红色=主键 PK　　蓝色=外键 FK　　N:M=多对多", font=fl, fill=C_SUB)

out = sys.argv[1] if len(sys.argv) > 1 else "er_diagram.png"
img.save(out, "PNG")
print(f"OK -> {out}  ({W}x{H})")
print(f"字体: {FONT_PATH}")
print(f"表数: {len(TABLES)}  关系数: {len(RELATIONS)}")
