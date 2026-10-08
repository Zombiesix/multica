#!/usr/bin/env node
/**
 * recon - 需求 planning 前的确定性事实底稿生成器
 *
 * 用法：node scripts/recon.mjs <别名>      例：node scripts/recon.mjs R-371467
 *
 * 数据源：xiaoyou-code-indexer 的 `scan`（一次调用拿全量 ProjectMap），
 *         扫的是主仓 gitlab/<仓名>，不是 worktree。
 * 产出：docs/requirements/<别名>/recon.md（覆盖式，幂等）
 *
 * 本脚本不含任何 LLM 判断：只做采集与渲染。空白 = 索引器无产出，
 * 不等于该仓没有这段代码。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEXER_DIR = path.join(ROOT, "xiaoyou-code-indexer");
const INDEXER_CLI = path.join(INDEXER_DIR, "bin", "cli.mjs");

const MAX_ENDPOINTS_PER_DOMAIN = 40;
const SAMPLE_ROWS = 10;
const MAX_HIT_ROWS = 40;
const MAX_COMPONENTS_PER_MODULE = 40;
const MAX_IMPORTED_TOP = 15;

const fail = msg => {
  process.stderr.write(`recon: ${msg}\n`);
  process.exit(1);
};

// ---------- 输入解析 ----------

const alias = process.argv[2];
if (!alias) fail("usage: node scripts/recon.mjs <alias>  (e.g. R-371467)");

const reqDir = path.join(ROOT, "docs", "requirements", alias);
const contextPath = path.join(reqDir, "context.md");
if (!fs.existsSync(contextPath)) fail(`context.md not found: ${contextPath}`);

const context = fs.readFileSync(contextPath, "utf8");

/** 取某个 `## 标题` 到下一个 `## ` 之间的正文 */
function section(md, title) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex(l => l.trim() === `## ${title}`);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

const reqTitle = section(context, "需求标题");
const reqOneLiner = section(context, "需求描述（一句话）");

// worktree 列形如 `iho-nurse-manager-ui-R-371467`，剥掉 -<别名> 得仓名
const tasksMd = fs.readFileSync(path.join(ROOT, "tasks.md"), "utf8");
const row = tasksMd
  .split(/\r?\n/)
  .find(l => l.startsWith("|") && l.split("|").map(s => s.trim())[1] === alias);
if (!row) fail(`no row for ${alias} in tasks.md`);
const worktree = row.split("|").map(s => s.trim())[5];
if (!worktree || worktree === "-") fail(`empty worktree column for ${alias} in tasks.md`);
if (!worktree.endsWith(`-${alias}`)) fail(`worktree "${worktree}" does not end with -${alias}`);
const repoName = worktree.slice(0, -(alias.length + 1));
const repoRoot = path.join(ROOT, "gitlab", repoName);
if (!fs.existsSync(repoRoot)) fail(`repo dir not found: ${repoRoot}`);

// ---------- 扫描 ----------

