# -*- coding: utf-8 -*-
"""
md2thesis.py —— Markdown 直出「中文毕业论文格式」Word

为什么不用 HTML 转 Word：
  HTML 转 Word 时 CSS 的很多属性（列宽、行距、字体回退）会被忽略，
  只能靠反复试。本脚本用 python-docx 直接写 OOXML，每一项都写死，结果确定。

用法：
  python md2thesis.py 输入.md 输出.docx
  python md2thesis.py 输入.md 输出.docx --no-indent   # 不要首行缩进

支持的 Markdown 语法：
  # 一级标题（黑体三号）      ## 二级标题（黑体四号）     ### 三级标题（黑体小四）
  普通段落（宋体小四、1.5 倍行距、首行缩进 2 字符）
  - 列表项
  > 抬头行（用于封面信息，自动加下划线，不缩进）
  | 表格 | 表头 |  （支持简单表格）
  __u{文字}__   在段落内给「文字」加下划线（填空线用）
"""
import re
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

# ---------- 字体与字号 ----------
SONG, HEI = "宋体", "黑体"
SZ_BODY = Pt(12)        # 小四
SZ_H1 = Pt(16)          # 三号
SZ_H2 = Pt(14)          # 四号
SZ_H3 = Pt(12)          # 小四


def set_run(run, font_cn, size, bold=False, underline=False):
    """设置 run 的字体。中文必须同时写 ascii 与 eastAsia，否则 Word 会回退成默认字体。"""
    run.font.name = font_cn
    run.font.size = size
    run.font.bold = bold
    run.font.underline = underline
    run.font.color.rgb = RGBColor(0, 0, 0)
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rfonts)
    rfonts.set(qn("w:ascii"), font_cn)
    rfonts.set(qn("w:hAnsi"), font_cn)
    rfonts.set(qn("w:eastAsia"), font_cn)


def add_rich(p, text, font_cn=SONG, size=SZ_BODY, bold=False, base_underline=False):
    """解析 __u{...}__ 标记，分段加下划线"""
    for seg, is_u in _split_underline(text):
        r = p.add_run(seg)
        set_run(r, font_cn, size, bold, underline=(is_u or base_underline))


def _split_underline(text):
    out, pos = [], 0
    for m in re.finditer(r"__u\{(.*?)\}__", text):
        if m.start() > pos:
            out.append((text[pos:m.start()], False))
        out.append((m.group(1), True))
        pos = m.end()
    if pos < len(text):
        out.append((text[pos:], False))
    return out or [(text, False)]


def setup_page(doc):
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)   # A4
    sec.top_margin, sec.bottom_margin = Cm(2.54), Cm(2.54)
    sec.left_margin, sec.right_margin = Cm(3.17), Cm(3.17)
    # 正文默认样式
    st = doc.styles["Normal"]
    st.font.name = SONG
    st.font.size = SZ_BODY
    st.element.rPr.rFonts.set(qn("w:eastAsia"), SONG)


def build(src, dst, indent=True):
    lines = open(src, encoding="utf-8").read().splitlines()
    doc = Document()
    setup_page(doc)

    pending_table = []

    def flush_table():
        if not pending_table:
            return
        rows = [c.strip(" |") for c in pending_table]
        grid = [[c.strip() for c in r.split("|")] for r in rows]
        ncol = max(len(r) for r in grid)
        t = doc.add_table(rows=0, cols=ncol)
        t.style = "Table Grid"
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        for ri, row in enumerate(grid):
            cells = t.add_row().cells
            for ci in range(ncol):
                txt = row[ci] if ci < len(row) else ""
                cells[ci].text = ""
                p = cells[ci].paragraphs[0]
                r = p.add_run(txt)
                set_run(r, HEI if ri == 0 else SONG, Pt(10.5), bold=(ri == 0))
                p.paragraph_format.line_spacing = 1.0
        pending_table.clear()

    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            flush_table()
            continue

        # 表格
        if line.lstrip().startswith("|"):
            pending_table.append(line.strip())
            continue
        flush_table()

        # 抬头行（封面信息，带下划线，不缩进）
        if line.startswith(">"):
            p = doc.add_paragraph()
            p.paragraph_format.line_spacing = 1.5
            p.paragraph_format.space_after = Pt(0)
            add_rich(p, line.lstrip("> ").strip(), SONG, SZ_BODY)
            continue

        # 标题
        if line.startswith("###"):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(6)
            p.paragraph_format.line_spacing = 1.5
            add_rich(p, line.lstrip("# ").strip(), HEI, SZ_H3)
            continue
        if line.startswith("##"):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after = Pt(6)
            p.paragraph_format.line_spacing = 1.5
            add_rich(p, line.lstrip("# ").strip(), HEI, SZ_H2)
            continue
        if line.startswith("#"):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after = Pt(12)
            p.paragraph_format.line_spacing = 1.5
            add_rich(p, line.lstrip("# ").strip(), HEI, SZ_H1)
            continue

        # 列表
        if re.match(r"^[-*]\s", line):
            p = doc.add_paragraph()
            p.paragraph_format.line_spacing = 1.5
            p.paragraph_format.left_indent = Pt(24)
            p.paragraph_format.space_after = Pt(0)
            add_rich(p, "· " + line[2:].strip(), SONG, SZ_BODY)
            continue

        # 正文段落
        p = doc.add_paragraph()
        p.paragraph_format.line_spacing = 1.5
        p.paragraph_format.space_after = Pt(0)
        if indent:
            p.paragraph_format.first_line_indent = Pt(24)   # 2 字符
        add_rich(p, line.strip(), SONG, SZ_BODY)

    flush_table()

    # 关键：不写入任何「域」（PAGE / NUMPAGES / TOC），
    # 否则 Word 每次打开都会弹「是否更新该文档中的这些域？」
    doc.settings.element.remove(
        doc.settings.element.find(
            "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}updateFields"
        )
    ) if doc.settings.element.find(
        "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}updateFields"
    ) is not None else None

    doc.save(dst)
    return dst


if __name__ == "__main__":
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src.rsplit(".", 1)[0] + ".docx"
    ind = "--no-indent" not in sys.argv
    out = build(src, dst, indent=ind)
    print("已生成:", out)
