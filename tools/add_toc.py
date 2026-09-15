# -*- coding: utf-8 -*-
"""
add_toc.py —— 用本机 Word 刷新目录页码

为什么必须调 Word：
  目录里的页码取决于「这一章排在第几页」，而分页结果只有排版引擎自己知道。
  纯 Python 写不出来，只能让 Word 打开一次、更新域、再存回去。

做法：
  调本机 Microsoft Word（COM 自动化），后台打开 → 更新所有域与目录 → 保存 → 关闭。
  更新后目录里是**真实文字**，且不写 updateFields，所以以后打开不会再弹「是否更新域」。

用法：
  python add_toc.py <文件.docx>
"""
import os
import sys


def refresh(path):
    import win32com.client as win32

    path = os.path.abspath(path)
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    word = win32.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    doc = None
    try:
        doc = word.Documents.Open(path, ReadOnly=False)
        # 目录要连更新两轮：第一轮排完、分页变化后第二轮页码才准
        for _ in range(2):
            doc.Repaginate()
            for i in range(1, doc.TablesOfContents.Count + 1):
                doc.TablesOfContents(i).Update()
            for i in range(1, doc.Fields.Count + 1):
                try:
                    doc.Fields(i).Update()
                except Exception:
                    pass
        n = doc.TablesOfContents.Count
        doc.Save()
        return n
    finally:
        if doc is not None:
            doc.Close(0)
        word.Quit()


if __name__ == "__main__":
    p = sys.argv[1]
    cnt = refresh(p)
    print(f"已刷新：{os.path.basename(p)}（目录数 = {cnt}）")
