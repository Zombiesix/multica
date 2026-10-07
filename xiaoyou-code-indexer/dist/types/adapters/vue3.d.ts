import type { RouteInfo } from "../types";
/**
 * 从集中式路由表里提取路由。
 * 覆盖形态：`export const routes: X[] = [{ path, name, component: () => import("@/..."), meta }]`
 */
export declare function extractRoutes(routerFileAbs: string, repoRoot: string, srcDirRel: string | null): {
    routes: RouteInfo[];
    unresolved: string[];
};
