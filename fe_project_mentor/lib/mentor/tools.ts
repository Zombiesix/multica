import { z } from "zod";
import { getScan } from "xiaoyou-code-indexer";
import { projectOverview, traceFlow } from "xiaoyou-code-indexer/query";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { slugify, validateEntry, type Confidence, type EntryKind, type KnowledgeEntry } from "@/lib/knowledge/schema";
import { storeForRepo } from "@/lib/mentor/session";

/**
 * 小游暴露给 mentor Agent 的工具。
 *
 * 设计约束（plan 4.3 / 1.1）：
 * - Agent 不直接啃源码，只消费 xiaoyou-code-indexer 的索引结果——成本与一致性可控。
 * - propose_knowledge 走 store.propose 的同一套防腐校验（evidence 必填、不能写 confirmed）。
 */

// ---------- createMentorServer ----------

export function createMentorServer(repoPath: string) {
  return createSdkMcpServer({
    name: "xiaoyou",
    version: "0.1.0",
    tools: mentorToolDefinitions(repoPath),
  });
}

/** 工具定义单独导出，供验收脚本断言接线（plan 4.3 的工具清单） */
export function mentorToolDefinitions(repoPath: string) {
  const store = storeForRepo(repoPath);

  const getProjectMap = tool(
    "get_project_map",
    "项目全貌：路由表（含中文业务名）、业务模块、API 域、静态分析告警。" +
      "讲解任何模块前先调它定位目标。",
    {},
    async () => ({ content: [{ type: "text", text: projectOverview(getScan(repoPath)) }] }),
  );

  const traceFlowTool = tool(
    "trace_flow",
    "追一条业务链路：给路由 path（如 /bed-overview）或模块名（如 conduit-manage），" +
      "返回 路由 → 页面组件 → 组件树（含引用方式）→ 调用的 API 域 → 具体后端端点（方法+URL+出处）。" +
      "讲解数据流的主工具。",
    { target: z.string().describe("路由 path 或模块名") },
    async args => ({ content: [{ type: "text", text: traceFlow(getScan(repoPath), args.target) }] }),
  );

  const searchKnowledge = tool(
    "search_knowledge",
    "查已沉淀的业务知识（术语 / 模块职责 / 业务链路 / 决策），按关键词过滤，不传关键词返回全部。",
    { keyword: z.string().optional() },
    async args => {
      const kw = (args.keyword ?? "").trim().toLowerCase();
      const entries = store.list().filter(e =>
        !kw ||
        e.title.toLowerCase().includes(kw) ||
        e.body.toLowerCase().includes(kw) ||
        e.question.toLowerCase().includes(kw),
      );
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            entries.slice(0, 20).map(e => ({
              kind: e.kind,
              id: e.id,
              title: e.title,
              status: e.status,
              confidence: e.confidence,
              body: e.body.length > 400 ? e.body.slice(0, 400) + "…" : e.body,
            })),
            null,
            1,
          ),
        }],
      };
    },
  );

  const proposeKnowledge = tool(
    "propose_knowledge",
    "把用户讲出的业务知识落成「待确认」条目。evidence 必填（代码出处，先用 trace_flow 拿）。" +
      "校验不过会被拒绝并返回原因。用户确认前它只是 proposed。",
    {
      kind: z.enum(["glossary", "module", "flow", "decision"]),
      title: z.string(),
      body: z.string().describe("结构化后的正文 markdown"),
      evidence: z.array(z.string()).min(1),
      question: z.string().describe("原始提问/语境"),
      answer: z.string().describe("用户原话"),
      confidence: z.enum(["high", "medium", "low"]),
    },
    async args => {
      const entry: KnowledgeEntry = {
        id: slugify(args.title),
        kind: args.kind as EntryKind,
        title: args.title,
        status: "proposed",
        source: "agent",
        confidence: args.confidence as Confidence,
        evidence: args.evidence,
        question: args.question,
        answer: args.answer,
        body: args.body,
        createdAt: "",
        updatedAt: "",
      };
      const problems = validateEntry(entry);
      if (problems.length > 0) {
        return {
          isError: true,
          content: [{ type: "text", text: `条目不合规，拒绝写入：${problems.join("；")}` }],
        };
      }
      try {
        const saved = store.propose(entry);
        return {
          content: [{
            type: "text",
            text: `已落成待确认条目 ${saved.kind}/${saved.id}。提醒用户确认后才生效。`,
          }],
        };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
      }
    },
  );

  return [getProjectMap, traceFlowTool, searchKnowledge, proposeKnowledge];
}
