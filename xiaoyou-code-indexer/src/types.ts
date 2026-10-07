import type { Endpoint } from "./endpoint-types";

export type StackKind = "vue3" | "vue2" | "unknown";

export interface RepoStack {
  kind: StackKind;
  vueVersion: string | null;
  builder: "vite" | "vue-cli" | "unknown";
  /** 由入口文件里的 renderWithQiankun / __POWERED_BY_QIANKUN__ 判定，而非只看依赖 */
  isQiankunChild: boolean;
  qiankunDeps: string[];
  entryFile: string | null;
  srcDir: string | null;
  routerFile: string | null;
  pageDir: string | null;
  serviceDir: string | null;
}

export interface RouteInfo {
  path: string;
  name: string | null;
  /** meta.label —— 中文业务名，本仓多数路由自带 */
  label: string | null;
  componentFile: string | null;
  redirect: string | null;
  isSiderMenu: boolean | null;
  permissionCode: string | null;
  /** meta 里未识别的字段，留给后续挖掘 */
  extraMeta: Record<string, string>;
}

export interface ApiDomainInfo {
  name: string;
  dir: string;
  files: string[];
  functions: string[];
  /** 该域函数实际打的后端端点（函数 → 方法 + URL） */
  endpoints: Endpoint[];
  /** 有导出但没找到共享客户端调用，多半走了二次封装 */
  nonEndpointFns: string[];
  /** 引用该域的模块名，由 index.ts 回填；数量 >= 3 视为共享基础域 */
  usedByModules: string[];
}

export interface ApiUsage {
  domain: string;
  /** 形如 "catheter/getList" */
  refs: string[];
  /** 引用方在所属模块内的相对子路径，用于判断"子目录名其实对得上域名" */
  subPaths: string[];
  evidence: string[];
}

export interface ModuleInfo {
  name: string;
  dir: string;
  route: RouteInfo | null;
  label: string | null;
  /** 模块目录下的全部 SFC（扁平清单） */
  components: string[];
  /** 从入口组件展开的渲染树；无入口时为 null */
  tree: ComponentNode | null;
  /** 树里去重后的组件数 */
  treeSize: number;
  api: ApiUsage[];
}

/**
 * 组件引用的来路：
 * - import：显式 import 且模板里当标签用
 * - auto：unplugin-vue-components 自动导入，源码里没有 import 语句
 * - async：defineAsyncComponent(() => import(...))
 * - indirect：显式 import 但只作为值传递（塞进数据、传给 props），
 *   由 <component :is> 之类间接渲染。模板里搜不到标签名，最容易让新人迷路。
 */
export type EdgeVia = "import" | "auto" | "async" | "indirect";

export interface ComponentEdge {
  file: string;
  via: EdgeVia;
}

export interface ComponentNode {
  /** repo 相对路径 */
  file: string;
  name: string;
  /** 从父级到本节点的引用方式；根节点没有 */
  via?: EdgeVia;
  children: ComponentNode[];
  /** 模板里出现但解析不到本仓文件的标签（全局/第三方组件） */
  external: string[];
  /** 同一组件已在树中别处展开过，此处不再重复展开 */
  duplicate?: boolean;
  /** 环形引用，停止下探 */
  cyclic?: boolean;
}

export interface ComponentGraph {
  /** 每个 SFC → 它直接引用的子组件 */
  edges: Record<string, ComponentEdge[]>;
  /** 每个 SFC → 模板里未解析的标签 */
  externalTags: Record<string, string[]>;
  /** 反向索引：谁引用了这个组件 */
  importedBy: Record<string, string[]>;
  /** 用了 <component :is> 的 SFC：具体渲染谁由数据决定，静态分析看不全 */
  dynamicComponents: string[];
  /** 自动导入清单的来源（dts 优先） */
  autoImportSource: "dts" | "basename" | "none";
  stats: { sfcCount: number; edgeCount: number; externalTagCount: number };
}

export type WarningKind =
  | "naming-mismatch"
  | "orphan-api-domain"
  | "orphan-route"
  | "orphan-module"
  | "dynamic-children"
  | "unresolved-component"
  | "unsupported-stack";

export interface Warning {
  kind: WarningKind;
  message: string;
  evidence: string[];
}

export interface ScanStats {
  filesScanned: number;
  filesIgnored: number;
  symlinksSkipped: string[];
  durationMs: number;
}

export interface ProjectMap {
  repo: { path: string; name: string };
  stack: RepoStack;
  routes: RouteInfo[];
  modules: ModuleInfo[];
  apiDomains: ApiDomainInfo[];
  components: ComponentGraph;
  warnings: Warning[];
  stats: ScanStats;
}
