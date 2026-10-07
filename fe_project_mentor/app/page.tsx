"use client";

import { useEffect, useState } from "react";
import type { ProjectMap } from "xiaoyou-code-indexer/types";
import ProjectMapView from "@/lib/ui/ProjectMapView";

const RECENT_KEY = "xiaoyou.recent";
const MAP_KEY = "xiaoyou.map.";

const CHAT_PATH = (repoPath: string) =>
  "/chat?" + new URLSearchParams({ repo: repoPath }).toString();

interface RepoOption {
  name: string;
  path: string;
  root: string;
}

export default function Home() {
  const [pathInput, setPathInput] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [roots, setRoots] = useState<string[]>([]);
  const [map, setMap] = useState<ProjectMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw) as string[]);
    } catch {
      /* localStorage 不可用就跳过 */
    }

    fetch("/api/repos")
      .then((r) => r.json())
      .then((d: { roots?: string[]; repos?: RepoOption[] }) => {
        setRepos(d.repos ?? []);
        setRoots(d.roots ?? []);
      })
      .catch(() => {
        /* 列不出来不影响手打路径 */
      });
  }, []);

  async function scan(target: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "扫描失败");
        setMap(null);
        return;
      }

      setMap(data as ProjectMap);
      try {
        sessionStorage.setItem(MAP_KEY + target, JSON.stringify(data));
      } catch {
        /* 存不下只影响交流页免扫描优化 */
      }
      const next = [target, ...recent.filter((x) => x !== target)].slice(0, 8);
      setRecent(next);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* 存不下就只影响下次的最近列表 */
      }
    } catch (err) {
      setError((err as Error).message);
      setMap(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <header className="hero">
        <div className="hero-top">
          <div>
            <h1>小游</h1>
            <p className="sub">
              前端项目导师 · M1 代码层：把一个陌生仓摊成项目地图
            </p>
          </div>
          {map && (
            <a className="btn" href={CHAT_PATH(map.repo.path)}>
              交流 →
            </a>
          )}
        </div>
      </header>

      <section className="s-card">
        <label className="lbl" htmlFor="path">
          本地仓库路径
        </label>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const t = pathInput.trim();
            if (t && !loading) void scan(t);
          }}
        >
          <input
            id="path"
            className="input"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="d:/agent-work/gitlab/iho-icis-ui"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className="btn"
            type="submit"
            disabled={loading || !pathInput.trim()}
          >
            {loading ? "扫描中…" : "扫描"}
          </button>
        </form>

        {repos.length > 0 && (
          <div className="chips">
            <span className="chips-label">允许范围内</span>
            {repos.map((r) => (
              <button
                key={r.path}
                className="chip"
                type="button"
                onClick={() => {
                  setPathInput(r.path);
                  void scan(r.path);
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}

        {recent.length > 0 && (
          <div className="chips">
            <span className="chips-label">最近打开</span>
            {recent.map((p) => (
              <button
                key={p}
                className="chip ghost"
                type="button"
                title={p}
                onClick={() => {
                  setPathInput(p);
                  void scan(p);
                }}
              >
                {p.split("/").filter(Boolean).pop()}
              </button>
            ))}
          </div>
        )}

        {roots.length > 0 && (
          <p className="hint">白名单根目录：{roots.join("　·　")}</p>
        )}
        {error && <pre className="error">{error}</pre>}
      </section>

      {map && <ProjectMapView map={map} />}
    </main>
  );
}
