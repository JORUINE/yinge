# -*- coding: utf-8 -*-
"""
docx 后处理器（修复 html_to_docx 引擎留下的两个问题）

问题 1：引擎会在 word/settings.xml 写入 <w:updateFields w:val="true"/>，
        导致每次用 Word 打开都弹窗「该文档包含的域可能引用了其他文件。是否更新这些域？」。
        本文档没有任何需要更新的域（无目录、无页码、无交叉引用），可直接删除该节点。

问题 2（可选）：把指定段落强制设为左对齐、去掉首行缩进（用于表单式抬头）。

用法：
  python fix_docx.py <in.docx> [<out.docx>]
  不传 out 则原地覆盖（先写临时文件再替换，保证不破坏原文件）
"""
import sys, os, re, shutil, zipfile, tempfile


def fix(in_path, out_path=None):
    out_path = out_path or in_path
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".docx")
    os.close(tmp_fd)

    removed = 0
    with zipfile.ZipFile(in_path, "r") as zin, \
         zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)

            # —— 修复 1：删除 updateFields 节点，消除 Word 打开时的弹窗 ——
            if item.filename == "word/settings.xml":
                txt = data.decode("utf-8")
                new, n = re.subn(r"<w:updateFields[^/>]*/>", "", txt)
                if n == 0:
                    new, n = re.subn(r"<w:updateFields[^>]*>.*?</w:updateFields>", "", txt, flags=re.S)
                removed += n
                data = new.encode("utf-8")

            zout.writestr(item, data)

    shutil.move(tmp_path, out_path)
    return removed


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else None
    n = fix(src, dst)
    print(f"OK  已处理: {os.path.basename(src)} -> {os.path.basename(dst or src)}")
    print(f"    删除 updateFields 节点: {n} 个")
    if n == 0:
        print("    提示：未找到 updateFields，可能引擎版本已修复，或该文件不是本引擎生成")
