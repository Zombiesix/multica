import fs from "node:fs";
import path from "node:path";
import type { GitOptions } from "@/lib/domain/git";

// 部署节点可选的仓库与目标分支，来自本机配置文件（不入库，见 .gitignore 的 /data/）。
// 形状：{ "root": "D:/multica/gitlab", "repos": [...], "branches": [...] }
// 读不到配置文件时退回内置默认值，保证下拉框不炸。

interface GitConfig extends GitOptions {
  root: string;
}

const DEFAULT_ROOT = "D:/multica/gitlab";
const DEFAULT_REPOS = [
  "iho-aers-web",
  "iho-cssd-ui",
  "iho-cssd-ui-mobile",
  "iho-ehr-ui",
  "iho-haimis-ui",
  "iho-icis-ui",
  "iho-medical-record-ui",
  "iho-medical-ui",
  "iho-nbs-web",
  "iho-nurse-manager-ui",
  "iho-pathology-ui",
  "reuseapp-blood-bank-web",
];
const DEFAULT_BRANCHES = ["dev", "dev-zjb", "dev-iho-feat"];
const DEFAULT_JENKINS: Record<string, string> = {
  "iho-aers-web": "http://192.168.1.120:9990/jenkins/job/aers-web/build",
  "iho-cssd-ui": "http://192.168.1.120:9990/jenkins/job/iho-cssd-web/build",
  "iho-cssd-ui-mobile":
    "http://192.168.1.120:9990/jenkins/job/iho-cssdH5消毒供应移动端/build",
  "iho-ehr-ui": "http://192.168.1.120:9990/jenkins/job/iho-ehr-web/build",
  "iho-haimis-ui": "http://192.168.1.120:9990/jenkins/job/iho-haimis-web/build",
  "iho-icis-ui": "http://192.168.1.120:9990/jenkins/job/iho-icis-web/build",
  "iho-medical-record-ui":
    "http://192.168.1.120:9990/jenkins/job/iho-mrms-web/build",
  "iho-medical-ui": "http://192.168.1.120:9990/jenkins/job/iho-treat-web/build",
  "iho-nbs-web": "http://192.168.1.120:9990/jenkins/job/iho-nbs-web/build",
  "iho-nurse-manager-ui":
    "http://192.168.1.120:9990/jenkins/job/iho-hosnurse-web/build",
  "iho-pathology-ui": "http://192.168.1.120:9990/jenkins/job/pis_web/build",
  "reuseapp-blood-bank-web":
    "http://192.168.1.120:9990/jenkins/job/bloodbank-web/build",
};

let cached: GitConfig | null = null;

function resolveConfigFile(): string | null {
  const fromEnv = process.env.GIT_REPOS_FILE;
  if (fromEnv && fs.existsSync(path.resolve(fromEnv))) {
    return path.resolve(fromEnv);
  }
  const candidate = path.join(process.cwd(), "data", "repos.json");
  return fs.existsSync(candidate) ? candidate : null;
}

function nonEmptyStrings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const list = value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return list.length ? list : fallback;
}

function jenkinsMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_JENKINS;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : DEFAULT_JENKINS;
}

function loadConfig(): GitConfig {
  if (cached) return cached;
  const file = resolveConfigFile();
  if (!file) {
    cached = {
      root: DEFAULT_ROOT,
      repos: DEFAULT_REPOS,
      branches: DEFAULT_BRANCHES,
      jenkins: DEFAULT_JENKINS,
    };
    return cached;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error(`repos.json 不是合法 JSON：${file}`);
  }
  const obj = (raw || {}) as Partial<GitConfig>;
  cached = {
    root: typeof obj.root === "string" && obj.root.trim() ? obj.root.trim() : DEFAULT_ROOT,
    repos: nonEmptyStrings(obj.repos, DEFAULT_REPOS),
    branches: nonEmptyStrings(obj.branches, DEFAULT_BRANCHES),
    jenkins: jenkinsMap(obj.jenkins),
  };
  return cached;
}

export function readGitOptions(): GitOptions {
  const { repos, branches, jenkins } = loadConfig();
  return { repos, branches, jenkins };
}

// 仓库名必须来自配置白名单，且不含路径分隔符 —— 两道锁一起挡目录穿越。
export function resolveRepoPath(repo: string): string {
  const cfg = loadConfig();
  if (!cfg.repos.includes(repo)) {
    throw new Error(`仓库不在配置列表中：${repo}`);
  }
  if (/[\\/:]|\.\./.test(repo)) {
    throw new Error(`仓库名不合法：${repo}`);
  }
  const root = path.resolve(cfg.root);
  const full = path.join(root, repo);
  if (path.dirname(full) !== root) {
    throw new Error(`仓库路径越界：${repo}`);
  }
  if (!fs.existsSync(path.join(full, ".git"))) {
    throw new Error(`不是 git 仓库或目录不存在：${full}`);
  }
  return full;
}

export function assertBranch(branch: string): void {
  const cfg = loadConfig();
  if (!cfg.branches.includes(branch)) {
    throw new Error(`目标分支不在配置列表中：${branch}`);
  }
}
