import fs from "node:fs";
import path from "node:path";
import { collectExports, createSource, forEachImport, readScript, resolveSpecifier, } from "./ast";
import { extractEndpoints } from "./endpoints";
import { dirExists, toRepoRel, walk } from "./ignore";
const CODE_EXT = new Set([".ts", ".js", ".tsx", ".jsx", ".vue"]);
function isCode(f) {
    return CODE_EXT.has(path.extname(f).toLowerCase());
}
export function buildApiIndex(repoRoot, serviceDirRel, srcDirRel) {
    if (!serviceDirRel)
        return { root: null, sharedFiles: [], domains: [] };
    const serviceAbs = path.join(repoRoot, serviceDirRel);
    const apiSubAbs = path.join(serviceAbs, "api");
    const rootAbs = dirExists(apiSubAbs) ? apiSubAbs : serviceAbs;
    const rootRel = toRepoRel(repoRoot, rootAbs);
    // 共享层 = 服务层根下的直接文件（如 $http.ts） + api 根下的直接文件。
    // $http.ts 在 api/ 的上一层，是链路追踪的关键节点，不能漏。
    const sharedFiles = [...new Set([...walk(serviceAbs).files, ...walk(rootAbs).files]
            .filter(isCode)
            .map(f => toRepoRel(repoRoot, f))
            .filter(rel => !rel.slice(serviceDirRel.length + 1).includes("/")))].sort();
    let entries = [];
    try {
        entries = fs.readdirSync(rootAbs, { withFileTypes: true });
    }
    catch {
        entries = [];
    }
    const clientFiles = new Set(sharedFiles);
    const domains = [];
    for (const e of entries) {
        if (!e.isDirectory() || e.isSymbolicLink())
            continue;
        const dirAbs = path.join(rootAbs, e.name);
        const files = walk(dirAbs)
            .files.filter(isCode)
            .map(f => toRepoRel(repoRoot, f))
            .sort();
        const funcs = new Set();
        const endpoints = [];
        const unresolved = new Set();
        for (const rel of files) {
            const abs = path.join(repoRoot, rel);
            const script = readScript(abs);
            if (!script)
                continue;
            for (const n of collectExports(createSource(script.code, rel)))
                funcs.add(n);
            const extracted = extractEndpoints(script, abs, repoRoot, srcDirRel, clientFiles);
            endpoints.push(...extracted.endpoints);
            for (const n of extracted.nonEndpointFns)
                unresolved.add(n);
        }
        domains.push({
            name: e.name,
            dir: toRepoRel(repoRoot, dirAbs),
            files,
            functions: [...funcs].sort(),
            endpoints: endpoints.sort((a, b) => a.fn.localeCompare(b.fn) || a.url.localeCompare(b.url)),
            nonEndpointFns: [...unresolved].sort(),
            usedByModules: [],
        });
    }
    domains.sort((a, b) => a.name.localeCompare(b.name));
    return { root: rootRel, sharedFiles, domains };
}
function domainOf(resolvedRel, apiRootRel) {
    if (!resolvedRel.startsWith(`${apiRootRel}/`))
        return null;
    const rest = resolvedRel.slice(apiRootRel.length + 1);
    return rest.split("/")[0] || null;
}
/** 从一组文件里找出它们引用了哪些 API 域，链接关系完全由 import 推导，不靠猜名字 */
export function collectApiUsage(repoRoot, srcDirRel, api, filesAbs, moduleDirRel = null) {
    if (!api.root)
        return [];
    const known = new Set(api.domains.map(d => d.name));
    // 每个域真正导出的函数名。用它把混合 import 里的类型/常量剔掉——
    // 纯语法分析分不出 `import { SomeDTO, someFn }` 哪个是类型。
    const domainFns = new Map(api.domains.map(d => [d.name, new Set(d.functions)]));
    const byDomain = new Map();
    for (const abs of filesAbs) {
        if (!isCode(abs))
            continue;
        const script = readScript(abs);
        if (!script)
            continue;
        const sf = createSource(script.code, abs);
        const rel = toRepoRel(repoRoot, abs);
        const subPath = moduleDirRel && rel.startsWith(`${moduleDirRel}/`)
            ? rel.slice(moduleDirRel.length + 1)
            : rel;
        forEachImport(sf, (spec, names, line) => {
            const resolved = resolveSpecifier(spec, abs, repoRoot, srcDirRel);
            if (!resolved)
                return;
            const domain = domainOf(resolved, api.root);
            if (!domain || !known.has(domain))
                return;
            const entry = byDomain.get(domain) ?? {
                refs: new Set(),
                subPaths: new Set(),
                evidence: new Set(),
                onlyTypes: true,
            };
            for (const n of names) {
                if (n.startsWith("* as ")) {
                    entry.refs.add(`${domain}/*`);
                    entry.onlyTypes = false;
                    continue;
                }
                if (!domainFns.get(domain)?.has(n))
                    continue; // 类型/常量，不是 api 函数
                entry.refs.add(`${domain}/${n}`);
                entry.onlyTypes = false;
            }
            entry.subPaths.add(subPath);
            entry.evidence.add(`${rel}:${line + script.lineOffset}`);
            byDomain.set(domain, entry);
        });
    }
    // 只引了类型、没调任何函数的域不算"使用该域"，否则会污染共享域统计和命名告警
    return [...byDomain.entries()]
        .filter(([, v]) => !v.onlyTypes)
        .map(([domain, v]) => ({
        domain,
        refs: [...v.refs].sort(),
        subPaths: [...v.subPaths].sort(),
        evidence: [...v.evidence].sort(),
    }))
        .sort((a, b) => a.domain.localeCompare(b.domain));
}
