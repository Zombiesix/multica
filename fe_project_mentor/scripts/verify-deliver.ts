import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { KnowledgeEntry } from "../lib/knowledge/schema";
import { KnowledgeStore } from "../lib/knowledge/store";
import { deliverDocs, DeliverError } from "../lib/git/deliver";

/**
 * 落库交付验收。在临时目录里建一个假 git 仓 + 假暂存区，跑真 deliver，
 * 验证：分支创建、docs/ 写入、commit 但不 push、同名跳过、脏工作区拦截。
 */
const failures: string[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

function sh(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function sampleEntry(over: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  const now = new Date().toISOString();
  return {
    id: "duplicate-endpoint-demo",
    kind: "decision",
    title: "重复封装处理约定",
    status: "proposed",
    source: "agent",
    confidence: "high",
    evidence: ["POST /icis/a/b ← a/fn, b/fn"],
    question: "这两个域什么关系？",
    answer: "用 b。",
    body: "新代码用 b。",
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

async function main(): Promise<void> {
  console.log("\n落库交付验收\n");

  // 1. 建假目标仓（初始一个提交）
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xiaoyou-deliver-"));
  sh(tmp, "init");
  sh(tmp, "config", "user.email", "test@test.dev");
  sh(tmp, "config", "user.name", "Test");
  fs.writeFileSync(path.join(tmp, "README.md"), "# demo\n");
  sh(tmp, "add", ".");
  sh(tmp, "commit", "-m", "init");

  // 2. 建假暂存区（两条知识）。repoName 用目标仓目录名，align deliver 的投影。
  const stagingDir = path.join(os.tmpdir(), "xiaoyou-staging-fake");
  const store = new KnowledgeStore({ stagingDir, repoName: path.basename(tmp) });
  store.propose(sampleEntry());
  store.propose(sampleEntry({ id: "glossary-demo", kind: "glossary" }));

  // 3. deliver：应新建分支、写入 docs/、commit，不 push（无 remote，天然验证）
  const r1 = await deliverDocs(tmp, { stagingDir });
  // CONTEXT.md + 2 条知识 = 3 个文件
  check("复制 3 个文件（CONTEXT + 2 条）", r1.copied.length === 3, `got ${r1.copied.length}`);
  check("跳过 0 个", r1.skipped.length === 0);
  check("分支名以 xiaoyou/docs- 开头", r1.branch.startsWith("xiaoyou/docs-"), r1.branch);
  check("有提交", r1.commits.length === 1, `got ${r1.commits.length}`);
  check("docs/CONTEXT.md 存在", fs.existsSync(path.join(tmp, "docs", "CONTEXT.md")));

  const branch = r1.branch;
  check("当前在新建分支", sh(tmp, "rev-parse", "--abbrev-ref", "HEAD") === branch);

  // 4. 再 deliver 一次：全部同名 → 跳过，空提交
  const r2 = await deliverDocs(tmp, { stagingDir });
  check("第二次全跳过（3 个都已在目标仓）", r2.skipped.length === 3, `skipped=${r2.skipped.length}, copied=${r2.copied.length}`);
  check("第二次无新提交", r2.commits.length === 0);
  check("第二次 empty 标记", r2.empty === true);

  // 5. 脏工作区拦截：改一个已跟踪文件后再 deliver → 抛错
  fs.writeFileSync(path.join(tmp, "README.md"), "# demo\nchanged\n");
  let blocked = false;
  try {
    await deliverDocs(tmp, { stagingDir });
  } catch (err) {
    blocked = err instanceof DeliverError;
  }
  check("脏工作区被拦截（DeliverError）", blocked);
  check("脏工作区未建分支", sh(tmp, "rev-parse", "--abbrev-ref", "HEAD") === branch);

  // 6. 已存在同名文件不覆盖
  const third = fs.mkdtempSync(path.join(os.tmpdir(), "xiaoyou-deliver3-"));
  sh(third, "init");
  sh(third, "config", "user.email", "test@test.dev");
  sh(third, "config", "user.name", "Test");
  fs.mkdirSync(path.join(third, "docs"), { recursive: true });
  fs.writeFileSync(path.join(third, "docs", "CONTEXT.md"), "# 有人手写的\n");
  sh(third, "add", ".");
  sh(third, "commit", "-m", "init");
  const stagingDir3 = path.join(os.tmpdir(), "xiaoyou-staging3");
  const store3 = new KnowledgeStore({ stagingDir: stagingDir3, repoName: path.basename(third) });
  store3.propose(sampleEntry());
  const r3 = await deliverDocs(third, { stagingDir: stagingDir3 });
  check(
    "同名 docs/CONTEXT.md 被跳过",
    r3.skipped.includes("CONTEXT.md") || r3.skipped.includes(path.normalize("CONTEXT.md")),
  );
  check(
    "手写 CONTEXT.md 未被覆盖",
    fs.readFileSync(path.join(third, "docs", "CONTEXT.md"), "utf8").includes("有人手写的"),
  );

  // 清理
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(third, { recursive: true, force: true });
  fs.rmSync(path.join(os.tmpdir(), "xiaoyou-staging-fake"), { recursive: true, force: true });
  fs.rmSync(path.join(os.tmpdir(), "xiaoyou-staging3"), { recursive: true, force: true });

  console.log();
  if (failures.length > 0) {
    console.error(`验收失败 ${failures.length} 项：`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("验收通过\n");
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});