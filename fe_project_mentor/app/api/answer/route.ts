import { NextResponse } from "next/server";
import { scanRepo } from "code-indexer";
import { assertLlmReady, loadConfig } from "@/lib/config";
import { deriveQuestions } from "@/lib/mentor/questions";
import { storeForRepo } from "@/lib/mentor/session";
import { structureAnswer } from "@/lib/mentor/structure";
import { PathRejected, assertAllowedPath } from "@/lib/security/paths";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 收一个回答 → LLM 结构化 → 写进暂存区（proposed） */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { path: rawPath, questionId, answer } = (body ?? {}) as {
    path?: unknown;
    questionId?: unknown;
    answer?: unknown;
  };

  if (typeof rawPath !== "string" || !rawPath.trim()) {
    return NextResponse.json({ error: "缺少 path 字段" }, { status: 400 });
  }
  if (typeof questionId !== "string" || !questionId.trim()) {
    return NextResponse.json({ error: "缺少 questionId" }, { status: 400 });
  }
  if (typeof answer !== "string" || !answer.trim()) {
    return NextResponse.json({ error: "回答不能为空" }, { status: 400 });
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
    assertLlmReady(loadConfig());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }

  try {
    const map = scanRepo(repoPath);
    const question = deriveQuestions(map).find(q => q.id === questionId);
    if (!question) {
      return NextResponse.json({ error: `没有这个问题 id：${questionId}` }, { status: 404 });
    }

    const { entry, followUp } = await structureAnswer(question, answer.trim(), {
      repoName: map.repo.name,
    });

    const store = storeForRepo(repoPath);
    const saved = store.propose(entry);

    return NextResponse.json({ entry: saved, followUp, entries: store.list() });
  } catch (err) {
    return NextResponse.json(
      { error: `落成条目失败：${(err as Error).message}` },
      { status: 500 },
    );
  }
}
