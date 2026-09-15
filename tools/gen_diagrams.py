# -*- coding: utf-8 -*-
"""
gen_diagrams.py —— 用 Graphviz 生成毕业论文所需的专业图表

产出三张（PNG + SVG 各一份）：
  1. 系统架构图（三层 + 外部服务）
  2. 数据库 ER 图（按业务域分组，标注 PK/FK 与 1:N / N:M）
  3. 专辑对决赛程流程图

依赖：本机 Graphviz（winget install Graphviz.Graphviz，已装 16.1.0）
中文必须显式指定 fontname，否则会渲染成方框。

用法：
  python gen_diagrams.py <输出目录>
"""
import os
import subprocess
import sys

DOT = r"C:\Program Files\Graphviz\bin\dot.exe"
FONT = "Microsoft YaHei"

# ---------------- 业务域配色 ----------------
C_USER, C_MUSIC, C_BATTLE, C_PSY = "#2563EB", "#059669", "#D97706", "#7C3AED"
DOMAIN_COLOR = {"用户域": C_USER, "音乐数据域": C_MUSIC, "对决域": C_BATTLE, "测评域": C_PSY}

# ---------------- 表定义：表名 -> (中文名, 域, [(字段, 类型, 键)]) ----------------
TABLES = {
    "users": ("用户", "用户域", [
        ("_id", "ObjectId", "PK"), ("account", "String", ""), ("passwordHash", "String", ""),
        ("nickname", "String", ""), ("role", "String", ""), ("createdAt", "Date", "")]),
    "favorites": ("收藏", "用户域", [
        ("_id", "ObjectId", "PK"), ("userId", "ObjectId", "FK"), ("targetType", "String", ""),
        ("targetId", "ObjectId", ""), ("createdAt", "Date", "")]),
    "share_cards": ("分享图记录", "用户域", [
        ("_id", "ObjectId", "PK"), ("userId", "ObjectId", "FK"), ("type", "String", ""),
        ("refId", "ObjectId", ""), ("imageUrl", "String", ""), ("createdAt", "Date", "")]),
    "artists": ("歌手", "音乐数据域", [
        ("_id", "ObjectId", "PK"), ("artistId", "Number", "外部ID"), ("name", "String", ""),
        ("genre", "String", ""), ("cachedAt", "Date", "")]),
    "albums": ("专辑", "音乐数据域", [
        ("_id", "ObjectId", "PK"), ("albumId", "Number", "外部ID"), ("artistId", "ObjectId", "FK"),
        ("name", "String", ""), ("artworkUrl", "String", ""), ("trackCount", "Number", ""),
        ("releaseDate", "Date", "")]),
    "tracks": ("曲目", "音乐数据域", [
        ("_id", "ObjectId", "PK"), ("trackId", "Number", "外部ID"), ("albumId", "ObjectId", "FK"),
        ("name", "String", ""), ("previewUrl", "String", "试听"), ("duration", "Number", "")]),
    "battles": ("对决", "对决域", [
        ("_id", "ObjectId", "PK"), ("userId", "ObjectId", "FK"), ("scopeType", "String", "范围"),
        ("scopeKey", "String", ""), ("status", "String", ""), ("albumIds", "Array", ""),
        ("championAlbumId", "ObjectId", "FK")]),
    "battle_matches": ("对战场次", "对决域", [
        ("_id", "ObjectId", "PK"), ("battleId", "ObjectId", "FK"), ("roundIndex", "Number", "轮次"),
        ("leftAlbumId", "ObjectId", "FK"), ("rightAlbumId", "ObjectId", "FK"),
        ("winnerAlbumId", "ObjectId", "FK"), ("isRevival", "Boolean", "复活赛")]),
    "votes": ("投票", "对决域", [
        ("_id", "ObjectId", "PK"), ("matchId", "ObjectId", "FK"), ("albumId", "ObjectId", "FK"),
        ("userId", "ObjectId", "FK"), ("createdAt", "Date", "")]),
    "personality_questions": ("测评题目", "测评域", [
        ("_id", "ObjectId", "PK"), ("order", "Number", "题号"), ("type", "String", "题型"),
        ("title", "String", ""), ("audioRef", "String", "听感题"), ("options", "Array", "")]),
    "personality_types": ("人格类型", "测评域", [
        ("_id", "ObjectId", "PK"), ("code", "String", "类型码"), ("name", "String", ""),
        ("description", "String", ""), ("recommendAlbumIds", "Array", "")]),
    "personality_results": ("测评结果", "测评域", [
        ("_id", "ObjectId", "PK"), ("userId", "ObjectId", "FK"), ("typeCode", "String", "FK"),
        ("answers", "Array", ""), ("scores", "Object", ""), ("aiComment", "String", "AI解读"),
        ("createdAt", "Date", "")]),
}

