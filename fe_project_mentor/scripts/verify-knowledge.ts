import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { KnowledgeEntry } from "../lib/knowledge/schema";
import { KnowledgeStore } from "../lib/knowledge/store";

/**
 * 知识层写入协议验收。
 * 这里测的是「防腐层」本身——它必须真的能拦住脏数据，
 * 否则知识库会整体腐烂，比没有更糟。
 */
const failures: string[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

function throws(label: string, fn: () => unknown): void {
  try {
    fn();
    check(label, false, "本应抛错但没有");
  } catch {
    check(label, true);
  }
}

function sample(over: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  const now = new Date().toISOString();
  return {
    id: "naming-conduit-manage",
    kind: "glossary",
    title: "conduit 与 catheter 的关系",
    status: "proposed",
    source: "agent",
    confidence: "high",
    evidence: ["src/page/conduit-manage/index.vue:1"],
    question: "这两者是同一个业务概念吗？",
    answer: "是同一个，catheter 是后端表名。",
    body: "两者指同一概念，新代码统一用 `catheter`。",
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xiaoyou-verify-"));
const store = new KnowledgeStore({ stagingDir: tmp, repoName: "demo-repo" });

console.log("\n知识层写入协议验收\n");

// 1. 正常写入
const saved = store.propose(sample());
check("写入后为 proposed", saved.status === "proposed");
check("source 归为 agent", saved.source === "agent");

const file = path.join(store.dirFor("glossary"), "naming-conduit-manage.md");
check("文件已落盘", fs.existsSync(file));

// 2. 回读保真（含换行、中文、多行 evidence）
const withNewlines = sample({
  id: "round-trip",
  answer: "第一行\n\n第二行：含冒号 and \"quotes\"",
  evidence: ["a/b.vue:1", "c/d.vue:22"],
  body: "# 标题\n\n- 要点一\n- 要点二",
});
store.propose(withNewlines);
const back = store.read("glossary", "round-trip");
check(
  "回读保真（answer 含换行/引号）",
  back?.answer === withNewlines.answer,
  back?.answer === withNewlines.answer ? "" : JSON.stringify(back?.answer),
);
check(
  "回读保真（多行 evidence）",
  JSON.stringify(back?.evidence) === JSON.stringify(withNewlines.evidence),
);
check("回读保真（body）", back?.body === withNewlines.body.trim());

// 3. 防腐层
throws("缺 evidence 拒绝写入", () => store.propose(sample({ id: "no-ev", evidence: [] })));
throws("缺 answer 拒绝写入", () => store.propose(sample({ id: "no-ans", answer: "" })));
throws("Agent 不能直接写 confirmed", () =>
  store.propose(sample({ id: "sneaky", status: "confirmed" })),
);

// 4. 人工确认是唯一入口
const confirmed = store.confirm("glossary", "naming-conduit-manage");
check("confirm 后为 confirmed", confirmed.status === "confirmed");
check("confirm 后 source 归为 user", confirmed.source === "user");
throws("confirmed 条目不许被 Agent 覆盖", () => store.propose(sample()));

// 5. 索引
const index = fs.readFileSync(path.join(store.docsRoot, "CONTEXT.md"), "utf8");
check("CONTEXT.md 已生成并列出条目", index.includes("naming-conduit-manage"));
check("索引里标出待确认", index.includes("待确认"));

fs.rmSync(tmp, { recursive: true, force: true });

console.log();
if (failures.length > 0) {
  console.error(`验收失败 ${failures.length} 项：`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("验收通过\n");
