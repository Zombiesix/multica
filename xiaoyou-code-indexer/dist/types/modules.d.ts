import { type ApiIndex } from "./api-calls";
import type { ComponentGraph, ModuleInfo, RouteInfo } from "./types";
/**
 * 业务模块 = pageDir 下的一级目录。这个仓把业务模块直接摊在 src/page/<模块>/，
 * 所以模块划分不用 LLM 聚类，读目录就有。
 */
export declare function buildModules(repoRoot: string, srcDirRel: string | null, pageDirRel: string | null, api: ApiIndex, routes: RouteInfo[], graph: ComponentGraph): ModuleInfo[];