# (起点, 终点, 关系标签)
RELATIONS = [
    ("users", "battles", "发起"), ("users", "favorites", "收藏"), ("users", "share_cards", "生成"),
    ("users", "votes", "投票"), ("users", "personality_results", "作答"),
    ("artists", "albums", "拥有"), ("albums", "tracks", "包含"),
    ("battles", "battle_matches", "包含"), ("albums", "battle_matches", "对阵"),
    ("battle_matches", "votes", "产生"), ("personality_types", "personality_results", "归属"),
]

HEADER = (
    '  graph [fontname="{f}", bgcolor="white", compound=true];\n'
    '  node  [fontname="{f}", shape=plaintext, fontsize=11];\n'
    '  edge  [fontname="{f}", fontsize=9, color="#7A8A9E", arrowsize=0.7];\n'
).format(f=FONT)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def table_html(name, cname, domain, fields):
    c = DOMAIN_COLOR[domain]
    r = [f'<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="4" '
         f'BGCOLOR="white" COLOR="{c}">']
    r.append(f'<TR><TD COLSPAN="3" BGCOLOR="{c}"><FONT COLOR="white"><B>'
             f'{esc(cname)}　{esc(name)}</B></FONT></TD></TR>')
    for fn, ft, fk in fields:
        bold = " PK" if fk == "PK" else ""
        kc = {"PK": "#B45309", "FK": "#1D4ED8"}.get(fk, "#64748B")
        # 空标签会被 Graphviz 判为语法错误，占位用 &nbsp;
        kt = f'<FONT COLOR="{kc}">{esc(fk)}</FONT>' if fk else "&nbsp;"
        r.append(f'<TR><TD ALIGN="LEFT" PORT="{esc(fn)}">'
                 f'<FONT COLOR="#1F2430">{esc(fn)}{bold}</FONT></TD>'
                 f'<TD ALIGN="LEFT"><FONT COLOR="#6E7887" POINT-SIZE="9">{esc(ft)}</FONT></TD>'
                 f'<TD ALIGN="LEFT"><FONT POINT-SIZE="9">{kt}</FONT></TD></TR>')
    r.append("</TABLE>")
    return "<" + "".join(r) + ">"


def er_dot():
    L = ["digraph ER {", HEADER,
         '  graph [rankdir=LR, splines=spline, nodesep=0.45, ranksep=1.1];']
    by_domain = {}
    for t, (cn, d, fs) in TABLES.items():
        by_domain.setdefault(d, []).append(t)
    for d, tables in by_domain.items():
        L.append(f'  subgraph cluster_{abs(hash(d)) % 10000} {{')
        L.append(f'    label="{esc(d)}"; fontname="{FONT}"; fontsize=13; '
                 f'fontcolor="{DOMAIN_COLOR[d]}"; color="{DOMAIN_COLOR[d]}"; '
                 f'style="rounded,dashed"; penwidth=1.2; margin=14;')
        for t in tables:
            cn, dd, fs = TABLES[t]
            L.append(f'    {t} [label={table_html(t, cn, dd, fs)}];')
        L.append("  }")
    for a, b, lab in RELATIONS:
        L.append(f'  {a} -> {b} [taillabel="1", headlabel="N", label=" {esc(lab)} ", '
                 f'labeldistance=1.6, labelangle=28];')
    L.append("}")
    return "\n".join(L)


def _layer(title, color, rows, note=None):
    """把一层画成「带标题栏的表格块」，比散落的小方框可读性高得多。

    注意：HTML 标签里不能出现空的 <FONT></FONT>，Graphviz 会直接报 syntax error，
    空单元格一律用 &nbsp; 占位。
    """
    span = max(len(r) for r in rows)
    r = [f'<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="7" '
         f'COLOR="{color}" BGCOLOR="white">']
    r.append(f'<TR><TD COLSPAN="{span}" BGCOLOR="{color}">'
             f'<FONT COLOR="white"><B>{esc(title)}</B></FONT></TD></TR>')
    for row in rows:
        r.append("<TR>" + "".join(f'<TD ALIGN="LEFT">{esc(c)}</TD>' for c in row) + "</TR>")
    if note:
        r.append(f'<TR><TD COLSPAN="{span}" BGCOLOR="#F8FAFC" ALIGN="LEFT">'
                 f'<FONT POINT-SIZE="9" COLOR="#64748B">{esc(note)}</FONT></TD></TR>')
    r.append("</TABLE>")
    return "<" + "".join(r) + ">"


