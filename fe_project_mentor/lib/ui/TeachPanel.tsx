"use client";

import { useRef, useState } from "react";

interface ChatMsg {
  role: "user" | "agent";
  text: string;
}

interface TeachPanelProps {
  repoPath: string;
  /** 项目地图里挑好的入口，方便一键开讲 */
  quickTargets: { path: string; label: string | null }[];
  /** 一轮对话结束（含出错/中断）后回调；父级据此刷新知识暂存等联动数据 */
  onTurnEnd?: () => void;
}

/**
 * 讲解 + 探讨面板。流式 SSE，sessionId 存在组件状态里，
 * 多轮对话（讲解 → 用户说理解 → 一起对照代码聊）靠它续接同一会话。
 */
export default function TeachPanel({
  repoPath,
  quickTargets,
  onTurnEnd,
}: TeachPanelProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;

    setMessages((prev) => [...prev, { role: "user", text: prompt }]);
    setDraft("");
    setBusy(true);
    setError(null);

    // agent 回复占一个位，流式往里追加
    const agentIndex = messages.length + 1;
    setMessages((prev) => [...prev, { role: "agent", text: "" }]);

    try {
      const res = await fetch("/api/teach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: repoPath, prompt, sessionId }),
        signal: (abortRef.current = new AbortController()).signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `请求失败 (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      const apply = (fn: (prev: ChatMsg[]) => ChatMsg[]) => setMessages(fn);
      const appendText = (t: string) =>
        apply((prev) =>
          prev.map((m, i) =>
            i === agentIndex ? { ...m, text: m.text + t } : m,
          ),
        );

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let ev: {
            kind?: string;
            text?: string;
            sessionId?: string;
            name?: string;
            message?: string;
          };
          try {
            ev = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (ev.kind === "session" && ev.sessionId) setSessionId(ev.sessionId);
          if (ev.kind === "text" && ev.text) appendText(ev.text);
          if (ev.kind === "tool" && ev.name) {
            setToolsUsed((prev) => [...prev, ev.name!]);
            appendText(`\n\n> [调用工具 ${shortTool(ev.name!)}]\n\n`);
          }
          if (ev.kind === "error") {
            setError(ev.message ?? "讲解中断");
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError")
        setError((err as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
      onTurnEnd?.();
    }
  }

  /** 清空本地会话：不续传 sessionId 即开新会话，服务器侧旧会话文件留着无妨 */
  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setDraft("");
    setSessionId(null);
    setToolsUsed([]);
    setError(null);
  }

  return (
    <section className="card">
      <h2>
        一起探讨
        {sessionId && <span className="tag">会话中</span>}
      </h2>
      <p className="dim">
        选一条链路开聊。小游把代码事实摆出来，你来说你的理解——聊出的业务知识
        随时落成待确认条目，与下面的知识暂存联动。
      </p>

      {quickTargets.length > 0 && (
        <div className="chips">
          <span className="chips-label">从链路开讲</span>
          {quickTargets.slice(0, 6).map((t) => (
            <button
              key={t.path}
              className="chip"
              type="button"
              disabled={busy}
              onClick={() =>
                void send(
                  `用 trace_flow 追一下 ${t.path}（${t.label ?? "无业务名"}）这条链路，按分层讲解协议带我过 L1+L2，然后咱们探讨：这条链路哪里最容易让人搞错？`,
                )
              }
            >
              {t.label ?? t.path}
            </button>
          ))}
        </div>
      )}

      {
        <div className="chat">
          {messages.length > 0 &&
            messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "chat-user" : "chat-agent"}
              >
                <div className="chat-role">
                  {m.role === "user" ? "你" : "小游"}
                </div>
                <div className="chat-body">
                  {m.text ||
                    (busy && i === messages.length - 1 ? "思考中…" : "")}
                </div>
              </div>
            ))}
        </div>
      }

      {toolsUsed.length > 0 && (
        <p className="dim mono">
          工具调用：{[...new Set(toolsUsed)].map(shortTool).join(" → ")}
        </p>
      )}
      {error && <pre className="error">{error}</pre>}

      <div className="row" style={{ height: "150px" }}>
        <textarea
          className="textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="继续聊：你的理解、疑问、或者不同意小游的地方…"
          rows={3}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(draft);
          }}
        />
      </div>
      <div className="row" style={{ marginTop: "4px" }}>
        <button
          className="btn"
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => void send(draft)}
        >
          {busy ? "讲解中…" : "发送"}
        </button>
        {busy && (
          <button
            className="chip"
            type="button"
            onClick={() => abortRef.current?.abort()}
          >
            中断
          </button>
        )}
        {(sessionId || messages.length > 0) && (
          <button
            className="chip"
            type="button"
            disabled={busy}
            title="清空当前会话，开一个新话题"
            onClick={reset}
          >
            重置会话
          </button>
        )}
      </div>
    </section>
  );
}

function shortTool(name: string): string {
  return name.replace(/^mcp__xiaoyou__/, "");
}
