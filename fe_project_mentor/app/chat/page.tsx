"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProjectMap } from "code-indexer/types";
import type { KnowledgeEntry } from "@/lib/knowledge/schema";
import MentorPanel from "@/lib/ui/MentorPanel";
import TeachPanel from "@/lib/ui/TeachPanel";

const MAP_KEY = "xiaoyou.map.";

export default function ChatPage() {
  const [repoPath, setRepoPath] = useState("");
  const [map, setMap] = useState<ProjectMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [docsRoot, setDocsRoot] = useState("");

  // 知识暂存提升到这里：一起探讨的 agent 每轮结束都刷新，条目无需手动刷页面
  const loadEntries = useCallback(async (target: string) => {
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target }),
      });
      const data = await res.json();
      if (res.ok) {
        setEntries(data.entries ?? []);
        setDocsRoot(data.docsRoot ?? "");
      }
    } catch {
      /* 列表拉不到不影响提问 */
    }
  }, []);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("repo");
    if (!raw) {
      setError("缺少 repo 参数，请从项目地图页进入");
      setReady(true);
      return;
    }
    const path = decodeURIComponent(raw);

    // 主页面扫描成功后就把 ProjectMap 存进 sessionStorage，这里免重新扫描
    try {
      const cached = sessionStorage.getItem(MAP_KEY + path);
      if (cached) {
        const m = JSON.parse(cached) as ProjectMap;
        setMap(m);
        setRepoPath(m.repo.path);
        void loadEntries(m.repo.path);
        setReady(true);
        return;
      }
    } catch {
      /* 取不到就退回扫描 */
    }

    fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.repo?.path) throw new Error(d?.error ?? "扫描失败");
        setMap(d as ProjectMap);
        setRepoPath(d.repo.path);
        void loadEntries(d.repo.path);
      })
      .catch((err) => setError(err.message))
      .finally(() => setReady(true));
  }, [loadEntries]);

  const quickTargets =
    map?.routes.map((r) => ({ path: r.path, label: r.label })) ?? [];

  return (
    <main className="wrap">
      <header className="hero">
        <div className="hero-top">
          <div>
            <h1>交流</h1>
            <p className="sub">
              小游 · 把代码聊懂
              {repoPath && <span className="mono dim"> {repoPath}</span>}
            </p>
          </div>
          <a className="chip" href="/">
            ← 返回项目地图
          </a>
        </div>
      </header>

      {error && <pre className="error">{error}</pre>}
      {!ready && <p className="dim">加载中…</p>}

      {repoPath && (
        <div className="columns">
          <TeachPanel
            repoPath={repoPath}
            quickTargets={quickTargets}
            onTurnEnd={() => void loadEntries(repoPath)}
          />
          <MentorPanel
            repoPath={repoPath}
            entries={entries}
            docsRoot={docsRoot}
            onEntries={setEntries}
          />
        </div>
      )}
    </main>
  );
}
