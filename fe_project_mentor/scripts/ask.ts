import fs from "node:fs";
import path from "node:path";
import { scanRepo } from "code-indexer";
import { loadConfig, assertLlmReady } from "../lib/config";
import { KnowledgeStore } from "../lib/knowledge/store";
import { deriveQuestions } from "../lib/mentor/questions";
import { structureAnswer } from "../lib/mentor/structure";

/**
 * 追问闭环 CLI：
 *   yarn ask <仓路径>                              只列问题队列
 *   yarn ask <仓路径> <问题id> <回答...>            直接给回答
 *   yarn ask <仓路径> <问题id> --file <回答文件>     从文件读回答（长回答/中文走这条）
 */
function readAnswer(args: string[]): string {
  if (args[0] === "--file") {
    const file = args[1];
    if (!file) throw new Error("--file 后面要跟文件路径");
    return fs.readFileSync(file, "utf8").trim();
  }
  return args.join(" ").trim();
}

async function main(): Promise<void> {
  const [target, questionId, ...rest] = process.argv.slice(2);
  if (!target) {
    console.error("用法: yarn ask <仓路径> [问题id] [回答 | --file <文件>]");
    process.exit(1);
  }

  const repoRoot = path.resolve(target);
  const map = scanRepo(repoRoot);
  const questions = deriveQuestions(map);

  console.log(`\n${map.repo.name} · 提问队列 (${questions.length})\n`);

  const byCategory = new Map<string, number>();
  for (const q of questions) {
    byCategory.set(q.category, (byCategory.get(q.category) ?? 0) + 1);
  }
  console.log(
    "  分类：" + [...byCategory.entries()].map(([k, v]) => `${k}=${v}`).join("  "),
  );
  console.log();

  if (!questionId) {
    for (const q of questions) {
      console.log(`  [${q.category}] ${q.id}`);
      console.log(`      ${q.prompt}`);
      if (q.evidence.length > 0) console.log(`      出处: ${q.evidence[0]}`);
      console.log();
    }
    console.log("带「问题id 回答」再跑一次，即可落成知识条目。\n");
    return;
  }

  const q = questions.find(x => x.id === questionId);
  if (!q) {
    console.error(`没有这个问题 id：${questionId}`);
    console.error(`现有：${questions.map(x => x.id).join(", ")}`);
    process.exit(1);
  }

  const answer = readAnswer(rest);
  if (!answer) {
    console.error("缺少回答内容。");
    process.exit(1);
  }

  const cfg = loadConfig();
  assertLlmReady(cfg);

  console.log(`问题：${q.prompt}`);
  console.log(`回答：${answer}`);
  console.log(`\n正在结构化为知识条目（模型 ${cfg.llm.model}）...\n`);

  const { entry, followUp } = await structureAnswer(q, answer, { repoName: map.repo.name });

  const store = new KnowledgeStore({
    stagingDir: cfg.stagingDir,
    repoName: map.repo.name,
  });

  const saved = store.propose(entry);

  console.log(`已写入（${saved.status}）：${store.docsRoot}\\${saved.kind}\\${saved.id}.md`);
  console.log(`  title      ${saved.title}`);
  console.log(`  confidence ${saved.confidence}`);
  console.log(`  body       ${saved.body.split("\n")[0]}`);
  if (followUp) console.log(`\n建议追问：${followUp}`);

  const all = store.list();
  console.log(
    `\n暂存区共 ${all.length} 条（待确认 ${all.filter(e => e.status === "proposed").length} 条）` +
      `，索引：${store.docsRoot}\\CONTEXT.md\n`,
  );
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
