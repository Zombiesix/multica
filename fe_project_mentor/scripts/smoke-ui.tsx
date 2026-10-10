/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { renderToString } from "react-dom/server";
import { scanRepo } from "code-indexer";
import ProjectMapView from "../lib/ui/ProjectMapView";

/**
 * UI 冒烟：拿真实扫描数据把 ProjectMapView 渲染成字符串。
 * 能抓到渲染期崩溃（空值访问、树递归爆栈之类），但抓不到交互问题——
 * 交互仍须人工在浏览器里点。
 */
function main(): void {
  const target = process.argv[2] ?? "d:/multica/gitlab/iho-icis-ui";
  const map = scanRepo(target);

  const html = renderToString(<ProjectMapView map={map} />);

  const markers: [string, string][] = [
    ["仓库名", map.repo.name],
    ["路由条数", `${map.routes.length} 条`],
    ["组件树边数", `${map.components.stats.edgeCount} 条边`],
    ["端点总数", `${map.apiDomains.flatMap((d) => d.endpoints).length} 个`],
  ];

  const failures: string[] = [];
  console.log(`\nUI 冒烟 · ${map.repo.name}  (html ${html.length} 字符)\n`);

  for (const [label, needle] of markers) {
    const ok = html.includes(needle);
    console.log(`  [${ok ? "PASS" : "FAIL"}] 渲染含${label}  ${needle}`);
    if (!ok) failures.push(label);
  }

  // 组件树里最深的那个模块也要能渲染出来
  const deepest = [...map.modules].sort((a, b) => b.treeSize - a.treeSize)[0];
  if (deepest) {
    const ok = html.includes(deepest.name);
    console.log(
      `  [${ok ? "PASS" : "FAIL"}] 渲染含最大模块  ${deepest.name} (树 ${deepest.treeSize})`,
    );
    if (!ok) failures.push("最大模块");
  }

  console.log();
  if (failures.length > 0) {
    console.error(`冒烟失败 ${failures.length} 项：${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("冒烟通过\n");
}

main();
