import fs from "node:fs";
import path from "node:path";
import { mentorToolDefinitions } from "../lib/mentor/tools";

/**
 * 讲解 + 复述检验（M2 第二切片）离线验收。
 * 不需要 LLM 的部分在这里断言；LLM 链路由 `yarn probe:agent` 与真实 teach 跑通验证。
 *
 * 用法：yarn verify:teach [仓路径]   默认 d:/multica/gitlab/iho-icis-ui
 */
const REPO = process.argv[2] ?? "d:/multica/gitlab/iho-icis-ui";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.log(`[FAIL] ${name}${detail ? `  -> ${detail}` : ""}`);
  }
}

// 1) 人格文件：讲解协议的三个灵魂（分层 / 探讨 / 不编造）都在
const personaPath = path.join(process.cwd(), "lib", "mentor", "persona.md");
const persona = fs.existsSync(personaPath) ? fs.readFileSync(personaPath, "utf8") : "";
check("persona.md 存在", persona.length > 0);
check("人格含四层讲解协议", persona.includes("L1") && persona.includes("L2") && persona.includes("L4"));
check("人格含探讨协议（且不是考试式检验）", persona.includes("探讨协议") && !persona.includes("复述检验协议"));
check("人格含不编造铁律", persona.includes("不编造"));

// 2) 工具接线：plan 4.3 的四个工具都在，且是讲者视角的语义
const defs = mentorToolDefinitions(REPO);
const names = defs.map(d => (d as { name: string }).name);
check(
  "四个工具齐全",
  ["get_project_map", "trace_flow", "search_knowledge", "propose_knowledge"].every(n => names.includes(n)),
  names.join(","),
);

// 3) Claude Code native binary 可解析（Agent SDK 运行时的前提）
const exe = process.platform === "win32" ? "claude.exe" : "claude";
const found = (process.env.PATH ?? "")
  .split(path.delimiter)
  .flatMap(dir => [
    path.join(dir, "node_modules", "@anthropic-ai", "claude-code", "bin", exe),
    path.join(dir, exe),
  ])
  .concat([path.join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".local", "bin", exe)])
  .filter(p => !p.endsWith(".cmd") && !p.endsWith(".bat"))
  .some(p => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
check("Claude Code native binary 可解析", found, "PATH 里找不到 claude.exe，可设 XIAOYOU_CLAUDE_CODE_PATH");

// 4) 真实跑通的产物：讲解会话落了两条 proposed（来自 teach 实测，见 plan.md 10.6）
const docsRoot = path.join(process.cwd(), ".xiaoyou", path.basename(REPO), "docs");
for (const [kind, id, expectConf] of [
  ["flows", "床位总览-出科tab复用转科患者接口", "low"],
  ["modules", "监护仪弹窗走-instrument-域非-overview-域", "high"],
] as const) {
  const file = path.join(docsRoot, kind, `${id}.md`);
  let ok = false;
  let conf = "";
  try {
    const raw = fs.readFileSync(file, "utf8");
    ok = raw.includes('status: "proposed"') && raw.includes("evidence:") && raw.includes("  - ");
    const m = raw.match(/confidence: "(\w+)"/);
    conf = m?.[1] ?? "";
  } catch {
    /* 缺文件 */
  }
  check(`产物条目 ${kind}/${id} 为 proposed 且带 evidence`, ok);
  if (ok) check(`  └ 置信度为 ${expectConf}`, conf === expectConf, conf);
}

console.log();
if (failed > 0) {
  console.error(`验收失败 ${failed} 项（通过 ${passed}）`);
  process.exit(1);
}
console.log(`验收通过（${passed} 项）`);
