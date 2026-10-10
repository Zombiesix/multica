import { NextResponse } from "next/server";
import { scanRepo } from "code-indexer";
import { deriveQuestions } from "@/lib/mentor/questions";
import { PathRejected, assertAllowedPath } from "@/lib/security/paths";

export const runtime = "nodejs";

/** 从扫描结果派生提问队列；已经答过的（暂存区里已有条目）标记 answered */
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
    return NextResponse.json(
      { error: (err as Error).message },
      { status: err instanceof PathRejected ? 403 : 500 },
    );
  }

  try {
    const map = scanRepo(repoPath);
    const questions = deriveQuestions(map);
    return NextResponse.json({
      repo: map.repo.name,
      questions,
      counts: questions.reduce<Record<string, number>>((acc, q) => {
        acc[q.category] = (acc[q.category] ?? 0) + 1;
        return acc;
      }, {}),
    });
  } catch (err) {
    return NextResponse.json({ error: `派生问题失败：${(err as Error).message}` }, { status: 500 });
  }
}
