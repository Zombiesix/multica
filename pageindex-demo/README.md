# PageIndex 本地运行 Demo

基于 [VectifyAI/PageIndex](https://github.com/VectifyAI/PageIndex) 的 Python SDK，
演示**无向量、基于目录树推理的 RAG**：不切 chunk、不建向量库，
而是为 PDF 生成一棵带页码范围和摘要的目录树，问答时通过树检索定位答案，
并返回精确的页码引用（`<cite doc= page=/>`）。

## 文件说明

| 文件 | 作用 |
|---|---|
| [make_sample_pdf.py](make_sample_pdf.py) | 生成虚构的《星澜科技 2025 年度报告》PDF（7 页，带 PDF 书签目录，内含精确数字事实） |
| [demo.py](demo.py) | 主流程：提交 PDF → 生成树索引 → 打印树 → 多轮提问并展示检索轨迹与页码引用 |
| [sample_report.pdf](sample_report.pdf) | 生成的样例文档 |
| `.pageindex_storage/` | 本地索引存储目录（自动生成） |

## 快速开始

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt

# 模型后端：任何 LiteLLM 支持的 OpenAI 兼容端点均可
export OPENAI_API_KEY="你的 key"
export OPENAI_API_BASE="https://your-endpoint/v3"   # 可选，默认火山引擎 Ark 代理
export PAGEINDEX_MODEL="openai/glm-5.3-flash"       # 可选，默认 glm-5.3-flash

python make_sample_pdf.py
.venv/Scripts/python.exe demo.py
```

## 运行效果

1. **建索引**：`submit_document(wait=True)` 读取 PDF 书签目录，逐章生成节点摘要，
   每个节点包含 `title` / `node_id` / `start_index-end_index`（页码范围）/ `summary`。
2. **树结构打印**：demo 第 2 步会输出整棵索引树，例如：

   ```
   ● 第二章 财务摘要  [p3-4]  <0002>
     摘要: Chapter 2 reports revenue 1.26B yuan (+18.4% YoY), net profit 231M yuan...
   ```
3. **问答**：`chat(stream=True, show_process=True)` 输出完整检索轨迹
   （thinking → tool_call → tool_result → 答案），答案附带 `<cite .../>` 页码标签，
   `get_citations()` 可解析出结构化引用页码列表。

## 一个值得注意的行为

文档 ≤20 页时，SDK 内置的 agent 会**直接调 `get_page_content` 读全文**，
跳过树搜索（小文档直接读更省 token）。要观察真正的树检索轨迹，
请换一份 30 页以上的长文档。可以通过增大 `make_sample_pdf.py` 里
`FILLER` 的重复次数或章节数来快速生成长文档。

## 换成自己的模型

SDK 通过 LiteLLM 调模型，模型名格式 `provider/model`：
- OpenAI：`openai/gpt-4o-mini`（读 `OPENAI_API_KEY`）
- Anthropic：`anthropic/claude-haiku-4-5-20251001`（读 `ANTHROPIC_API_KEY`）
- 任意 OpenAI 兼容端点：`openai/<模型名>` + `OPENAI_API_BASE`
