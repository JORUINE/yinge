# -*- coding: utf-8 -*-
"""
md2thesis.py v2 —— Markdown 直出「中文毕业论文格式」Word

v2 修复了 v1 的倒退（v1 只用直接格式，把 Word 的语义结构丢了）：
  1. 标题改用 Word 内置样式 Title / Heading 1 / Heading 2 / Heading 3
     → 导航窗格可用、大纲级别正确、可被目录引用
  2. 支持 [TOC] 标记，插入真实目录域（配 tools/add_toc.py 刷出页码）
  3. 参考文献等列表改为 [1] [2] 悬挂缩进编号（符合 GB/T 7714 习惯）
  4. 页脚自动加页码（宋体小五居中）
  5. 仍然：不写 updateFields（弹窗来源）

用法：
  python md2thesis.py 输入.md 输出.docx [--no-indent]

Markdown 约定：
  # 文档主标题      → Word Title（居中黑体二号，不进目录）
  ## 一级章节       → Heading 1（黑体三号，进目录）
  ### 二级小节      → Heading 2（黑体四号，进目录）
  #### 三级标题     → Heading 3（黑体小四，不进目录）
  > 抬头行          → 封面信息，不缩进
  - 列表项          → [1] [2] 悬挂缩进
  [TOC]             → 此处插入目录
  __u{文字}__       → 给文字加下划线（填空线）
"""
import re
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

SONG, HEI = "宋体", "黑体"

H_SPEC = {
    "Title":     (HEI, Pt(22), True, WD_ALIGN_PARAGRAPH.CENTER, 12, 18),
    "Heading 1": (HEI, Pt(16), True, WD_ALIGN_PARAGRAPH.LEFT,   12, 6),
    "Heading 2": (HEI, Pt(14), True, WD_ALIGN_PARAGRAPH.LEFT,   10, 6),
    "Heading 3": (HEI, Pt(12), True, WD_ALIGN_PARAGRAPH.LEFT,   6,  6),
}


def set_font(run, cn, size, bold=False, underline=False):
    """中文必须同时写 ascii / hAnsi / eastAsia，只写 font.name 无效。"""
    run.font.name = cn
    run.font.size = size
    run.font.bold = bold
    if underline:                     # 只在下划线为真时写，否则会写出 <w:u w:val="none"/>
        run.font.underline = True
    run.font.color.rgb = RGBColor(0, 0, 0)
    rpr = run._element.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rf)
    for k in ("w:ascii", "w:hAnsi", "w:eastAsia"):
        rf.set(qn(k), cn)


def split_u(text):
    out, pos = [], 0
    for m in re.finditer(r"__u\{(.*?)\}__", text):
        if m.start() > pos:
            out.append((text[pos:m.start()], False))
        out.append((m.group(1), True))
        pos = m.end()
    if pos < len(text):
        out.append((text[pos:], False))
    return out or [(text, False)]


def add_rich(p, text, cn=SONG, size=Pt(12), bold=False):
    for seg, u in split_u(text):
        set_font(p.add_run(seg), cn, size, bold, underline=u)


def style_font(doc, name, cn, size, bold):
    st = doc.styles[name]
    st.font.name = cn
    st.font.size = size
    st.font.bold = bold
    st.font.color.rgb = RGBColor(0, 0, 0)
    rpr = st.element.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rf)
    for k in ("w:ascii", "w:hAnsi", "w:eastAsia"):
        rf.set(qn(k), cn)


def setup(doc):
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.top_margin = sec.bottom_margin = Cm(2.54)
    sec.left_margin = sec.right_margin = Cm(3.17)

    n = doc.styles["Normal"]
    n.font.name = SONG
    n.font.size = Pt(12)
    n.element.rPr.rFonts.set(qn("w:eastAsia"), SONG)

    for name, (cn, size, bold, _, _, _) in H_SPEC.items():
        style_font(doc, name, cn, size, bold)

    fp = sec.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = fp.add_run()
    set_font(r, SONG, Pt(9))
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    fp._p.append(fld)


def add_toc(doc):
    """标题用直接格式（不进目录），再插目录域。"""
    t = doc.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    t.paragraph_format.space_before = Pt(12)
    t.paragraph_format.space_after = Pt(12)
    add_rich(t, "目　　录", HEI, Pt(16), bold=True)

    p = doc.add_paragraph()
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), r'TOC \o "1-2" \h \z \u')
    inner = OxmlElement("w:r")
    it = OxmlElement("w:t")
    it.text = "（运行 tools/add_toc.py 或在本页按 F9 生成页码）"
    inner.append(it)
    fld.append(inner)
    p._p.append(fld)


def add_table(doc, rows):
    grid = [[c.strip() for c in r.strip(" |").split("|")] for r in rows]
    ncol = max(len(r) for r in grid)
    t = doc.add_table(rows=0, cols=ncol)
    t.style = "Table Grid"
    for ri, row in enumerate(grid):
        cells = t.add_row().cells
        for ci in range(ncol):
            txt = row[ci] if ci < len(row) else ""
            cells[ci].text = ""
            p = cells[ci].paragraphs[0]
            set_font(p.add_run(txt), HEI if ri == 0 else SONG, Pt(10.5), bold=(ri == 0))
            p.paragraph_format.line_spacing = 1.0
    return t


def build(src, dst, indent=True):
    lines = open(src, encoding="utf-8").read().splitlines()
    doc = Document()
    setup(doc)

    tbl_buf, list_n = [], 0

    def flush_tbl():
        if tbl_buf:
            add_table(doc, tbl_buf)
            tbl_buf.clear()

    for raw in lines:
        line = raw.rstrip()

        if line.lstrip().startswith("|"):
            tbl_buf.append(line)
            continue
        flush_tbl()

        if not line.strip():
            list_n = 0
            continue

        if line.strip() == "[TOC]":
            list_n = 0
            add_toc(doc)
            continue

        if line.startswith(">"):
            list_n = 0
            p = doc.add_paragraph()
            p.paragraph_format.line_spacing = 1.5
            p.paragraph_format.space_after = Pt(0)
            add_rich(p, line.lstrip("> ").strip())
            continue

        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            list_n = 0
            lvl = len(m.group(1))
            text = m.group(2).strip()
            style = {1: "Title", 2: "Heading 1", 3: "Heading 2", 4: "Heading 3"}[lvl]
            cn, size, bold, align, sb, sa = H_SPEC[style]
            p = doc.add_paragraph(style=style)
            p.alignment = align
            p.paragraph_format.space_before = Pt(sb)
            p.paragraph_format.space_after = Pt(sa)
            p.paragraph_format.line_spacing = 1.5
            add_rich(p, text, cn, size, bold=bold)
            continue

        if re.match(r"^[-*]\s", line):
            list_n += 1
            p = doc.add_paragraph()
            p.paragraph_format.line_spacing = 1.5
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.left_indent = Pt(24)
            p.paragraph_format.first_line_indent = Pt(-24)
            add_rich(p, f"[{list_n}] {line[2:].strip()}")
            continue

        list_n = 0
        p = doc.add_paragraph()
        p.paragraph_format.line_spacing = 1.5
        p.paragraph_format.space_after = Pt(0)
        if indent:
            p.paragraph_format.first_line_indent = Pt(24)
        add_rich(p, line.strip())

    flush_tbl()

    s = doc.settings.element
    node = s.find(qn("w:updateFields"))
    if node is not None:
        s.remove(node)

    doc.save(dst)
    return dst


if __name__ == "__main__":
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src.rsplit(".", 1)[0] + ".docx"
    print("已生成:", build(src, dst, indent="--no-indent" not in sys.argv))
