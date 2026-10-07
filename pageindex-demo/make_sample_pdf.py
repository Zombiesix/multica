# -*- coding: utf-8 -*-
"""生成一份带书签目录的样例 PDF（约 16 页），用于 PageIndex demo。

内容是一份虚构的「星澜科技 2025 年度报告」，章节里埋了若干精确事实
（营收、研发投入、人员数、分红等），方便后续用自然语言提问验证检索。
"""
import os

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)

# ---------- 中文字体 ----------
def register_chinese_font() -> str:
    """优先使用系统自带的中文字体，保证 PDF 可显示中文。"""
    candidates = [
        ("SimSun", r"C:\Windows\Fonts\simsun.ttc"),
        ("SimHei", r"C:\Windows\Fonts\simhei.ttf"),
        ("MicrosoftYaHei", r"C:\Windows\Fonts\msyh.ttc"),
    ]
    for name, path in candidates:
        if os.path.exists(path):
            pdfmetrics.registerFont(TTFont(name, path))
            return name
    raise RuntimeError("未找到中文字体，请检查 C:\\Windows\\Fonts")


FONT = register_chinese_font()

title_style = ParagraphStyle(
    "title", fontName=FONT, fontSize=22, leading=30, spaceAfter=12
)
h1 = ParagraphStyle("h1", fontName=FONT, fontSize=16, leading=22, spaceBefore=10)
body = ParagraphStyle(
    "body", fontName=FONT, fontSize=11, leading=18, spaceAfter=6
)

# 章节内容：(标题, [段落...])，段落里埋了可验证的精确数字
CHAPTERS = [
    ("第一章 公司简介", [
        "星澜科技股份有限公司成立于 2016 年 3 月，总部位于杭州，"
        "是一家专注于企业级智能文档处理的人工智能公司。",
        "公司使命是「让每一份长文档都能被秒级读懂」。截至 2025 年底，"
        "公司员工总数为 486 人，其中研发人员占比 62%。",
    ]),
    ("第二章 财务摘要", [
        "2025 年公司实现营业收入 12.6 亿元，同比增长 18.4%；"
        "净利润为 2.31 亿元，同比增长 9.7%。",
        "经营活动产生的现金流量净额为 3.05 亿元。截至 2025 年 12 月 31 日，"
        "公司货币资金余额为 8.72 亿元，资产负债率为 23.8%。",
        "董事会提议每 10 股派发现金红利 4.5 元（含税），"
        "合计派发现金红利 6120 万元，分红率为 26.5%。",
    ]),
    ("第三章 业务回顾", [
        "2025 年公司核心产品「星澜文档云」签约客户 1240 家，"
        "同比增长 41%，其中金融机构客户 320 家。",
        "公司在 2025 年 6 月发布了多模态解析引擎 3.0，"
        "将平均文档解析耗时从 4.2 秒降低到 1.1 秒。",
    ]),
    ("第四章 研发投入", [
        "2025 年研发投入为 2.89 亿元，占营业收入的 22.9%，"
        "同比增长 15.3%。研发人员共 301 人。",
        "全年新增发明专利授权 37 项，累计持有发明专利 126 项。"
        "公司在文档结构识别方向发表顶会论文 6 篇。",
    ]),
    ("第五章 风险因素", [
        "报告期内，公司识别出三类主要风险：一是大模型服务成本波动风险；"
        "二是数据合规与隐私保护风险；三是核心技术人员流失风险。",
        "针对模型成本风险，公司已与三家算力供应商签订三年期框架协议，"
        "锁定推理单价不高于现行价格的 85%。",
    ]),
    ("第六章 未来展望", [
        "2026 年公司计划将海外市场收入占比提升至 15% 以上，"
        "重点拓展东南亚与中东市场。",
        "公司预计 2026 年研发投入将达到 3.6 亿元，"
        "主要用于多模态大模型与推理加速方向。",
    ]),
]

FILLER = (
    "本节其余部分为演示填充文本，用于撑足页面，使文档达到可供树索引的页数。"
    "PageIndex 的核心思想是不切分文档，而是为文档构建一棵层级化的目录树："
    "每个节点保存标题、页码范围与内容摘要，检索时通过树搜索加多步推理定位答案。"
    "传统 RAG 将文档切成固定大小的块并依赖向量相似度召回，"
    "在长文档场景下容易丢失章节上下文；PageIndex 则模拟人类阅读方式，"
    "先看目录、再跳到相关章节细读，并返回带精确页码引用的检索轨迹。"
) * 3


def build(out_path: str) -> None:
    doc = SimpleDocTemplate(
        out_path,
        pagesize=A4,
        leftMargin=25 * mm,
        rightMargin=25 * mm,
        topMargin=25 * mm,
        bottomMargin=20 * mm,
        title="星澜科技 2025 年度报告",
        author="PageIndex Demo",
    )

    story = [
        Spacer(1, 60 * mm),
        Paragraph("星澜科技股份有限公司", title_style),
        Paragraph("2025 年年度报告", title_style),
        Spacer(1, 20 * mm),
        Paragraph("（虚构文件，仅用于 PageIndex 检索演示）", body),
        PageBreak(),
    ]

    bookmark_pages = []
    for i, (heading, paras) in enumerate(CHAPTERS):
        story.append(Paragraph(heading, h1))
        bookmark_pages.append((heading, i + 1))
        for p in paras:
            story.append(Paragraph(p, body))
        story.append(Paragraph(FILLER, body))
        story.append(PageBreak())

    def on_page(canvas, _doc):
        canvas.saveState()
        canvas.setFont(FONT, 9)
        canvas.drawCentredString(A4[0] / 2, 10 * mm, f"- {canvas.getPageNumber()} -")
        canvas.restoreState()

    def after_flowable(flowable):
        """把一级标题写入 PDF 书签（大纲），供 PageIndex 识别目录。"""
        if isinstance(flowable, Paragraph):
            text = flowable.getPlainText()
            for heading, key in bookmark_pages:
                if text == heading:
                    self = after_flowable  # noqa: F841  (placeholder, unused)
                    key_name = f"ch{key}"
                    canvas_like = after_flowable.canv
                    canvas_like.bookmarkPage(key_name)
                    canvas_like.addOutlineEntry(heading, key_name, level=0)

    # SimpleDocTemplate 的 afterFlowable 是方法；这里通过子类方式注入
    class DocWithOutline(type(doc)):
        def afterFlowable(self, flowable):
            if isinstance(flowable, Paragraph):
                text = flowable.getPlainText()
                for heading, key in bookmark_pages:
                    if text == heading:
                        key_name = f"ch{key}"
                        self.canv.bookmarkPage(key_name)
                        self.canv.addOutlineEntry(heading, key_name, level=0)

    DocWithOutline(
        out_path,
        pagesize=A4,
        leftMargin=25 * mm,
        rightMargin=25 * mm,
        topMargin=25 * mm,
        bottomMargin=20 * mm,
        title="星澜科技 2025 年度报告",
        author="PageIndex Demo",
    ).build(story, onFirstPage=on_page, onLaterPages=on_page)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample_report.pdf")
    build(out)
    print(f"OK -> {out}")
