import path from "node:path";
import * as ts from "typescript";
import { parse as parseTemplate } from "@vue/compiler-dom";
import { createSource, readSfcParts, resolveSpecifier, stringValue, } from "./ast";
import { fileExists, toRepoRel } from "./ignore";
/** Vue 内置 + HTML + SVG 原生标签。这些不是本仓组件，不进组件树。 */
const NATIVE_TAGS = new Set([
    // Vue 内置
    "component", "transition", "transition-group", "keep-alive", "teleport", "suspense", "slot",
    // HTML
    "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi", "bdo",
    "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code", "col", "colgroup",
    "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed",
    "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
    "head", "header", "hgroup", "hr", "html", "i", "iframe", "img", "input", "ins", "kbd", "label",
    "legend", "li", "link", "main", "map", "mark", "menu", "meta", "meter", "nav", "noscript",
    "object", "ol", "optgroup", "option", "output", "p", "param", "picture", "pre", "progress",
    "q", "rp", "rt", "ruby", "s", "samp", "script", "section", "select", "small", "source", "span",
    "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea",
    "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul", "var", "video", "wbr",
    // SVG
    "svg", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g", "defs", "use",
    "symbol", "marker", "mask", "pattern", "clippath", "lineargradient", "radialgradient", "stop",
    "filter", "feblend", "fecolormatrix", "fegaussianblur", "femerge", "feoffset", "text", "tspan",
    "textpath", "foreignobject", "image", "switch", "view",
]);
const ELEMENT_NODE = 1;
/** kebab-case 标签转 PascalCase，用来对上 import 名或自动导入名 */
function pascalize(tag) {
    return tag
        .split(/[-_]/)
        .filter(Boolean)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join("");
}
/** 展示名：index.vue 用父目录名，否则用文件名 */
function componentName(file) {
    const base = path.basename(file).replace(/\.vue$/i, "");
    if (base.toLowerCase() !== "index")
        return base;
    return path.basename(path.dirname(file)) || base;
}
/** 解析模板 AST 收集所有元素标签（含 v-if 各分支） */
function collectTemplateTags(templateCode) {
    const tags = new Set();
    let root;
    try {
        root = parseTemplate(templateCode);
    }
    catch {
        return [];
    }
    const visit = (node) => {
        if (!node || typeof node !== "object")
            return;
        if (node.type === ELEMENT_NODE && typeof node.tag === "string") {
            tags.add(node.tag);
        }
        if (Array.isArray(node.children))
            for (const c of node.children)
                visit(c);
        // v-if / v-else-if / v-else 各自成支
        if (Array.isArray(node.branches))
            for (const b of node.branches)
                visit(b);
    };
    visit(root);
    return [...tags];
}
/** 补全扩展名并确认文件存在；指向 .ts 的一律不算组件 */
function resolveComponentFile(rel, repoRoot) {
    const candidates = rel.toLowerCase().endsWith(".vue")
        ? [rel]
        : [`${rel}.vue`, `${rel}/index.vue`];
    for (const c of candidates) {
        if (fileExists(path.join(repoRoot, c)))
            return c;
    }
    return null;
}
function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** 显式 import 名 → 本仓 .vue 文件 */
function staticImports(script, absFile, repoRoot, srcDirRel) {
    const map = new Map();
    if (!script)
        return map;
    const code = script.code;
    const sf = createSource(code, absFile);
    // 名字在 import 之外还出现 => 被当值用了。用词边界匹配，避免子串误判。
    const isReferenced = (name) => {
        const hits = code.match(new RegExp(`\\b${escapeRe(name)}\\b`, "g"));
        return (hits?.length ?? 0) > 1;
    };
    for (const stmt of sf.statements) {
        if (!ts.isImportDeclaration(stmt))
            continue;
        const spec = stringValue(stmt.moduleSpecifier);
        if (!spec)
            continue;
        const resolved = resolveSpecifier(spec, absFile, repoRoot, srcDirRel);
        if (!resolved)
            continue;
        const target = resolveComponentFile(resolved, repoRoot);
        if (!target)
            continue;
        const clause = stmt.importClause;
        if (!clause)
            continue;
        if (clause.name) {
            map.set(clause.name.text, { target, referenced: isReferenced(clause.name.text) });
        }
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
            for (const el of bindings.elements) {
                map.set(el.name.text, { target, referenced: isReferenced(el.name.text) });
            }
        }
    }
    return map;
}
/**
 * 脚本里所有对 .vue 的动态 import。
 * 覆盖 `defineAsyncComponent(() => import("..."))` 和裸 `() => import("...")`——
 * 这类引用常常挂在数据上由 <component :is> 渲染，模板里根本看不到。
 */