let map;
const t0 = Date.now();
try {
  const out = execFileSync(process.execPath, [INDEXER_CLI, "scan", repoRoot, "--compact"], {
    cwd: INDEXER_DIR,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  map = JSON.parse(out);
} catch (e) {
  fail(`indexer scan failed: ${String(e.message).slice(0, 300)}`);
}
const wallMs = Date.now() - t0;

const { stack, routes = [], modules = [], apiDomains = [], components = {}, warnings = [] } = map;

// ---------- 判定 ----------

const serviceDir = stack.serviceDir ? path.join(repoRoot, stack.serviceDir) : null;
const endpointTotal = apiDomains.reduce((a, d) => a + (d.endpoints?.length ?? 0), 0);

let verdict;
if (stack.kind !== "vue3") {
  verdict = `不支持（stack=${stack.kind}，索引器只有 vue3 适配，路由/模块/端点均为空）`;
} else if (!stack.routerFile) {
  verdict = "可索引但路由未识别（routerFile=null，§1 为空）";
} else if (endpointTotal === 0) {
  verdict = "可索引但接口层未解析（endpoints=0，见 §3 失败原因与兜底）";
} else {
  verdict = "可索引";
}

// ---------- §3 兜底：service 目录粗提 ----------

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue"]);
const URL_RE = /['"`](\/[A-Za-z0-9_\-./{}:]+)['"`]/g;

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (CODE_EXT.has(path.extname(e.name).toLowerCase())) out.push(abs);
  }
  return out;
}

/** serviceDir 探测失败时，按常见命名兜底找接口目录 */
function guessServiceDirs() {
  const candidates = ["src/service", "src/services", "src/api", "src/apis", "src/common/api"];
  return candidates.filter(c => fs.existsSync(path.join(repoRoot, c)));
}

function fallbackScan() {
  const dirs = serviceDir ? [serviceDir] : guessServiceDirs().map(c => path.join(repoRoot, c));
  const rows = [];
  for (const dir of dirs) {
    for (const abs of walk(dir)) {
      let code;
      try {
        code = fs.readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      const urls = [...new Set([...code.matchAll(URL_RE)].map(m => m[1]))];
      if (urls.length === 0) continue;
      rows.push({ file: path.relative(repoRoot, abs).replace(/\\/g, "/"), urls });
    }
  }
  rows.sort((a, b) => b.urls.length - a.urls.length || a.file.localeCompare(b.file));
  return { dirs: dirs.map(d => path.relative(repoRoot, d).replace(/\\/g, "/")), rows };
}

function endpointFailReason() {
  if (!stack.serviceDir) {
    const guessed = guessServiceDirs();
    return guessed.length
      ? `索引器的 serviceDir 探测为 null（它只认 src 下的 service / services / api 三个目录名）。已按常见命名兜底扫：${guessed.join("、")}`
      : "索引器的 serviceDir 探测为 null，且按 src/service|services|api|apis、src/common/api 兜底也没找到接口目录";
  }
  if (apiDomains.length === 0) return `探测到 serviceDir=${stack.serviceDir}，但未解析出任何 api 域`;
  const nonEmpty = apiDomains.filter(d => (d.nonEndpointFns?.length ?? 0) > 0);
  if (nonEmpty.length) {
    return `api 域存在但端点为 0：调用形态不是 client.get('url') 直调（可能是对象参数 request({url}) 或二次封装），落在 nonEndpointFns 里，共 ${nonEmpty.length} 个域有此类函数`;
  }
  return "api 域存在但端点为 0，且无 nonEndpointFns 记录，原因需人工核查";
}

// ---------- §5 关键词候选命中 ----------

const STOP_GRAMS = new Set([
  "系统", "管理", "功能", "支持", "需要", "进行", "问题", "一个", "可以",
  "相关", "内容", "查看", "显示", "默认", "页面", "模块", "需求", "要求",
  "数据", "如下", "并且", "以及", "其他", "如果", "必须", "不能", "当前",
]);

function splitKeywords(text) {
  const ascii = [...new Set([...text.matchAll(/[A-Za-z][A-Za-z0-9_-]{2,}/g)].map(m => m[0].toLowerCase()))];
  const grams = [];
  for (const run of text.match(/[一-鿿]+/g) ?? []) {
    for (const n of [2, 3, 4]) {
      for (let i = 0; i + n <= run.length; i++) grams.push(run.slice(i, i + n));
    }
  }
  const cjk = [...new Set(grams.filter(g => !(g.length === 2 && STOP_GRAMS.has(g))))];
  return { ascii, cjk, all: [...ascii, ...cjk] };
}

/** 与 src/query/search.ts 同语义：小写化后子串包含 */
function findHits(words) {
  const hits = [];
  for (const w of words) {
    const k = w.toLowerCase();
    for (const r of routes) {
      if (r.path?.toLowerCase().includes(k)) hits.push({ kind: "route", target: r.path, field: "path", keyword: w });
      else if (r.label?.toLowerCase().includes(k)) hits.push({ kind: "route", target: r.path, field: "label", keyword: w });
    }
    for (const m of modules) {
      if (m.name?.toLowerCase().includes(k)) hits.push({ kind: "module", target: m.name, field: "name", keyword: w });
      else if (m.label?.toLowerCase().includes(k)) hits.push({ kind: "module", target: m.name, field: "label", keyword: w });
    }
  }
  // 同一 target 保留最长的命中词（越长越具体）
  const best = new Map();
  for (const h of hits) {
    const key = `${h.kind}