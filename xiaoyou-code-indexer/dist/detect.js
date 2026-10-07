import fs from "node:fs";
import path from "node:path";
import { dirExists, fileExists, firstExistingDir, firstExistingFile, toRepoRel, } from "./ignore";
function readJson(abs) {
    try {
        return JSON.parse(fs.readFileSync(abs, "utf8"));
    }
    catch {
        return null;
    }
}
function majorOf(range) {
    const m = String(range).match(/(\d+)\./);
    return m ? Number(m[1]) : null;
}
const QIANKUN_ENTRY_MARKERS = [
    "__POWERED_BY_QIANKUN__",
    "renderWithQiankun",
    "vite-plugin-qiankun",
];
export function detectStack(repoRoot) {
    const pkg = readJson(path.join(repoRoot, "package.json"));
    const deps = {
        ...(pkg?.dependencies ?? {}),
        ...(pkg?.devDependencies ?? {}),
    };
    const vueVersion = deps.vue ?? null;
    const vueMajor = vueVersion ? majorOf(vueVersion) : null;
    let kind = "unknown";
    if (vueMajor !== null)
        kind = vueMajor >= 3 ? "vue3" : "vue2";
    let builder = "unknown";
    if (deps.vite)
        builder = "vite";
    else if (deps["@vue/cli-service"])
        builder = "vue-cli";
    const srcDir = firstExistingDir(repoRoot, ["src", "app", "source"]);
    const srcAbs = srcDir ?? repoRoot;
    const entryFile = firstExistingFile(srcAbs, [
        "main.ts",
        "main.js",
        "main.tsx",
        "main.jsx",
        "index.ts",
        "index.js",
    ]);
    // 子应用判定要看运行时标记，光有 qiankun 依赖可能是主应用
    let isQiankunChild = false;
    if (entryFile) {
        try {
            const code = fs.readFileSync(entryFile, "utf8");
            isQiankunChild = QIANKUN_ENTRY_MARKERS.some(m => code.includes(m));
        }
        catch {
            /* 读不到就当没标记 */
        }
    }
    const routerFile = firstExistingFile(srcAbs, [
        "router/index.ts",
        "router/index.js",
        "router.ts",
        "router.js",
    ]);
    const routerDir = firstExistingDir(srcAbs, ["router", "routers"]);
    const resolvedRouterFile = routerFile ?? (routerDir ? firstExistingFile(routerDir, ["index.ts", "index.js"]) : null);
    const pageDir = firstExistingDir(srcAbs, ["page", "pages", "view", "views"]);
    const serviceDir = firstExistingDir(srcAbs, ["service", "services", "api"]);
    return {
        kind,
        vueVersion,
        builder,
        isQiankunChild,
        qiankunDeps: Object.keys(deps).filter(d => d.includes("qiankun")),
        entryFile: entryFile ? toRepoRel(repoRoot, entryFile) : null,
        srcDir: srcDir ? toRepoRel(repoRoot, srcDir) : null,
        routerFile: resolvedRouterFile ? toRepoRel(repoRoot, resolvedRouterFile) : null,
        pageDir: pageDir ? toRepoRel(repoRoot, pageDir) : null,
        serviceDir: serviceDir ? toRepoRel(repoRoot, serviceDir) : null,
    };
}
export function looksLikeRepo(repoRoot) {
    return fileExists(path.join(repoRoot, "package.json")) && dirExists(repoRoot);
}
