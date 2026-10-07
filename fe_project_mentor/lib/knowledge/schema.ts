export type EntryKind = "glossary" | "module" | "flow" | "decision";
export type EntryStatus = "proposed" | "confirmed";
export type Confidence = "high" | "medium" | "low";

export interface KnowledgeEntry {
  id: string;
  kind: EntryKind;
  title: string;
  status: EntryStatus;
  source: "agent" | "user";
  confidence: Confidence;
  /** 代码出处，**必填**。没有出处的业务描述不许入库。 */
  evidence: string[];
  /** 原始问题与用户原话，保留现场 */
  question: string;
  answer: string;
  /** 结构化后的正文（markdown） */
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** kind → docs/ 下的子目录名 */
export const KIND_SUBDIR: Record<EntryKind, string> = {
  glossary: "glossary",
  module: "modules",
  flow: "flows",
  decision: "decisions",
};

export function slugify(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^\w一-龥-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "entry"
  );
}

export function entryFileName(entry: Pick<KnowledgeEntry, "id">): string {
  return `${entry.id}.md`;
}

const FRONTMATTER_KEYS = [
  "id",
  "kind",
  "title",
  "status",
  "source",
  "confidence",
  "createdAt",
  "updatedAt",
] as const;

/** JSON 字符串本身是合法 YAML 标量，用它来安全转义含冒号/换行的值 */
function scalar(v: string): string {
  return JSON.stringify(v);
}

export function serializeEntry(entry: KnowledgeEntry): string {
  const lines: string[] = ["---"];
  for (const key of FRONTMATTER_KEYS) {
    lines.push(`${key}: ${scalar(String(entry[key]))}`);
  }
  lines.push("evidence:");
  for (const e of entry.evidence) lines.push(`  - ${scalar(e)}`);
  lines.push("question: " + scalar(entry.question));
  lines.push("answer: " + scalar(entry.answer));
  lines.push("---", "", entry.body.trim(), "");
  return lines.join("\n");
}

/** 只解析我们自己写出来的受限格式：首行 --- 到下一个 --- 之间 */
export function parseEntry(raw: string, fallbackId: string): KnowledgeEntry | null {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;

  const end = lines.indexOf("---", 1);
  if (end < 0) return null;

  const head = lines.slice(1, end);
  const body = lines.slice(end + 1).join("\n").trim();

  const scalars: Record<string, string> = {};
  const evidence: string[] = [];
  let inEvidence = false;

  for (const line of head) {
    const itemMatch = line.match(/^\s+-\s+(.*)$/);
    if (inEvidence && itemMatch) {
      evidence.push(unquote(itemMatch[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!kv) continue;

    const [, key, value] = kv;
    if (key === "evidence") {
      inEvidence = true;
      continue;
    }
    inEvidence = false;
    scalars[key] = value === "" ? "" : unquote(value);
  }

  const kind = scalars.kind as EntryKind;
  const status = scalars.status as EntryStatus;
  if (!kind || !status) return null;

  return {
    id: scalars.id || fallbackId,
    kind,
    title: scalars.title ?? "",
    status,
    source: (scalars.source as "agent" | "user") ?? "agent",
    confidence: (scalars.confidence as Confidence) ?? "medium",
    evidence,
    question: scalars.question ?? "",
    answer: scalars.answer ?? "",
    body,
    createdAt: scalars.createdAt ?? "",
    updatedAt: scalars.updatedAt ?? "",
  };
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string;
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

/** 写入前校验。这里是防腐层，不通过就不许落盘。 */
export function validateEntry(entry: KnowledgeEntry): string[] {
  const problems: string[] = [];
  if (!entry.id) problems.push("缺 id");
  if (!entry.title.trim()) problems.push("缺 title");
  if (entry.evidence.length === 0) problems.push("evidence 必填（没有代码出处的业务描述不许入库）");
  if (!entry.question.trim()) problems.push("缺 question（要保留原始提问）");
  if (!entry.answer.trim()) problems.push("缺 answer（要保留用户原话）");
  if (entry.source === "agent" && entry.status === "confirmed") {
    problems.push("Agent 不能直接写 confirmed");
  }
  return problems;
}
