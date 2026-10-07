import { completeJson } from "@/lib/llm/client";
import {
  type Confidence,
  type KnowledgeEntry,
  slugify,
} from "@/lib/knowledge/schema";
import type { MentorQuestion } from "./questions";

interface StructuredAnswer {
  title: string;
  body: string;
  confidence: Confidence;
  followUp?: string;
}

const SYSTEM = `你在帮一个前端项目导师 Agent，把用户的口头回答整理成项目知识库条目。

硬规则：
- 只使用用户回答里出现的信息。不要补充你自己的推测、行业常识或"一般来说"。
- 用户的回答如果含糊、答非所问、或明显是"不知道/不清楚"，confidence 标 low，
  并在 followUp 里给一个更具体的追问。
- 不要复述问题本身，直接写结论。

输出 JSON：
{ "title": string, "body": string, "confidence": "high" | "medium" | "low", "followUp": string }
title 是 15 字以内的短标题；body 是 markdown，2-5 行，简洁。`;

export interface StructureResult {
  entry: KnowledgeEntry;
  /** 模型认为还需要追问的问题，空表示回答已足够 */
  followUp: string;
}

export async function structureAnswer(
  q: MentorQuestion,
  answer: string,
  ctx: { repoName: string },
): Promise<StructureResult> {
  const prompt = `项目：${ctx.repoName}

【提出的问题】
${q.prompt}

【为什么问】
${q.context}

【代码出处】
${q.evidence.map(e => "- " + e).join("\n")}

【用户的回答】
${answer}

请把它整理成知识库条目。`;

  const parsed = await completeJson<StructuredAnswer>(prompt, {
    system: SYSTEM,
    // 留足余量：推理型模型会先烧推理 token，卡太紧会返回空文本
    maxTokens: 2048,
  });

  const now = new Date().toISOString();
  const entry: KnowledgeEntry = {
    // 用问题 id 而不是 category+subject：一个模块可能和多个域命名不一致
    // （如 system-config ↔ catheter / record-import），只用 subject 会互相覆盖
    id: slugify(q.id),
    kind: q.targetKind,
    title: parsed.title?.trim() || q.prompt.slice(0, 20),
    status: "proposed",
    source: "agent",
    confidence: parsed.confidence ?? "medium",
    // 代码出处来自 M1 的静态分析，不是模型编的
    evidence: q.evidence,
    question: q.prompt,
    answer,
    body: (parsed.body ?? "").trim(),
    createdAt: now,
    updatedAt: now,
  };

  return { entry, followUp: (parsed.followUp ?? "").trim() };
}
