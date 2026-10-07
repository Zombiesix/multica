import { NextResponse } from "next/server";
import type { EntryKind } from "@/lib/knowledge/schema";
import { storeForRepo } from "@/lib/mentor/session";
import { PathRejected, assertAllowedPath } from "@/lib/security/paths";

export const runtime = "nodejs";

/**
 * POST { path }                        → 列出暂存区条目
 * POST { path, confirm: { kind, id } } → 人工确认一条，然后返回最新列表
 *
 * 确认只走这个接口，Agent 自己没法把 proposed 变 confirmed。
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { path: rawPath, confirm } = (body ?? {}) as {
    path?: unknown;
    confirm?: { kind?: unknown; id?: unknown };
  };

  if (typeof rawPath !== "string" || !rawPath.trim()) {
    return NextResponse.json({ error: "缺少 path 字段" }, { status: 400 });
  }

  let repoPath: string;
  try {
    repoPath = assertAllowedPath(rawPath);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: err instanceof PathRejected ? 403 : 500 },
    );
  }

  const store = storeForRepo(repoPath);

  try {
    if (confirm) {
      const kind = confirm.kind as EntryKind;
      const id = String(confirm.id ?? "");
      if (!kind || !id) {
        return NextResponse.json({ error: "confirm 需要 kind 和 id" }, { status: 400 });
      }
      store.confirm(kind, id);
    }
    const entries = store.list();
    return NextResponse.json({
      docsRoot: store.docsRoot,
      entries,
      pending: entries.filter(e => e.status === "proposed").length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
