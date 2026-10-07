import { type ScriptSource } from "./ast";
import type { Endpoint } from "./endpoint-types";
export interface EndpointExtraction {
    endpoints: Endpoint[];
    /**
     * 有导出但不打后端的函数。实测多数是纯工具函数（如日期计算），
     * 不是提取失败；少数可能走了二次封装，值得人工看一眼。
     */
    nonEndpointFns: string[];
}
export declare function extractEndpoints(script: ScriptSource, absFile: string, repoRoot: string, srcDirRel: string | null, clientFiles: Set<string>): EndpointExtraction;
