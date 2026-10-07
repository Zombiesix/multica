import fs from "node:fs";
import path from "node:path";
import { storeForRepo } from "../lib/mentor/session";
import { deliverDocs } from "../lib/git/deliver";

/**
 * 把暂存区知识落到目标仓：
 *   yarn deliver <仓路径> [--force]
 *
 * 在目标仓新建分支 xiaoyou/docs-<date>，写入 docs/，commit（**不 push**）。
 * push 由用户自己做。同名的目标仓文件会被跳过、不覆盖。
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const target = args.find(a => !a.startsWith("-"));

  if (!target) {
    console.error("用法: yarn deliver <仓路径> [--force]");
    process.exit(1);
  }

  const repoPath = path.resolve(target);
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    console.error(`路径不存在或不是目录：${repoPath}`);
    process.exit(1);
  }

  const store = storeForRepo(repoPath);
  const entries = store.list();

  console.log(`\n仓库 ${path.basename(repoPath)}`);
  console.log(`  暂存区 ${store.docsRoot}`);
  console.log(
    `  知识条目 ${entries.length}（待确认 ${entries.filter(e => e.status === "proposed").length}）\n`,
  );

  console.log("正在落库（新建分支 + 写入 docs/ + commit，不 push）...\n");

  const report = await deliverDocs(repoPath, { force });

  if (report.empty) {
    console.log("没有可写入的新文件（暂存区为空，或文件都已在目标仓存在）。");
    console.log(`  跳过（已存在）: ${report.skipped.length} 个`);
    return;
  }

  console.log(`  ✓ 新建分支 ${report.branch}`);
  console.log(`  ✓ 复制 ${report.copied.length} 个文件:`);
  for (const f of report.copied) console.log(`      + ${f}`);
  if (report.skipped.length > 0) {
    console.log(`  - 跳过（目标仓已有同名字）: ${report.skipped.length} 个`);
    for (const f of report.skipped) console.log(`      = ${f}`);
  }
  if (report.commits.length > 0) {
    console.log(`  ✓ commit ${report.commits[0]}`);
  }
  console.log(`\n在目标仓查看：git -C ${repoPath} log`);
  console.log(`push 由你自己做（本工具绝不 push）。\n`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});