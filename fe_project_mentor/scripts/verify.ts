import path from "node:path";
import { scanRepo } from "xiaoyou-code-indexer";
import { resolveModuleEndpoints } from "xiaoyou-code-indexer/endpoint-types";
import type { ComponentNode } from "xiaoyou-code-indexer/types";

/**
 * M1 验收：对着 iho-icis-ui 的已知事实断言。
 * 事实来源：人工核对 src/router/index.ts、src/page/*、src/service/api/*、
 * src/page/bed-overview/index.vue（动态组件）、BedOverviewItem.vue（跨模块引用）。
 */
const EXPECTED = {
  routes: 11,
  modules: 13,
  apiDomains: 17,
  /** 命名不一致的样例：页面 conduit-manage 实际调用 API 域 catheter */
  mismatch: { module: "conduit-manage", domain: "catheter" },
  maxScanMs: 10_000,
  /** bed-overview/index.vue 用 defineAsyncComponent 动态引入这两个 */
  dynamicChildren: ["src/page/bed-overview/overview.vue", "src/page/bed-overview/other.vue"],
  /** BedOverviewItem.vue 显式 import 并渲染了别的模块的组件 */
  crossModuleChild: "src/page/nursing-record/nursing-record.vue",
};

const target = process.argv[2] ?? "d:/agent-work/gitlab/iho-icis-ui";
const map = scanRepo(path.resolve(target));

const failures: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

function treeFiles(node: ComponentNode | null, out = new Set<string>()): Set<string> {
  if (!node) return out;
  out.add(node.file);
  for (const c of node.children) treeFiles(c, out);
  return out;
}

const moduleByName = new Map(map.modules.map(m => [m.name, m]));
const bedOverview = moduleByName.get("bed-overview");
const conduit = moduleByName.get("conduit-manage");

console.log(`\nM1 验收 · ${map.repo.name}\n`);

check("路由数 = 11", map.routes.length === EXPECTED.routes, `实际 ${map.routes.length}`);
check("业务模块数 = 13", map.modules.length === EXPECTED.modules, `实际 ${map.modules.length}`);
check("API 域数 = 17", map.apiDomains.length === EXPECTED.apiDomains, `实际 ${map.apiDomains.length}`);
check(
  `命名不一致命中 ${EXPECTED.mismatch.module} ↔ ${EXPECTED.mismatch.domain}`,
  map.warnings.some(
    w =>
      w.kind === "naming-mismatch" &&
      w.message.includes(EXPECTED.mismatch.module) &&
      w.message.includes(EXPECTED.mismatch.domain),
  ),
);
check("扫描耗时 < 10s", map.stats.durationMs < EXPECTED.maxScanMs, `${map.stats.durationMs}ms`);
check(
  "路由均有 label 或 redirect",
  map.routes.every(r => r.label || r.redirect),
);

// ---- 组件图 ----
const graph = map.components;
check("组件图有 SFC 与边", graph.stats.sfcCount > 0 && graph.stats.edgeCount > 0,
  `${graph.stats.sfcCount} SFC / ${graph.stats.edgeCount} 边`);
check(
  "自动导入清单来自 components.d.ts",
  graph.autoImportSource === "dts",
  `实际 ${graph.autoImportSource}`,
);

const noTree = map.modules.filter(m => !m.tree || m.treeSize === 0);
check("每个模块都有非空组件树", noTree.length === 0, noTree.map(m => m.name).join(", "));

const bedFiles = treeFiles(bedOverview?.tree ?? null);
check(
  "bed-overview 树含动态引入的子组件",
  EXPECTED.dynamicChildren.every(f => bedFiles.has(f)),
  EXPECTED.dynamicChildren.filter(f => !bedFiles.has(f)).join(", "),
);
check(
  "跨模块引用被追踪到",
  bedFiles.has(EXPECTED.crossModuleChild),
  EXPECTED.crossModuleChild,
);
check(
  "conduit-manage 树含 ConduitMange",
  [...treeFiles(conduit?.tree ?? null)].some(f => f.includes("ConduitMange")),
);

// ---- 端点（链路终点）----
const allEndpoints = map.apiDomains.flatMap(d => d.endpoints);
const nonEndpoint = map.apiDomains.flatMap(d => d.nonEndpointFns);

check("端点数 >= 300", allEndpoints.length >= 300, `实际 ${allEndpoints.length}`);
check(
  "非端点导出函数 <= 3（纯工具函数，非提取失败）",
  nonEndpoint.length <= 3,
  nonEndpoint.join(", ") || "0 个",
);

const catheter = map.apiDomains.find(d => d.name === "catheter");
check(
  "catheter 提取到 queryCatheterConfigList 的端点",
  (catheter?.endpoints ?? []).some(
    e =>
      e.fn === "queryCatheterConfigList" &&
      e.method === "get" &&
      e.url === "/icis/api/catheter-configurations/search",
  ),
);

// 模板字符串 URL（RESTful 路径）必须能捕获，否则 delete/update 这类整批丢
check(
  "模板字符串 URL 被捕获（含占位符）",
  allEndpoints.some(e => e.url.includes("{") && e.url.includes("/delete/")),
);

// 模块 → api 函数 → 端点，这条链要能走通
const conduitEndpoints = resolveModuleEndpoints(
  moduleByName.get("conduit-manage")?.api ?? [],
  new Map(map.apiDomains.map(d => [d.name, d.endpoints])),
);
check("conduit-manage 能对回端点", conduitEndpoints.length > 0, `${conduitEndpoints.length} 个`);

console.log(
  `  [INFO] 树规模：` +
    map.modules
      .slice()
      .sort((a, b) => b.treeSize - a.treeSize)
      .slice(0, 5)
      .map(m => `${m.name}=${m.treeSize}`)
      .join("  "),
);

console.log(
  `  [INFO] 告警分布：` +
    Object.entries(
      map.warnings.reduce<Record<string, number>>((acc, w) => {
        acc[w.kind] = (acc[w.kind] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .map(([k, v]) => `${k}=${v}`)
      .join("  "),
);

console.log();
if (failures.length > 0) {
  console.error(`验收失败 ${failures.length} 项：`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("验收通过\n");
