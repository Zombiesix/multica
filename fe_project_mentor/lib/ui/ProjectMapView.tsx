"use client";

import {
  type Endpoint,
  resolveModuleEndpoints,
} from "xiaoyou-code-indexer/endpoint-types";
import type {
  ComponentNode,
  ProjectMap,
  Warning,
} from "xiaoyou-code-indexer/types";
import { viaLabel } from "xiaoyou-code-indexer/via-label";

function EndpointList({ endpoints }: { endpoints: Endpoint[] }) {
  if (endpoints.length === 0) return null;
  return (
    <details className="tree">
      <summary className="dim">展开端点 ({endpoints.length})</summary>
      <ul className="tlist root">
        {endpoints.map((e) => (
          <li key={`${e.method} ${e.url}`} className="tnode">
            <div className="li-title">
              <span className="tag">{e.method.toUpperCase()}</span>
              <span className="mono">{e.url}</span>
              <span className="dim mono">
                {e.file.split("/").pop()}:{e.line}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function TreeNode({ node, pathKey }: { node: ComponentNode; pathKey: string }) {
  const marks: string[] = [];
  const via = viaLabel(node.via);
  if (via) marks.push(via);
  if (node.duplicate) marks.push("已展开");
  if (node.cyclic) marks.push("环");

  return (
    <li className="tnode">
      <div className="li-title">
        <span className="mono">{node.name}</span>
        {marks.map((m) => (
          <span key={m} className="tag">
            {m}
          </span>
        ))}
        {node.external.length > 0 && (
          <span className="dim mono">
            {" "}
            ~ {node.external.slice(0, 4).join(", ")}
            {node.external.length > 4 ? ` +${node.external.length - 4}` : ""}
          </span>
        )}
      </div>
      {node.children.length > 0 && (
        <ul className="tlist">
          {node.children.map((child, i) => (
            <TreeNode
              key={`${pathKey}/${child.file}#${i}`}
              node={child}
              pathKey={`${pathKey}/${i}`}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

const WARN_LABEL: Record<Warning["kind"], string> = {
  "naming-mismatch": "命名不一致",
  "orphan-api-domain": "孤儿 API 域",
  "orphan-route": "模块外路由",
  "orphan-module": "模块无路由入口",
  "dynamic-children": "动态渲染",
  "unresolved-component": "组件未解析",
  "unsupported-stack": "栈不支持",
};

export default function ProjectMapView({ map }: { map: ProjectMap }) {
  const { repo, stack, routes, modules, apiDomains, warnings, stats } = map;
  const componentGraph = map.components;

  const epByDomain = new Map<string, Endpoint[]>(
    apiDomains.map((d) => [d.name, d.endpoints]),
  );
  const endpointTotal = apiDomains.reduce((n, d) => n + d.endpoints.length, 0);

  // 命名不一致是"业务知识缺口"的直接证据：链接由 import 推导，所以确有调用但名字对不上
  const mismatches = warnings.filter((w) => w.kind === "naming-mismatch");
  const others = warnings.filter((w) => w.kind !== "naming-mismatch");

  return (
    <div className="project-map">
      <div className="p-map">
        <section className="s-card">
          <h2>{repo.name}</h2>
          <p className="mono dim">{repo.path}</p>
          <div className="facts">
            <Fact
              k="技术栈"
              v={`${stack.kind} · vue@${stack.vueVersion ?? "?"} · ${stack.builder}`}
            />
            {stack.isQiankunChild && (
              <Fact k="微前端" v="qiankun 子应用（跨应用链路不在本仓）" />
            )}
            <Fact k="路由" v={`${routes.length} 条`} />
            <Fact k="业务模块" v={`${modules.length} 个`} />
            <Fact k="API 域" v={`${apiDomains.length} 个`} />
            <Fact k="后端端点" v={`${endpointTotal} 个`} />
            <Fact
              k="组件图"
              v={`${componentGraph.stats.sfcCount} SFC · ${componentGraph.stats.edgeCount} 条边`}
            />
            <Fact
              k="自动导入清单"
              v={
                componentGraph.autoImportSource === "dts"
                  ? "components.d.ts"
                  : componentGraph.autoImportSource === "basename"
                    ? "按 components/ 目录名推断"
                    : "未找到"
              }
            />
            {componentGraph.dynamicComponents.length > 0 && (
              <Fact
                k="动态渲染"
                v={`${componentGraph.dynamicComponents.length} 个文件用 <component :is>`}
              />
            )}
            <Fact
              k="扫描"
              v={`${stats.filesScanned} 文件 · ${stats.durationMs}ms`}
            />
            <Fact k="跳过符号链接" v={`${stats.symlinksSkipped.length} 个`} />
          </div>
        </section>

        {mismatches.length > 0 && (
          <section className="card m-card attention">
            <h2>待人工确认 ({mismatches.length})</h2>
            <p className="dim">
              模块名与它实际调用的 API
              域名对不上。这类映射无法从代码推出，只能问人——M2
              的提问清单从这里开始。
            </p>
            <ul className="list">
              {mismatches.map((w, i) => (
                <li key={i}>
                  <div className="li-title">{w.message}</div>
                  <div className="mono dim">
                    {w.evidence.slice(0, 2).join("  ·  ")}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card m-card">
          <h2>路由 ({routes.length})</h2>
          <div className="tbl-container">
            <table className="tbl">
              <thead>
                <tr>
                  <th>path</th>
                  <th>业务名</th>
                  <th>组件</th>
                  <th>权限码</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={`${r.path}-${r.name ?? ""}`}>
                    <td className="mono">{r.path}</td>
                    <td>
                      {r.label ?? <span className="dim">—</span>}
                      {r.isSiderMenu === false && (
                        <span className="tag">隐藏</span>
                      )}
                    </td>
                    <td className="mono dim">
                      {r.componentFile ?? `redirect ${r.redirect ?? "—"}`}
                    </td>
                    <td className="mono dim">{r.permissionCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card m-card">
          <h2>业务模块 ({modules.length})</h2>
          <ul className="list">
            {modules.map((m) => (
              <li key={m.name}>
                <div className="li-title">
                  {m.label && <span className="label-badge">{m.label}</span>}
                  <span className="mono">{m.name}</span>
                  <span className="dim">
                    {" "}
                    · SFC {m.components.length} · 组件树 {m.treeSize}
                  </span>
                </div>
                <div className="mono dim">
                  API：
                  {m.api.length > 0
                    ? m.api.map((u) => u.domain).join(", ")
                    : "无引用"}
                </div>
                <EndpointList
                  endpoints={resolveModuleEndpoints(m.api, epByDomain)}
                />
                {m.tree && (
                  <details className="tree">
                    <summary className="dim">展开组件树</summary>
                    <ul className="tlist root">
                      <TreeNode node={m.tree} pathKey={m.name} />
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="card m-card">
          <h2>API 域 ({apiDomains.length})</h2>
          <ul className="list">
            {apiDomains.map((d) => (
              <li key={d.name}>
                <div className="li-title">
                  <span className="mono">{d.name}</span>
                  <span className="dim">
                    {" "}
                    · {d.files.length} 文件 · {d.endpoints.length} 端点 ·{" "}
                    {d.usedByModules.length === 0
                      ? "无模块引用"
                      : `被 ${d.usedByModules.length} 个模块引用`}
                  </span>
                  {d.usedByModules.length >= 3 && (
                    <span className="tag">共享域</span>
                  )}
                </div>
                {d.usedByModules.length > 0 && (
                  <div className="mono dim">{d.usedByModules.join(", ")}</div>
                )}
                {d.nonEndpointFns.length > 0 && (
                  <div className="mono dim">
                    有导出但不打后端：{d.nonEndpointFns.join(", ")}
                  </div>
                )}
                <EndpointList endpoints={d.endpoints} />
              </li>
            ))}
          </ul>
        </section>

        {others.length > 0 && (
          <section className="card m-card">
            <h2>其他告警 ({others.length})</h2>
            <ul className="list">
              {others.map((w, i) => (
                <li key={i}>
                  <div className="li-title">
                    <span className="tag">{WARN_LABEL[w.kind]}</span>
                    {w.message}
                  </div>
                  {w.evidence.length > 0 && (
                    <div className="mono dim">
                      {w.evidence.slice(0, 2).join("  ·  ")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="fact">
      <span className="fact-k">{k}</span>
      <span className="fact-v">{v}</span>
    </div>
  );
}
