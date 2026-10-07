import fs from "node:fs";
import path from "node:path";
import { collectApiUsage } from "./api-calls";
import { buildComponentTree, countTree } from "./deps";
import { toRepoRel, walk } from "./ignore";
/** 模块的渲染入口：优先路由指向的组件，其次 index.vue，再退到任意 SFC */
function pickEntry(route, moduleDirRel, sfcFiles) {
    if (route?.componentFile)
        return route.componentFile;
    const indexVue = `${moduleDirRel}/index.vue`;
    if (sfcFiles.includes(indexVue))
        return indexVue;
    return sfcFiles[0] ?? null;
}
/**
 * 业务模块 = pageDir 下的一级目录。这个仓把业务模块直接摊在 src/page/<模块>/，
 * 所以模块划分不用 LLM 聚类，读目录就有。
 */
export function buildModules(repoRoot, srcDirRel, pageDirRel, api, routes, graph) {
    if (!pageDirRel)
        return [];
    const pageAbs = path.join(repoRoot, pageDirRel);
    let entries = [];
    try {
        entries = fs.readdirSync(pageAbs, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const modules = [];
    for (const e of entries) {
        if (!e.isDirectory() || e.isSymbolicLink())
            continue;
        const dirAbs = path.join(pageAbs, e.name);
        const dirRel = toRepoRel(repoRoot, dirAbs);
        const files = walk(dirAbs).files;
        const components = files
            .filter(f => path.extname(f).toLowerCase() === ".vue")
            .map(f => toRepoRel(repoRoot, f))
            .sort();
        const route = routes.find(r => r.componentFile?.startsWith(`${dirRel}/`)) ?? null;
        const entry = pickEntry(route, dirRel, components);
        const tree = entry ? buildComponentTree(entry, graph) : null;
        modules.push({
            name: e.name,
            dir: dirRel,
            route,
            label: route?.label ?? null,
            components,
            tree,
            treeSize: tree ? countTree(tree) : 0,
            api: collectApiUsage(repoRoot, srcDirRel, api, files, dirRel),
        });
    }
    modules.sort((a, b) => a.name.localeCompare(b.name));
    return modules;
}
