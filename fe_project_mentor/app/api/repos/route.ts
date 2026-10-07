import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { listAllowedRoots } from "@/lib/security/paths";

export const runtime = "nodejs";

/** 列出白名单根目录下看起来像前端仓库的子目录，省得用户手打路径 */
export async function GET() {
  const roots = listAllowedRoots();
  const repos: { name: string; path: string; root: string }[] = [];

  for (const root of roots) {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const full = path.join(root, entry.name);
      if (fs.existsSync(path.join(full, "package.json"))) {
        repos.push({ name: entry.name, path: full.split(path.sep).join("/"), root });
      }
    }
  }

  repos.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ roots, repos });
}
