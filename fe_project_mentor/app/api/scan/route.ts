import { NextResponse } from "next/server";
import { looksLikeRepo, scanRepo } from "xiaoyou-code-indexer";
import { PathRejected, assertAllowedPath } from "@/lib/security/paths";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const rawPath = (body as { path?: unknown } | null)?.path;
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    return NextResponse.json({ error: "缺少 path 字段" }, { status: 400 });
  }

  let repoPath: string;
  try {
    repoPath = assertAllowedPath(rawPath);
  } catch (err) {
    const status = err instanceof PathRejected ? 403 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }

  if (!looksLikeRepo(repoPath)) {
    return NextResponse.json(
      { error: "该目录不是前端仓库（找不到 package.json）" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(scanRepo(repoPath));
  } catch (err) {
    return NextResponse.json({ error: `扫描失败：${(err as Error).message}` }, { status: 500 });
  }
}
