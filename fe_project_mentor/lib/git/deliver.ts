import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { KnowledgeStore } from "@/lib/knowledge/store";
import { storeForRepo } from "@/lib/mentor/session";

const execFileAsync = promisify(execFile);

/**
 * 把暂存区里的知识产物落到目标仓：新建分支 xiaoyou/docs-<date>，写入 docs/，commit。
 *
 * 硬约束（对齐 plan 第 5 节 / 4.4 review-gate）：
 * - **绝不 push**。push 由用户自己做，git review 语义不破坏。
 * - 覆盖策略保守：目标仓已有同名文件就跳过，不覆盖人工内容；
 *   冲突文件名带回来了（和 u 拉出来的同名）以目标仓为准，避免白删。
 * - 要求目标仓工作区没有已跟踪的改动，避免把用户未提交的东西卷进分支。
 *
 * docs 内容来源是暂存区（.xiaoyou/<仓>/docs/），不直接读目标仓。
 */
export interface DeliverReport {
  repoName: string;
  branch: string;
  /** 复制的条目数（新建/覆盖）；跳过的不算 */
  copied: string[];
  /** 目标仓已存在、被跳过的文件 */
  skipped: string[];
  /** commits，成功返回 [sha]，无变更返回空 */
  commits: string[];
  /** 变更文件相对路径 */
  changed: string[];
  empty: boolean;
}

export class DeliverError extends Error {}

function git(repoPath: string, args: string[]): Promise<string> {
  return execFileAsync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
    env: { ...process.env, GIT_PAGER: "cat" },
  }).then(
    res => res.stdout,
    err => {
      const stderr: string = err.stderr ?? "";
      throw new DeliverError(`git ${args.join(" ")} 失败: ${stderr.trim()}`);
    },
  );
}

function isGitRepo(repoPath: string): Promise<boolean> {
  return execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoPath })
    .then(() => true, () => false);
}

function dateStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 保守复制：把 stagingDocs 下内容按相对路径复制到 targetDocs/，同名跳过。 */
function copyDocs(stagingDocs: string, targetDocs: string): { copied: string[]; skipped: string[] } {
  const copied: string[] = [];
  const skipped: string[] = [];

  const walk = (dir: string, relDir: string): void => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const from = path.join(dir, e.name);
      const rel = path.join(relDir, e.name);
      const to = path.join(targetDocs, rel);
      if (e.isDirectory()) {
        walk(from, rel);
      } else if (e.isFile()) {
        if (fs.existsSync(to)) {
          skipped.push(rel);
        } else {
          fs.mkdirSync(path.dirname(to), { recursive: true });
          fs.copyFileSync(from, to);
          copied.push(rel);
        }
      }
    }
  };

  walk(stagingDocs, ".");
  return { copied, skipped };
}

/**
 * 创建分支并 commit 目标仓 docs/ 的改动。
 * 无可用内容（暂存区为空且目标仓无 docs）时返回 empty 报告，不动 git。
 */
export async function deliverDocs(
  repoPath: string,
  opts: { force?: boolean; stagingDir?: string } = {},
): Promise<DeliverReport> {
  if (!(await isGitRepo(repoPath))) {
    throw new DeliverError(`目标路径不是 git 仓库：${repoPath}`);
  }

  const store = opts.stagingDir
    ? new KnowledgeStore({ stagingDir: opts.stagingDir, repoName: path.basename(repoPath) })
    : storeForRepo(repoPath);
  const stagingDocs = store.docsRoot;
  if (!fs.existsSync(stagingDocs)) {
    throw new DeliverError(`暂存区还没有知识产物：${stagingDocs}`);
  }

  const branch = `xiaoyou/docs-${dateStamp()}`;

  // 目标仓 worktree 若有已跟踪改动，先停下来，避免把用户未提交的活卷进来。
  const status = (await git(repoPath, ["status", "--porcelain"])).trim();
  if (!opts.force) {
    const trackedChanges = status
      .split("\n")
      .filter(line => line && !line.startsWith("??"))
      .filter(Boolean);
    if (trackedChanges.length > 0) {
      throw new DeliverError(
        `目标仓有未提交的已跟踪改动，先提交或丢弃后再来（或 --force 忽略检查）：\n` +
          trackedChanges.slice(0, 10).join("\n"),
      );
    }
  }

  // 目标仓 docs/ 已有同名文件就跳过。
  const targetDocs = path.join(repoPath, "docs");
  const { copied, skipped } = copyDocs(stagingDocs, targetDocs);

  const changed: string[] = [];
  const commits: string[] = [];

  if (copied.length > 0) {
    await git(repoPath, ["checkout", "-b", branch]);
    await git(repoPath, ["add", "docs"]);
    const added = (await git(repoPath, ["status", "--porcelain"]))
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.startsWith("A") || l.startsWith("M"));
    for (const l of added) changed.push(l.replace(/^[AM]\s+/, ""));

    if (added.length > 0) {
      const msg = `docs(小游): 沉淀项目业务知识（${dateStamp()}）`;
      const out = await git(repoPath, ["commit", "-m", msg]);
      const shaMatch = out.match(/\[[^\]]+ ([0-9a-f]+)\]/);
      commits.push(shaMatch?.[1] ?? "?(见上方输出)");
    }
  }

  return {
    repoName: path.basename(repoPath),
    branch,
    copied,
    skipped,
    commits,
    changed,
    empty: copied.length === 0,
  };
}