function asyncVueImports(script, absFile, repoRoot, srcDirRel) {
    if (!script)
        return [];
    const sf = createSource(script.code, absFile);
    const targets = new Set();
    const visit = (node) => {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const spec = stringValue(node.arguments[0]);
            if (spec) {
                const resolved = resolveSpecifier(spec, absFile, repoRoot, srcDirRel);
                const target = resolved ? resolveComponentFile(resolved, repoRoot) : null;
                if (target)
                    targets.add(target);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return [...targets];
}
/** 模板里是否有 <component :is> —— 具体渲染谁由数据决定 */
function hasDynamicComponent(templateCode) {
    return /<component[\s>]/i.test(templateCode) && /:is\s*=/.test(templateCode);
}
export function buildComponentGraph(repoRoot, srcDirRel, sfcFilesAbs, auto) {
    const edges = {};
    const externalTags = {};
    const importedBy = {};
    const dynamicComponents = [];
    let edgeCount = 0;
    let externalTagCount = 0;
    for (const abs of sfcFilesAbs) {
        const rel = toRepoRel(repoRoot, abs);
        const parts = readSfcParts(abs);
        if (!parts.template) {
            edges[rel] = [];
            continue;
        }
        const imports = staticImports(parts.script, abs, repoRoot, srcDirRel);
        const edgeMap = new Map();
        const external = new Set();
        for (const tag of collectTemplateTags(parts.template)) {
            if (NATIVE_TAGS.has(tag.toLowerCase()))
                continue;
            const imported = imports.get(tag) ?? imports.get(pascalize(tag));
            if (imported) {
                edgeMap.set(imported.target, "import");
                continue;
            }
            // 源码里没有 import 语句的，走自动导入清单
            const autoResolved = auto.byName.get(tag) ?? auto.byName.get(pascalize(tag));
            if (autoResolved) {
                edgeMap.set(autoResolved, "auto");
                continue;
            }
            external.add(tag);
        }
        // 动态 import 的组件即使模板看不到也要算进来
        for (const target of asyncVueImports(parts.script, abs, repoRoot, srcDirRel)) {
            if (!edgeMap.has(target))
                edgeMap.set(target, "async");
        }
        // 静态 import 但没当标签用：多半被塞进数据由 <component :is> 渲染。
        // 漏掉这类等于漏掉整个 tab 内容页，所以宁可多算。
        for (const info of imports.values()) {
            if (edgeMap.has(info.target) || !info.referenced)
                continue;
            edgeMap.set(info.target, "indirect");
        }
        if (hasDynamicComponent(parts.template))
            dynamicComponents.push(rel);
        const list = [...edgeMap.entries()]
            .map(([file, via]) => ({ file, via }))
            .sort((a, b) => a.file.localeCompare(b.file));
        edges[rel] = list;
        edgeCount += list.length;
        if (external.size > 0) {
            externalTags[rel] = [...external].sort();
            externalTagCount += external.size;
        }
        for (const e of list) {
            importedBy[e.file] = [...(importedBy[e.file] ?? []), rel];
        }
    }
    for (const key of Object.keys(importedBy))
        importedBy[key].sort();
    return {
        edges,
        externalTags,
        importedBy,
        dynamicComponents: dynamicComponents.sort(),
        autoImportSource: auto.source,
        stats: { sfcCount: sfcFilesAbs.length, edgeCount, externalTagCount },
    };
}
/**
 * 从入口组件展开引用树。
 * 同一组件在树里出现多次时只在首次展开，其余标 duplicate，避免共享组件导致指数膨胀；
 * 环形引用标 cyclic 并停止下探。
 */
export function buildComponentTree(rootFile, graph) {
    const expanded = new Set([rootFile]);
    const build = (file, pathSet, via) => {
        const node = {
            file,
            name: componentName(file),
            via,
            children: [],
            external: graph.externalTags[file] ?? [],
        };
        if (pathSet.has(file)) {
            node.cyclic = true;
            return node;
        }
        const nextPath = new Set(pathSet).add(file);
        for (const edge of graph.edges[file] ?? []) {
            if (expanded.has(edge.file)) {
                node.children.push({
                    file: edge.file,
                    name: componentName(edge.file),
                    via: edge.via,
                    children: [],
                    external: [],
                    duplicate: true,
                });
                continue;
            }
            expanded.add(edge.file);
            node.children.push(build(edge.file, nextPath, edge.via));
        }
        return node;
    };
    return build(rootFile, new Set());
}
/** 树里去重后的组件数 */
export function countTree(node) {
    const seen = new Set();
    const visit = (n) => {
        if (seen.has(n.file))
            return;
        seen.add(n.file);
        for (const c of n.children)
            visit(c);
    };
    visit(node);
    return seen.size;
}
