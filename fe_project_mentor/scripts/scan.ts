import path from "node:path";
import { scanRepo } from "xiaoyou-code-indexer";
import { resolveModuleEndpoints } from "xiaoyou-code-indexer/endpoint-types";
import type { ComponentNode } from "xiaoyou-code-indexer/types";
import { viaLabel } from "xiaoyou-code-indexer/via-label";

const MAX_MODULE_ENDPOINTS = 8;

const MAX_EXTERNAL_SHOWN = 6;

function treeLines(node: ComponentNode, depth = 0, lines: string[] = []): string[] {
  const pad = "  ".repeat(depth + 2);
  const mark = node.cyclic ? "   (环)" : node.duplicate ? "   (已展开)" : "";
  const via = node.via ? `   [${viaLabel(node.via)}]` : "";
  lines.push(`${pad}${node.name}${mark}${via}`);

  const shown = node.external.slice(0, MAX_EXTERNAL_SHOWN);
  for (const e of shown) lines.push(`${pad}  ~ ${e}`);
  if (node.external.length > shown.length) {
    lines.push(`${pad}  ~ … 另 ${node.external.length - shown.length} 个全局/第三方标签`);
  }

  if (!node.cyclic && !node.duplicate) {
    for (const child of node.children) treeLines(child, depth + 1, lines);
  }
  return lines;
}

const target = process.argv[2];
if (!target) {
  console.error("用法: yarn scan <本地仓库路径>");
  process.exit(1);
}

const map = scanRepo(path.resolve(target));
const { repo, stack, routes, modules, apiDomains, components, warnings, stats } = map;
const epByDomain = new Map(apiDomains.map(d => [d.name, d.endpoints]));
const allEndpoints = apiDomains.flatMap(d => d.endpoints);

console.log(`\n仓库 ${repo.name}`);
console.log(`  路径      ${repo.path}`);
console.log(
  `  技术栈    ${stack.kind} (vue@${stack.vueVersion ?? "?"}) / ${stack.builder}` +
    (stack.isQiankunChild ? " / qiankun 子应用" : ""),
);
console.log(
  `  扫描      ${stats.filesScanned} 文件, 忽略 ${stats.filesIgnored}, ` +
    `跳过符号链接 ${stats.symlinksSkipped.length}, 耗时 ${stats.durationMs}ms`,
);
console.log(
  `  组件图    ${components.stats.sfcCount} SFC, ${components.stats.edgeCount} 条父子边, ` +
    `${components.stats.externalTagCount} 个外部标签`,
);
console.log(`  端点      ${allEndpoints.length} 个后端端点`);

console.log(`\n路由 (${routes.length})`);
for (const r of routes) {
  const dest = r.componentFile ?? `redirect ${r.redirect ?? "-"}`;
  const perm = r.permissionCode ? `  [perm ${r.permissionCode}]` : "";
  const menu = r.isSiderMenu === false ? "  (隐藏)" : "";
  console.log(`  ${r.path} → ${r.label ?? "无 label"}${menu}${perm}`);
  console.log(`      ${dest}`);
}

console.log(`\n业务模块 (${modules.length})`);
for (const m of modules) {
  const api = m.api.length ? m.api.map(u => u.domain).join(", ") : "无 API 引用";
  console.log(`  ${m.name} → ${m.label ?? "无 label"}  [SFC ${m.components.length} · 树 ${m.treeSize}]`);
  console.log(`      API: ${api}`);

  const eps = resolveModuleEndpoints(m.api, epByDomain);
  if (eps.length > 0) {
    console.log(`      端点 (${eps.length}):`);
    for (const e of eps.slice(0, MAX_MODULE_ENDPOINTS)) {
      console.log(`        ${e.method.toUpperCase()}  ${e.url}`);
    }
    if (eps.length > MAX_MODULE_ENDPOINTS) {
      console.log(`        … 另 ${eps.length - MAX_MODULE_ENDPOINTS} 个`);
    }
  }

  if (m.tree) {
    for (const line of treeLines(m.tree)) console.log(line);
  }
}

console.log(`\nAPI 域 (${apiDomains.length}) · 端点 ${allEndpoints.length}`);
console.log(
  `  ` + apiDomains.map(d => `${d.name}(${d.endpoints.length}/${d.functions.length})`).join("  "),
);

const nonEndpoint = apiDomains.filter(d => d.nonEndpointFns.length > 0);
if (nonEndpoint.length > 0) {
  console.log(
    `  有导出但不打后端：` +
      nonEndpoint.map(d => `${d.name}[${d.nonEndpointFns.join(", ")}]`).join("  "),
  );
}

console.log(`\n警告 (${warnings.length})`);
for (const w of warnings) {
  console.log(`  [${w.kind}] ${w.message}`);
  for (const e of w.evidence.slice(0, 3)) console.log(`      ${e}`);
}
console.log();
