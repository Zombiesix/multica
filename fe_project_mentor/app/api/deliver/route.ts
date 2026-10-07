import { NextResponse } from "next/server";
import { DeliverError, deliverDocs } from "@/lib/git/deliver";
import { PathRejected, assertAllowedPath } from "@/lib/security/paths";

export const runtime = "nodejs";

/**
 * POST { path }             → 检查状态后落库（有改动就不动）
 * POST { path, force: true } → 跳过工作区脏检查
 *
 * 落库会：新建分支 xiaoyou/docs-<date> → 写入 docs/ → commit。**绝不 push。**
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { path: rawPath, force } = (body ?? {}) as { path?: unknown; force?: unknown };

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

  try {
    const report = await deliverDocs(repoPath, { force: force === true });
    return NextResponse.json(report, { status: report.empty ? 200 : 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: err instanceof DeliverError || err instanceof PathRejected ? 400 : 500 },
    );
  }
}