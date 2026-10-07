/**
 * 端点相关的纯类型与纯逻辑，**不得引入任何 Node 模块**。
 * 客户端组件（ProjectMapView）要 import 这里；一旦引入 typescript / node:fs，
 * 它们会被打进浏览器 bundle 并报 UnhandledSchemeError。
 * 真正需要 AST 的提取逻辑在 endpoints.ts，那是 server-only。
 */
export interface Endpoint {
  /** api 函数名，如 queryCatheterConfigList */
  fn: string;
  /** HTTP 方法：get / post / upload / download / delete */
  method: string;
  /** 后端路径，如 /icis/api/catheter-configurations/search */
  url: string;
  /** 路径首段，通常是后端系统标识，如 icis */
  urlPrefix: string;
  file: string;
  line: number;
}

/**
 * 把模块引用的 api 函数（形如 "catheter/queryList"）对回真实端点。
 * CLI 与 UI 共用，避免两边逻辑漂移。
 */
export function resolveModuleEndpoints(
  usages: { domain: string; refs: string[] }[],
  byDomain: Map<string, Endpoint[]>,
): Endpoint[] {
  const out: Endpoint[] = [];
  const seen = new Set<string>();

  for (const usage of usages) {
    const refFns = new Set(
      usage.refs.map(r => (r.includes("/") ? r.split("/").slice(1).join("/") : r)),
    );
    for (const ep of byDomain.get(usage.domain) ?? []) {
      if (!refFns.has(ep.fn)) continue;
      const key = `${ep.method} ${ep.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ep);
    }
  }

  return out.sort((a, b) => a.url.localeCompare(b.url));
}
