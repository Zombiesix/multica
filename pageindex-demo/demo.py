# -*- coding: utf-8 -*-
"""PageIndex 本地模式 demo：无向量、基于树推理的 RAG。

流程：
  1. 提交 PDF -> PageIndex 生成目录树索引（本地运行，走 LiteLLM 调模型）
  2. 打印生成的树结构（title / node_id / 页码范围 / summary）
  3. 用自然语言提问，展示带页码引用的回答

运行前：
  pip install pageindex pypdf reportlab
  python make_sample_pdf.py   # 生成 sample_report.pdf

模型后端通过环境变量配置（默认复用本机已配置的火山引擎 Ark 代理）：
  PAGEINDEX_MODEL        模型名，默认 openai/glm-5.3-flash
  OPENAI_API_KEY         API key
  OPENAI_API_BASE        OpenAI 兼容端点，默认 https://ark.cn-beijing.volces.com/api/plan/v3
"""
import json
import os
import sys

# Windows 控制台默认 GBK，强制 UTF-8 避免中文乱码
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ---- LiteLLM 环境（必须在导入 pageindex 之前设置好）----
os.environ.setdefault("OPENAI_API_BASE", "https://ark.cn-beijing.volces.com/api/plan/v3")
if not os.environ.get("OPENAI_API_KEY") and os.environ.get("ANTHROPIC_AUTH_TOKEN"):
    os.environ["OPENAI_API_KEY"] = os.environ["ANTHROPIC_AUTH_TOKEN"]

MODEL = os.environ.get("PAGEINDEX_MODEL", "openai/glm-5.3-flash")
PDF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample_report.pdf")
STORAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".pageindex_storage")

QUESTIONS = [
    "2025 年公司的净利润是多少？同比增长多少？",
    "研发投入占营收的比例是多少？研发人员有多少人？",
    "公司计划派发现金红利多少？分红率是多少？",
    "2026 年公司计划研发投入多少钱？",
]


def shorten(text: str, n: int = 120) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1] + "…"


def print_tree(node, indent=0):
    if isinstance(node, list):  # result 可能是节点列表
        for item in node:
            print_tree(item, indent)
        return
    pad = "  " * indent
    pages = f"p{node.get('start_index')}-{node.get('end_index')}"
    print(f"{pad}● {node.get('title')}  [{pages}]  <{node.get('node_id')}>")
    summary = node.get("summary")
    if summary:
        print(f"{pad}  摘要: {shorten(summary)}")
    for child in node.get("nodes") or []:
        print_tree(child, indent + 1)


def main():
    from pageindex import PageIndexLocalClient

    if not os.path.exists(PDF_PATH):
        sys.exit("找不到 sample_report.pdf，请先运行 python make_sample_pdf.py")

    client = PageIndexLocalClient(
        index_model=MODEL,          # 建索引用的模型（生成目录树 + 节点摘要）
        chat_model=MODEL,           # 问答用的模型
        storage_path=STORAGE,       # 本地索引存储目录
    )

    # ---------- 1. 提交文档并建立索引 ----------
    print("=" * 70)
    print("第 1 步：提交 PDF，生成 PageIndex 目录树索引（本地模式）…")
    print("=" * 70)
    doc = client.submit_document(PDF_PATH, wait=True)
    doc_id = doc["doc_id"]
    print(f"文档 ID: {doc_id}  名称: {doc['name']}")

    # ---------- 2. 查看生成的树 ----------
    print()
    print("=" * 70)
    print("第 2 步：生成的索引树（title / 页码范围 / 节点摘要）")
    print("=" * 70)
    tree = client.get_tree(doc_id, node_summary=True, include_text=False)
    if tree.get("result"):
        print_tree(tree["result"])
    else:
        print(json.dumps(tree, ensure_ascii=False)[:2000])

    # ---------- 3. 提问 ----------
    print()
    print("=" * 70)
    print("第 3 步：基于树的推理检索 + 问答（show_process 可见检索轨迹）")
    print("=" * 70)
    for q in QUESTIONS:
        print(f"\n❓ {q}\n")
        # stream + show_process：边推理边打印检索轨迹（树搜索过程）
        stream = client.chat(q, doc_id=doc_id, stream=True, show_process=True, citations=True)
        pieces = []
        for chunk in stream:
            print(chunk, end="", flush=True)
            pieces.append(chunk)
        answer = "".join(pieces)
        # 从回答中提取结构化引用（<cite doc= page=/> 标签）
        try:
            citations = client.get_citations(answer=answer, doc_id=doc_id)
            pages = sorted({c.get("page") for c in citations if c.get("page")})
            if pages:
                print(f"\n📄 引用页码: {pages}")
        except Exception as exc:  # 引用解析失败不影响主流程
            print(f"\n（引用解析跳过: {exc}）")


if __name__ == "__main__":
    main()
