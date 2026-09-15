# -*- coding: utf-8 -*-
"""
md2html.py —— Markdown 转「可视化 HTML 文档」

用途：把作为内容源的 .md 渲染成排版干净、带自动目录的 HTML，方便阅读与演示。
      与 md2thesis.py 配合：同一份 md，一份出 Word 交作业，一份出 HTML 自己看。

用法：
  python md2html.py 输入.md 输出.html ["页面标题"]

依赖：markdown（已装）
"""
import html
import re
import sys

import markdown

CSS = """
:root{
  --bg:#f6f7f9; --card:#fff; --line:#e4e7ee;
  --tx:#1b2029; --tx2:#5b6572; --tx3:#8a93a1;
  --blue:#185FA5; --blue-bg:#E6F1FB; --teal:#0F6E56; --amber:#854F0B;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;
  font-size:15px;line-height:1.8}
.wrap{max-width:1000px;margin:0 auto;padding:34px 22px 90px}
header.masthead{background:var(--card);border:1px solid var(--line);border-radius:14px;
  padding:22px 26px;margin-bottom:22px}
header.masthead h1{margin:0 0 6px;font-size:24px;font-weight:700}
header.masthead .meta{color:var(--tx2);font-size:14px;margin:0}
nav.toc{background:var(--card);border:1px solid var(--line);border-radius:14px;
  padding:16px 22px;margin:0 0 26px}
nav.toc b{display:block;font-size:12.5px;color:var(--tx3);letter-spacing:.6px;margin-bottom:8px}
nav.toc a{color:var(--blue);text-decoration:none;font-size:14px;display:block;
  padding:2px 0;border-bottom:1px solid transparent}
nav.toc a:hover{background:var(--blue-bg);border-radius:4px}
nav.toc a.lv3{padding-left:20px;font-size:13.3px;color:var(--tx2)}
main{background:var(--card);border:1px solid var(--line);border-radius:14px;
  padding:28px 34px 42px}
main h1{display:none}
main h2{font-size:20px;font-weight:700;margin:38px 0 10px;padding-left:12px;
  border-left:4px solid var(--blue);scroll-margin-top:20px}
main h2:first-of-type{margin-top:8px}
main h3{font-size:16.5px;font-weight:700;margin:26px 0 8px;color:#26313f;scroll-margin-top:20px}
main h4{font-size:14.5px;font-weight:700;margin:18px 0 6px;color:var(--tx2)}
main p{margin:9px 0}
main strong{font-weight:700}
main table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
main th,main td{border:1px solid var(--line);padding:8px 11px;text-align:left;vertical-align:top}
main th{background:#f2f4f8;font-weight:700;font-size:13.2px;color:var(--tx2)}
main tr:nth-child(even) td{background:#fafbfd}
main code{background:#eef1f6;padding:1px 6px;border-radius:4px;
  font-family:Consolas,"Courier New",monospace;font-size:13px;color:#26313f}
main pre{background:#1f2430;color:#e7ecf3;padding:15px 17px;border-radius:10px;
  overflow-x:auto;font-size:13px;line-height:1.65}
main pre code{background:none;color:inherit;padding:0}
main blockquote{margin:14px 0;padding:10px 16px;background:var(--blue-bg);
  border-left:3px solid var(--blue);border-radius:0 8px 8px 0;color:#26313f;font-size:14.2px}
main blockquote p{margin:3px 0}
main ul,main ol{padding-left:24px;margin:9px 0}
main li{margin:4px 0}
main hr{border:none;border-top:1px solid var(--line);margin:26px 0}
footer{margin-top:26px;color:var(--tx3);font-size:13px;text-align:center}
"""

TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>{css}</style>
</head>
<body>
<div class="wrap">
<header class="masthead">
<h1>{title}</h1>
<p class="meta">{subtitle}</p>
</header>
<nav class="toc"><b>目录</b>
{nav}
</nav>
<main>
{body}
</main>
<footer>音格 · 毕业设计文档　｜　由 md2html.py 自动生成，内容源：{src}</footer>
</div>
</body>
</html>
"""


def build(src, dst, title=None):
    text = open(src, encoding="utf-8").read()

    # 取一级标题做页面标题，顶部 > 行做副标题
    m = re.match(r"^#\s+(.+)$", text, re.M)
    doc_title = title or (m.group(1).strip() if m else "文档")
    subs = re.findall(r"^>\s*(.+)$", text, re.M)
    subtitle = "　｜　".join(s.strip() for s in subs[:4])

    text = re.sub(r"^\s*\[TOC\]\s*$", "", text, flags=re.M)

    body = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])

    # 给 h2/h3 加锚点 id，并收集目录
    items = []

    def _h2(mo):
        i = len(items)
        t = re.sub(r"<[^>]+>", "", mo.group(1))
        items.append((2, t, "s%d" % i))
        return '<h2 id="s%d">%s</h2>' % (i, mo.group(1))

    def _h3(mo):
        i = len(items)
        t = re.sub(r"<[^>]+>", "", mo.group(1))
        items.append((3, t, "s%d" % i))
        return '<h3 id="s%d">%s</h3>' % (i, mo.group(1))

    body = re.sub(r"<h2>(.*?)</h2>", _h2, body, flags=re.S)
    body = re.sub(r"<h3>(.*?)</h3>", _h3, body, flags=re.S)

    nav = "\n".join(
        '<a class="lv%d" href="#%s">%s</a>' % (lv, aid, html.escape(t))
        for lv, t, aid in items if lv == 2
    )

    out = TEMPLATE.format(
        title=html.escape(doc_title), subtitle=html.escape(subtitle),
        css=CSS, nav=nav, body=body, src=src.split("\\")[-1].split("/")[-1],
    )
    with open(dst, "w", encoding="utf-8") as f:
        f.write(out)
    return dst, len(items)


if __name__ == "__main__":
    s, d = sys.argv[1], sys.argv[2]
    t = sys.argv[3] if len(sys.argv) > 3 else None
    path, n = build(s, d, t)
    print("已生成:", path, "（章节数 %d）" % n)
