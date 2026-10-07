import { PathRejected, assertAllowedPath } from "@/lib/security/paths";
import { streamMentorAgent } from "@/lib/mentor/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 讲解会话（SSE）。事件格式：
 *   data: {"kind":"session","sessionId":"..."}     首轮返回，客户端续传要带回来
 *   data: {"kind":"text","text":"..."}
 *   data: {"kind":"tool","name":"mcp__xiaoyou__trace_flow"}
 *   data: {"kind":"done",...} / {"kind":"error","message":"..."}
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { path: rawPath, prompt, sessionId, strong } = (body ?? {}) as {
    path?: unknown;
    prompt?: unknown;
    sessionId?: unknown;
    strong?: unknown;
  };

  if (typeof rawPath !== "string" || !rawPath.trim()) {
    return Response.json({ error: "缺少 path 字段" }, { status: 400 });
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    return Response.json({ error: "缺少 prompt" }, { status: 400 });
  }

  let repoPath: string;
  try {
    repoPath = assertAllowedPath(rawPath);
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: err instanceof PathRejected ? 403 : 500 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      try {
        for await (const ev of streamMentorAgent({
          repoPath,
          prompt: prompt.trim(),
          sessionId: typeof sessionId === "string" && sessionId ? sessionId : null,
          strong: !!strong,
        })) {
          send(ev);
          if (ev.kind === "done" || ev.kind === "error") break;
        }
      } catch (err) {
        send({ kind: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
