import path from "node:path";
import { loadConfig } from "@/lib/config";
import { KnowledgeStore } from "@/lib/knowledge/store";

/**
 * 目标仓 → 它的知识暂存库。
 * 用仓名做子目录，避免多仓的知识串味。
 */
export function storeForRepo(repoRoot: string): KnowledgeStore {
  const cfg = loadConfig();
  return new KnowledgeStore({
    stagingDir: cfg.stagingDir,
    repoName: path.basename(repoRoot),
  });
}
