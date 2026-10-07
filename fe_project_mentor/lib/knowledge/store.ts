import fs from "node:fs";
import path from "node:path";
import {
  type EntryKind,
  type KnowledgeEntry,
  KIND_SUBDIR,
  entryFileName,
  parseEntry,
  serializeEntry,
  validateEntry,
} from "./schema";

export interface StoreOptions {
  /** 暂存根目录，如 <mentor>/.xiaoyou */
  stagingDir: string;
  /** 目标仓名，作为暂存子目录，避免多仓串味 */
  repoName: string;
}

/**
 * 知识暂存库。
 *
 * 刻意不直接写目标仓：产物先在暂存区累积成 proposed，
 * 用户确认后才由单独的步骤落到目标仓分支上。
 * 这样「Agent 提议 / 用户确认」在文件层面就是分开的两步，不靠自觉。
 */
export class KnowledgeStore {
  readonly docsRoot: string;
  readonly stagingRoot: string;

  constructor(opts: StoreOptions) {
    this.stagingRoot = path.join(opts.stagingDir, opts.repoName);
    this.docsRoot = path.join(this.stagingRoot, "docs");
  }

  dirFor(kind: EntryKind): string {
    return path.join(this.docsRoot, KIND_SUBDIR[kind]);
  }

  list(): KnowledgeEntry[] {
    const out: KnowledgeEntry[] = [];
    for (const kind of Object.keys(KIND_SUBDIR) as EntryKind[]) {
      const dir = this.dirFor(kind);
      let files: string[] = [];
      try {
        files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));
      } catch {
        continue;
      }
      for (const f of files) {
        const raw = fs.readFileSync(path.join(dir, f), "utf8");
        const entry = parseEntry(raw, f.replace(/\.md$/, ""));
        if (entry) out.push(entry);
      }
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  read(kind: EntryKind, id: string): KnowledgeEntry | null {
    const file = path.join(this.dirFor(kind), entryFileName({ id }));
    try {
      return parseEntry(fs.readFileSync(file, "utf8"), id);
    } catch {
      return null;
    }
  }

  /**
   * 写入一条提议。
   * - 校验不过直接抛，不落盘
   * - 已 confirmed 的条目不许被 Agent 覆盖（人确认过的结论不能被机器悄悄改掉）
   */
  propose(entry: KnowledgeEntry): KnowledgeEntry {
    const problems = validateEntry(entry);
    if (problems.length > 0) {
      throw new Error(`知识条目不合规，拒绝写入：${problems.join("；")}`);
    }

    const existing = this.read(entry.kind, entry.id);
    if (existing?.status === "confirmed") {
      throw new Error(
        `条目 "${entry.id}" 已是 confirmed，Agent 不能覆盖人工确认过的结论。` +
          `如需修改请新开一条或用人工流程。`,
      );
    }

    const now = new Date().toISOString();
    const final: KnowledgeEntry = {
      ...entry,
      status: "proposed",
      source: "agent",
      createdAt: existing?.createdAt || entry.createdAt || now,
      updatedAt: now,
    };

    const dir = this.dirFor(final.kind);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, entryFileName(final)), serializeEntry(final), "utf8");
    this.writeIndex();
    return final;
  }

  /** 人工确认：唯一能把 proposed 变成 confirmed 的入口 */
  confirm(kind: EntryKind, id: string): KnowledgeEntry {
    const entry = this.read(kind, id);
    if (!entry) throw new Error(`没有条目 ${kind}/${id}`);
    const final: KnowledgeEntry = {
      ...entry,
      status: "confirmed",
      source: "user",
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(this.dirFor(kind), entryFileName(final)),
      serializeEntry(final),
      "utf8",
    );
    this.writeIndex();
    return final;
  }

  /** docs/CONTEXT.md —— 唯一入口，自动生成，不手写 */
  writeIndex(): string {
    const entries = this.list();
    const byKind = new Map<EntryKind, KnowledgeEntry[]>();
    for (const e of entries) {
      byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);
    }

    const lines: string[] = [
      "# 项目业务知识（小游生成）",
      "",
      "> 本文件自动生成，请勿手写。每条知识一个文件，`status: proposed` 表示待人工确认。",
      "",
      `共 ${entries.length} 条，其中待确认 ${entries.filter(e => e.status === "proposed").length} 条。`,
      "",
    ];

    for (const [kind, list] of byKind) {
      lines.push(`## ${kind}`, "");
      for (const e of list) {
        const mark = e.status === "proposed" ? " `待确认`" : "";
        lines.push(`- [${e.title}](${KIND_SUBDIR[kind]}/${e.id}.md)${mark}`);
      }
      lines.push("");
    }

    fs.mkdirSync(this.docsRoot, { recursive: true });
    const file = path.join(this.docsRoot, "CONTEXT.md");
    fs.writeFileSync(file, lines.join("\n"), "utf8");
    return file;
  }
}
