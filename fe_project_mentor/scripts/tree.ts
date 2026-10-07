import path from "node:path";
import { scanRepo } from "xiaoyou-code-indexer";
import type { ComponentNode } from "xiaoyou-code-indexer/types";
import { viaLabel } from "xiaoyou-code-indexer/via-label";

/** 用法: yarn tree <仓路径> <模块名>  —— 带完整路径打印某个模块的组件树 */
const [target, moduleName] = process.argv.slice(2);

if (!target || !moduleName) {
  console.error("用法: yarn tree <本地仓库路径> <模块名>");
  process.exit(1);
}

const map = scanRepo(path.resolve(target));
const mod = map.modules.find(m => m.name === moduleName);

if (!mod) {
  console.error(`没有模块 "${moduleName}"。现有：${map.modules.map(m => m.name).join(", ")}`);
  process.exit(1);
}

if (!mod.tree) {
  console.error(`模块 "${moduleName}" 没有组件树（无入口组件）`);
  process.exit(1);
}

const lines: string[] = [];
const walk = (node: ComponentNode, depth: number): void => {
  const pad = "  ".repeat(depth);
  const marks: string[] = [];
  const via = viaLabel(node.via);
  if (via) marks.push(via);
  if (node.duplicate) marks.push("已展开");
  if (node.cyclic) marks.push("环");

  lines.push(`${pad}${node.name}${marks.length ? ` [${marks.join(",")}]` : ""}`);
  lines.push(`${pad}    ${node.file}`);
  if (node.external.length > 0) {
    lines.push(`${pad}    ~ 外部: ${node.external.join(", ")}`);
  }
  for (const child of node.children) walk(child, depth + 1);
};

walk(mod.tree, 0);

console.log(`\n${mod.name} 组件树（${mod.treeSize} 个组件）\n`);
console.log(lines.join("\n"));
console.log();