def arch_dot():
    client = _layer("客户端", C_USER, [["浏览器（PC / 移动端）"]],
                    "Chrome / Edge · 响应式布局")
    front = _layer("展示层 · 前端应用（Vue 3 + Vite）", C_USER, [
        ["首页 / 排行榜", "专辑对决", "音乐人格测评"],
        ["结果分享图", "个人中心", "后台管理"]],
        "Pinia 状态管理 · Vue Router 路由 · Axios 请求 · Element Plus 组件 · html2canvas 分享图")
    back = _layer("业务服务层 · Node.js + Express", C_MUSIC, [
        ["用户认证服务", "音乐数据代理与缓存", "对决业务服务"],
        ["测评业务服务", "榜单统计服务", "后台管理服务"]],
        "JWT 鉴权 · bcrypt 加密 · 输入校验 · 统一响应中间件")
    data = _layer("数据层", C_BATTLE, [["MongoDB（Mongoose 建模，12 张集合）"]],
                  "用户 / 收藏 / 分享图 / 歌手 / 专辑 / 曲目 / 对决 / 场次 / 投票 / 题目 / 人格类型 / 测评结果")
    ext = _layer("外部服务", C_PSY, [
        ["iTunes Search API（音乐元数据 + 30 秒试听）"],
        ["大语言模型接口（人格解读文案生成）"]],
        "免密钥 · 无版权风险 · 可公开部署")
    dep = _layer("部署方案", "#64748B", [
        ["前端 → 静态托管平台", "后端 → 云应用托管平台", "数据库 → 云数据库服务"]],
        "三端独立部署，提供可公开访问的线上地址")

    return f"""digraph ARCH {{
{HEADER}
  graph [rankdir=TB, nodesep=0.45, ranksep=0.8];
  node  [shape=box, style="filled", penwidth=0, margin=0, fillcolor="white"];

  client [label={client}];
  front  [label={front}];
  back   [label={back}];
  data   [label={data}];
  ext    [label={ext}];
  dep    [label={dep}];

  client -> front [label=" HTTP / HTTPS "];
  front  -> back  [label=" REST API（JSON）· JWT "];
  back   -> data  [label=" Mongoose ODM "];
  back   -> ext   [label=" 外部调用（HTTPS） ", style=dashed];
  data   -> dep   [label=" 部署 "];

  {{ rank=same; data; ext; }}
}}"""


def bracket_dot():
    return f"""digraph BRACKET {{
{HEADER}
  graph [rankdir=TB, nodesep=0.4, ranksep=0.6];
  node  [shape=box, style="rounded,filled", penwidth=1.3, fontsize=11];

  start [label="选择范围\\n歌手 / 流派 / 年代", fillcolor="#EFF6FF", color="{C_USER}"];
  fetch [label="拉取专辑清单\\n（iTunes Search API + 本地缓存）", fillcolor="#EFF6FF", color="{C_USER}"];
  gen   [label="生成对阵表\\n（非 2 的幂次时安排轮空）", fillcolor="#FFFBEB", color="{C_BATTLE}"];
  grp   [label="小组赛\\n两两 PK · 每场可试听 30 秒", fillcolor="#FFFBEB", color="{C_BATTLE}"];
  rev   [label="复活赛\\n小组第三名争夺剩余名额", fillcolor="#FEF3C7", color="{C_BATTLE}"];
  ko    [label="淘汰赛\\n逐轮晋级", fillcolor="#FFFBEB", color="{C_BATTLE}"];
  fin   [label="冠军产生", fillcolor="#FEF2F2", color="#DC2626"];
  share [label="「夺冠之路」分享图\\n（html2canvas 导出）", fillcolor="#FDF2F8", color="{C_PSY}"];
  rank  [label="写入全球最受欢迎专辑榜", fillcolor="#ECFDF5", color="{C_MUSIC}"];
  vote  [label="用户逐场投票（可试听）", shape=box, style="rounded,filled",
         fillcolor="#F8FAFC", color="#94A3B8"];

  start -> fetch -> gen -> grp -> rev -> ko -> fin -> share -> rank;
  grp -> ko [label=" 直接晋级 ", constraint=false];
  vote -> grp [style=dashed, arrowhead=none];
  vote -> ko  [style=dashed, arrowhead=none];
}}"""


def render(dot_src, outbase):
    tmp = outbase + ".dot"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(dot_src)
    outs = []
    for fmt in ("png", "svg"):
        o = f"{outbase}.{fmt}"
        cmd = [DOT, f"-T{fmt}"]
        if fmt == "png":
            cmd += ["-Gdpi=150"]
        cmd += [tmp, "-o", o]
        subprocess.run(cmd, check=True)
        outs.append(o)
    return outs


if __name__ == "__main__":
    outdir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(outdir, exist_ok=True)
    for name, src in [("系统架构图", arch_dot()),
                      ("ER图-音格数据库-graphviz", er_dot()),
                      ("专辑对决赛程流程图", bracket_dot())]:
        files = render(src, os.path.join(outdir, name))
        sizes = ", ".join(f"{os.path.basename(p)} {os.path.getsize(p)}B" for p in files)
        print(f"  ✅ {name}: {sizes}")
