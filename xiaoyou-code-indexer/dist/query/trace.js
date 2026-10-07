import { resolveModuleEndpoints } from "../endpoint-types";
function serializeTree(node, depth, budget) {
    if (budget.left <= 0)
        return { truncated: true };
    budget.left--;
    return {
        file: node.file,
        via: node.via ?? "root",
        ...(node.cyclic ? { cyclic: true } : {}),
        ...(node.duplicate ? { duplicate: true } : {}),
        ...(node.external.length > 0 ? { external: node.external.slice(0, 8) } : {}),
        children: depth >= 6 ? [] : node.children.map(c => serializeTree(c, depth + 1, budget)),
    };
}
export function traceFlow(map, target) {
    const t = target.trim();
    const route = map.routes.find(r => r.path === t || r.path === `/${t}`);
    const mod = route
        ? map.modules.find(m => route.componentFile?.startsWith(m.dir + "/"))
        : map.modules.find(m => m.name === t || m.name === t.replace(/^\/+|\/+$/g, ""));
    if (!route && !mod) {
        const routeHints = map.routes.slice(0, 8).map(r => r.path).join(", ");
        const moduleHints = map.modules.slice(0, 8).map(m => m.name).join(", ");
        return JSON.stringify({
            error: `not found: "${t}"`,
            hint: { someRoutes: routeHints, someModules: moduleHints },
        });
    }
    const usages = mod?.api ?? [];
    const byDomain = new Map(map.apiDomains.map(d => [d.name, d.endpoints]));
    const endpoints = mod ? resolveModuleEndpoints(usages, byDomain) : [];
    return JSON.stringify({
        target: t,
        route: route
            ? {
                path: route.path,
                label: route.label,
                name: route.name,
                permissionCode: route.permissionCode,
                componentFile: route.componentFile,
            }
            : null,
        module: mod
            ? {
                name: mod.name,
                label: mod.label,
                dir: mod.dir,
                components: mod.components.length,
                treeSize: mod.treeSize,
            }
            : null,
        componentTree: mod?.tree ? serializeTree(mod.tree, 0, { left: 50 }) : null,
        api: usages.map(u => ({ domain: u.domain, refs: u.refs.slice(0, 20), evidence: u.evidence.slice(0, 3) })),
        endpoints: endpoints.slice(0, 30).map(e => ({
            fn: e.fn,
            method: e.method.toUpperCase(),
            url: e.url,
            at: `${e.file}:${e.line}`,
        })),
        relatedWarnings: map.warnings
            .filter(w => (mod && w.message.includes(`"${mod.name}"`)) || (route && w.evidence.some(ev => ev.includes(route.path))))
            .slice(0, 10)
            .map(w => `[${w.kind}] ${w.message}`),
    }, null, 1);
}
