"use client";

import { useCallback, useEffect, useState } from "react";
import type { KnowledgeEntry } from "@/lib/knowledge/schema";
import type { MentorQuestion } from "@/lib/mentor/questions";

const CATEGORY_LABEL: Record<string, string> = {
  naming: "命名不一致",
  dynamic: "动态渲染",
  "orphan-module": "无路由模块",
  "orphan-route": "模块外路由",
  "duplicate-endpoint": "重复端点",
};

const KIND_LABEL: Record<string, string> = {
  glossary: "术语",
  module: "模块",
  flow: "流程",
  decision: "决策",
};

interface AnswerState {
  followUp: string;
  entryId: string;
}

export interface DeliverReportView {
  repoName: string;
  branch: string;
  copied: string[];
  skipped: string[];
  commits: string[];
  changed: string[];
  empty: boolean;
}

interface MentorPanelProps {
  repoPath: string;
  /** 知识暂存条目由父级持有：一起探讨的 agent 落成条目后父级刷新，这里跟着变 */
  entries: KnowledgeEntry[];
  docsRoot: string;
  /** 本面板内产生的条目变化（回答/确认后接口返回的最新列表）回传给父级 */
  onEntries: (entries: KnowledgeEntry[]) => void;
}

export default function MentorPanel({ repoPath, entries, docsRoot, onEntries }: MentorPanelProps) {
  const [questions, setQuestions] = useState<MentorQuestion[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliver, setDeliver] = useState<DeliverReportView | null>(null);
  const [deliverBusy, setDeliverBusy] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerState | null>(null);

  const loadQuestions = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: repoPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "派生问题失败");
        return;
      }
      setQuestions(data.questions ?? []);
      setCounts(data.counts ?? {});
    } catch (err) {
      setError((err as Error).message);
    }
  }, [repoPath]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  async function submit(question: MentorQuestion) {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: repoPath, questionId: question.id, answer: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "落成条目失败");
        return;
      }
      onEntries(data.entries ?? []);
      setResult({ followUp: data.followUp ?? "", entryId: data.entry?.id ?? "" });
      setDraft("");
      setOpenId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(kind: string, id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: repoPath, confirm: { kind, id } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "确认失败");
        return;
      }
      onEntries(data.entries ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deliverToRepo() {
    setDeliverBusy(true);
    setDeliverError(null);
    setDeliver(null);
    try {
      const res = await fetch("/api/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: repoPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeliverError(data?.error ?? "落库失败");
        return;
      }
      setDeliver(data as DeliverReportView);
    } catch (err) {
      setDeliverError((err as Error).message);
    } finally {
      setDeliverBusy(false);
    }
  }

  const pending = entries.filter(e => e.status === "proposed").length;

  return (
    <>
      <section className="card">
        <h2>追问 ({questions.length})</h2>
        <p className="dim">
          这些都是从代码里看出来的、只能问人的东西。答完会落成待确认的知识条目。
        </p>

        {Object.keys(counts).length > 0 && (
          <div className="chips">
            {Object.entries(counts).map(([k, v]) => (
              <span key={k} className="chip ghost">
                {CATEGORY_LABEL[k] ?? k} {v}
              </span>
            ))}
          </div>
        )}

        {error && <pre className="error">{error}</pre>}

        {result && (
          <div className="notice">
            已落成条目 <span className="mono">{result.entryId}</span>（待确认）
            {result.followUp && <div className="dim">建议追问：{result.followUp}</div>}
          </div>
        )}

        <ul className="list">
          {questions.map(q => (
            <li key={q.id}>
              <div className="li-title">
                <span className="tag">{CATEGORY_LABEL[q.category] ?? q.category}</span>
                <span className="q-text">{q.prompt}</span>
              </div>
              <div className="mono dim">{q.evidence[0] ?? ""}</div>

              {openId === q.id ? (
                <div className="answer-box">
                  <textarea
                    className="textarea"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder={"用自己的话说，含糊也没关系——说不清就写「不清楚」，我会标记低置信度"}
                    rows={4}
                    autoFocus
                  />
                  <div className="row">
                    <button
                      className="btn"
                      type="button"
                      disabled={busy || !draft.trim()}
                      onClick={() => void submit(q)}
                    >
                      {busy ? "整理中…" : "提交"}
                    </button>
                    <button
                      className="chip"
                      type="button"
                      onClick={() => {
                        setOpenId(null);
                        setDraft("");
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="chip"
                  type="button"
                  onClick={() => {
                    setOpenId(q.id);
                    setDraft("");
                    setResult(null);
                  }}
                >
                  回答
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>
          知识暂存 ({entries.length}){pending > 0 && <span className="tag">待确认 {pending}</span>}
        </h2>
        <p className="dim">
          暂存在小游自己的目录里，<strong>没有碰你的仓库</strong>。确认后才写入目标仓分支。
          {docsRoot && <span className="mono"> {docsRoot}</span>}
        </p>

        {entries.length === 0 && <p className="dim">还没有条目。先回答上面的问题。</p>}

        <ul className="list">
          {entries.map(e => (
            <li key={`${e.kind}/${e.id}`}>
              <div className="li-title">
                <span className="tag">{KIND_LABEL[e.kind] ?? e.kind}</span>
                <span className="label-badge">{e.title}</span>
                <span className={e.status === "confirmed" ? "tag ok" : "tag warn"}>
                  {e.status === "confirmed" ? "已确认" : "待确认"}
                </span>
                <span className="dim">置信度 {e.confidence}</span>
              </div>
              <div className="body-text">{e.body}</div>
              <div className="mono dim">出处：{e.evidence.slice(0, 2).join("  ·  ")}</div>
              {e.status === "proposed" && (
                <button
                  className="chip"
                  type="button"
                  disabled={busy}
                  onClick={() => void confirm(e.kind, e.id)}
                >
                  确认这条
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card attention">
        <h2>落到目标仓</h2>
        <p className="dim">
          把暂存区的知识写进你的仓库：新建分支{" "}
          <span className="mono">xiaoyou/docs-&lt;date&gt;</span>，写入{" "}
          <span className="mono">docs/</span> 并 commit。与现有同名文件冲突时跳过、不覆盖。
          <strong> 绝不 push</strong>——确认后由你自己 push。
        </p>

        {deliverError && <pre className="error">{deliverError}</pre>}

        {deliver && (
          <div className="notice">
            {deliver.empty ? (
              <p>没有可写入的新文件（暂存区为空，或都已在目标仓存在）。</p>
            ) : (
              <>
                <p>
                  已新建分支 <span className="mono">{deliver.branch}</span>
                  {deliver.commits.length > 0 && (
                    <>
                      {" "}并提交 <span className="mono">{deliver.commits[0]}</span>
                    </>
                  )}
                  ，共 {deliver.copied.length} 个文件。
                  <strong> 未 push</strong>。
                </p>
                <ul className="list">
                  {deliver.copied.map(f => (
                    <li key={f} className="mono">
                      + {f}
                    </li>
                  ))}
                  {deliver.skipped.map(f => (
                    <li key={f} className="mono dim">
                      = 已存在，跳过 {f}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={deliverBusy || entries.length === 0}
            title={entries.length === 0 ? "先问答产生知识条目" : "新建分支 + 写入 docs/ + commit（不 push）"}
            onClick={() => void deliverToRepo()}
          >
            {deliverBusy ? "落库中…" : "落库到目标仓"}
          </button>
        </div>
      </section>
    </>
  );
}
