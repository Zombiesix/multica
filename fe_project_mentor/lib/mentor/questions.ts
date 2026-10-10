import type { Endpoint } from "code-indexer/endpoint-types";
import type { ProjectMap } from "code-indexer/types";
import type { EntryKind } from "@/lib/knowledge/schema";

export type QuestionCategory =
  | "naming"
  | "dynamic"
  | "orphan-module"
  | "orphan-route"
  | "duplicate-endpoint";

export interface MentorQuestion {
  /** 稳定 id，同一发现重复派生不会变，便于幂等归档 */
  id: string;
  category: QuestionCategory;
  /** 关联对象（模块名 / 路由 / 端点），用于归档 */
  subject: string;
  /** 面向用户的问法 */
  prompt: string;
  /** 为什么要问这个 */
  context: string;
  evidence: string[];
  /** 答案该落成哪类知识 */
  targetKind: EntryKind;
}

interface EndpointOwner {
  domain: string;
  fn: string;
}

interface DuplicateRecord {
  method: string;
  url: string;
  owners: EndpointOwner[];
}

/** 同一端点被多个域重复封装时，按「域组合」聚合，避免 95 条重复端点刷出 95 个问题 */
function duplicateEndpointQuestions(map: ProjectMap): MentorQuestion[] {
  const byUrl = new Map<string, DuplicateRecord>();

  for (const d of map.apiDomains) {
    for (const e of d.endpoints) {
      const key = `${e.method.toUpperCase()} ${e.url}`;
      const rec = byUrl.get(key) ?? { method: e.method.toUpperCase(), url: e.url, owners: [] };
      rec.owners.push({ domain: d.name, fn: e.fn });
      byUrl.set(key, rec);
    }
  }

  const groups = new Map<string, { domains: string[]; records: DuplicateRecord[] }>();
  for (const rec of byUrl.values()) {
    if (rec.owners.length < 2) continue;
    const domains = [...new Set(rec.owners.map(o => o.domain))].sort();
    const key = domains.join("+");
    const g = groups.get(key) ?? { domains, records: [] };
    g.records.push(rec);
    groups.set(key, g);
  }

  return [...groups.entries()]
    .sort((a, b) => b[1].records.length - a[1].records.length)
    .map(([key, g]) => {
      const examples = g.records.slice(0, 3).map(r => {
        const owners = r.owners.map(o => `${o.domain}/${o.fn}`).join(", ");
        return `${r.method} ${r.url}  ←  ${owners}`;
      });
      return {
        id: `duplicate-endpoint:${key}`,
        category: "duplicate-endpoint" as const,
        subject: key,
        prompt:
          `有 ${g.records.length} 个后端端点被「${g.domains.join("」和「")}」重复封装了。` +
          `这些域是什么关系？写新代码时应该用哪一个？`,
        context:
          "同一个后端接口存在多份前端封装，新人无法判断该用哪个。这通常意味着有一份是代码生成产物。",
        evidence: examples,
        targetKind: "decision" as const,
      };
    });
}

export function deriveQuestions(map: ProjectMap): MentorQuestion[] {
  const out: MentorQuestion[] = [];

  for (const w of map.warnings) {
    if (w.kind === "naming-mismatch") {
      // 消息形如：页面模块 "X" 实际调用 API 域 "Y"，命名对不上...
      const m = w.message.match(/页面模块 "([^"]+)" 实际调用 API 域 "([^"]+)"/);
      if (!m) continue;
      const [, moduleName, domain] = m;
      out.push({
        id: `naming:${moduleName}:${domain}`,
        category: "naming",
        subject: moduleName,
        prompt: `模块「${moduleName}」实际调用的是 API 域「${domain}」。这两者是同一个业务概念吗？「${domain}」在业务上具体指什么？`,
        context: "模块名与 API 域名对不上，光读代码无法确定二者的业务关系。",
        evidence: w.evidence,
        targetKind: "glossary",
      });
      continue;
    }

    if (w.kind === "dynamic-children") {
      const m = w.message.match(/模块 "([^"]+)"/);
      if (!m) continue;
      const [, moduleName] = m;
      out.push({
        id: `dynamic:${moduleName}`,
        category: "dynamic",
        subject: moduleName,
        prompt: `模块「${moduleName}」用 <component :is> 动态渲染，子组件由数据决定。这些子组件分别在什么场景下显示、切换条件是什么？`,
        context: "静态分析看不到具体渲染哪个组件，这是新人最容易迷路的一类跳转。",
        evidence: w.evidence,
        targetKind: "flow",
      });
      continue;
    }

    if (w.kind === "orphan-module") {
      const m = w.message.match(/模块 "([^"]+)"/);
      if (!m) continue;
      const [, moduleName] = m;
      out.push({
        id: `orphan-module:${moduleName}`,
        category: "orphan-module",
        subject: moduleName,
        prompt: `模块「${moduleName}」没有路由入口。它是被别的页面内嵌的子页面，还是已经不再使用的代码？`,
        context: "没有路由入口的模块可能是子页面，也可能是死代码，需要人判断。",
        evidence: w.evidence,
        targetKind: "module",
      });
      continue;
    }

    if (w.kind === "orphan-route") {
      const m = w.message.match(/路由 "([^"]+)"/);
      if (!m) continue;
      const [, routePath] = m;
      out.push({
        id: `orphan-route:${routePath}`,
        category: "orphan-route",
        subject: routePath,
        prompt: `路由「${routePath}」指向 src/page 之外的组件。这个页面是什么场景下打开的？`,
        context: "路由指向了常规模块目录之外的文件，属于隐藏页面或外部入口。",
        evidence: w.evidence,
        targetKind: "flow",
      });
    }
  }

  out.push(...duplicateEndpointQuestions(map));

  return out.sort((a, b) => a.category.localeCompare(b.category) || a.subject.localeCompare(b.subject));
}

/** 端点列表 → 便于展示的一行 */
export function formatEndpoint(e: Endpoint): string {
  return `${e.method.toUpperCase()} ${e.url}`;
}
