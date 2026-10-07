export const cap = (s, n) => s.length > n ? s.slice(0, n) + "…" : s;
function stackQiankun(map) {
    return map.stack.isQiankunChild;
}
function moduleNameForRoute(map, routePath) {
    const r = map.routes.find(x => x.path === routePath);
    if (!r?.componentFile)
        return null;
    const m = map.modules.find(x => r.componentFile.startsWith(x.dir + "/"));
    return m?.name ?? null;
}
export function projectOverview(map) {
    return JSON.stringify({
        repo: map.repo.name,
        stack: { kind: map.stack.kind, builder: map.stack.builder, qiankunChild: stackQiankun(map) },
        routes: map.routes.map(r => ({
            path: r.path,
            label: r.label,
            module: moduleNameForRoute(map, r.path),
        })),
        modules: map.modules.map(m => ({ name: m.name, label: m.label, hasRoute: !!m.route })),
        apiDomains: map.apiDomains.map(d => ({
            name: d.name,
            usedBy: d.usedByModules,
            endpoints: d.endpoints.length,
        })),
        warnings: map.warnings.slice(0, 20).map(w => `[${w.kind}] ${cap(w.message, 120)}`),
        warningTotal: map.warnings.length,
    }, null, 1);
}
