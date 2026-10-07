import path from "node:path";
import { extractRoutes } from "./adapters/vue3";
import { buildApiIndex } from "./api-calls";
import { loadAutoComponents } from "./auto-components";
import { buildComponentGraph } from "./deps";
import { detectStack, looksLikeRepo } from "./detect";
import { walk } from "./ignore";
import { buildModules } from "./modules";
function tokens(name) {
    return name
        .split(/[-_/]/)
        .filter(Boolean)
        .map(t => t.toLowerCase());
}
/** 名字层面是否相关：存在相同 token，或 token 互为前缀 */
function nameRelated(a, b) {
    const ta = tokens(a);
    const tb = tokens(b);
    return ta.some(x => tb.some(y => x === y || x.startsWith(y) || y.startsWith(x)));
}
export function scanRepo(repoPath) {
    const started = Date.now();
    const repoRoot = path.resolve(repoPath);
    const stack = detectStack(repoRoot);
    const { files, symlinksSkipped, filesIgnored } = walk(repoRoot);
    const warnings = [];
    let routes = [];
    if (stack.kind === "vue3" && stack.routerFile) {
        const extracted = extractRoutes(path.join(repoRoot, stack.routerFile), repoRoot, stack.srcDir);
        routes = extracted.routes;
        for (const spec of extracted.unresolved) {
            warnings.push({
                kind: "unresolved-component",
                message: `无法解析的组件引用：${spec}`,
                evidence: [stack.routerFile],
            });
        }
    }
    else if (stack.kind !== "vue3") {
        warnings.push({
            kind: "unsupported-stack",
            message: `M1 只支持 Vue 3 仓，本仓检测为 ${stack.kind}`,
            evidence: [stack.vueVersion ? `vue@${stack.vueVersion}` : "未找到 vue 依赖"],
        });
    }
    else {
        warnings.push({
            kind: "unresolved-component",
            message: "未找到集中式路由表文件",
            evidence: [],
        });
    }
    const api = buildApiIndex(repoRoot, stack.serviceDir, stack.srcDir);
    // 组件图建在全仓 SFC 上：模块内的组件也可能引用模块外的共享组件，
    // 只扫模块目录会断链。
    const sfcFiles = files.filter(f => path.extname(f).toLowerCase() === ".vue");
    const auto = loadAutoComponents(repoRoot, sfcFiles, files);
    const components = buildComponentGraph(repoRoot, stack.srcDir, sfcFiles, auto);
    const modules = buildModules(repoRoot, stack.srcDir, stack.pageDir, api, routes, components);
    // 共享域：被 >= 3 个模块引用的基础域（common / auth-server 之类）。
    // 它们本来就不该跟某个业务模块同名，报出来只是噪音。
    const domainUsedBy = new Map();
    for (const m of modules) {
        for (const u of m.api) {
            domainUsedBy.set(u.domain, [...(domainUsedBy.get(u.domain) ?? []), m.name]);
        }
    }
    const SHARED_DOMAIN_THRESHOLD = 3;
    for (const d of api.domains) {
        d.usedByModules = domainUsedBy.get(d.name) ?? [];
    }
    // 命名不一致：链接关系由 import 推导，所以"确有调用但名字对不上"是真信号。
    // 比对时同时看模块名和引用方的子路径——system-config/water-content-reference
    // 用 water-content 域其实对得上，只看模块名会误报。
    for (const m of modules) {
        for (const usage of m.api) {
            if ((domainUsedBy.get(usage.domain)?.length ?? 0) >= SHARED_DOMAIN_THRESHOLD)
                continue;
            const byModuleName = nameRelated(m.name, usage.domain);
            const bySubPath = usage.subPaths.some(sp => nameRelated(sp, usage.domain));
            if (byModuleName || bySubPath)
                continue;
            warnings.push({
                kind: "naming-mismatch",
                message: `页面模块 "${m.name}" 实际调用 API 域 "${usage.domain}"，命名对不上，需人工确认业务含义`,
                evidence: usage.evidence,
            });
        }
    }
    // 孤儿 API 域：没有任何页面模块引用它
    const usedDomains = new Set(modules.flatMap(m => m.api.map(u => u.domain)));
    for (const d of api.domains) {
        if (!usedDomains.has(d.name)) {
            warnings.push({
                kind: "orphan-api-domain",
                message: `API 域 "${d.name}" 未被任何页面模块引用`,
                evidence: [d.dir],
            });
        }
    }
    // 无模块归属的路由：指向 src/page 之外（如 src/view/out-page/）
    for (const r of routes) {
        if (!r.componentFile)
            continue;
        const owned = modules.some(m => r.componentFile.startsWith(`${m.dir}/`));
        if (!owned) {
            warnings.push({
                kind: "orphan-route",
                message: `路由 "${r.path}"（${r.label ?? "无 label"}）指向 src/page 之外的模块`,
                evidence: [r.componentFile],
            });
        }
    }
    // 无路由入口的模块：可能是子页面、被父级内嵌，也可能是死代码——都值得问人
    for (const m of modules) {
        if (!m.route) {
            warnings.push({
                kind: "orphan-module",
                message: `业务模块 "${m.name}" 没有路由入口，可能是子页面或未挂载代码`,
                evidence: [m.dir],
            });
        }
    }
    // 动态渲染：子组件由数据决定，静态分析看不全，是最容易让新人迷路的一类跳转
    const dynamicSet = new Set(components.dynamicComponents);
    for (const m of modules) {
        const hits = m.components.filter(f => dynamicSet.has(f));
        if (hits.length > 0) {
            warnings.push({
                kind: "dynamic-children",
                message: `模块 "${m.name}" 用 <component :is> 动态渲染，子组件由数据决定，静态分析看不全`,
                evidence: hits.slice(0, 3),
            });
        }
    }
    return {
        repo: { path: repoRoot, name: path.basename(repoRoot) },
        stack,
        routes,
        modules,
        apiDomains: api.domains,
        components,
        warnings,
        stats: {
            filesScanned: files.length,
            filesIgnored,
            symlinksSkipped,
            durationMs: Date.now() - started,
        },
    };
}
export { looksLikeRepo };
export { getScan, clearScanCache } from "./cache";
