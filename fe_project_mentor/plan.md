# 小游 · 前端项目导师 Agent — 设计与实施计划

## 0. 一句话定位

小游不是"会读代码的助手"，而是一个**能带人把一个陌生前端项目真正读懂、并让理解沉淀成团队资产**的导师。

## 1. 核心设计原则

这三条是全部设计的依据，任何功能取舍都回到这里判断。

### 1.1 业务知识不在代码里

代码只说明"做了什么"，不说明"为什么"。为什么这个校验放前端？为什么字段叫 `bizType` 实际是订单来源？
结论：**读代码拿事实，靠对话拿意图，然后必须有地方存。**
因此"通过代码了解业务"不能实现为"让 Agent 多读代码"，必须实现为"结构化提问 + 知识沉淀"。

### 1.2 产物是记忆，对话是手段

对话无状态。每聊清一个模块就落一份产物，下次从产物开始，而不是从零重读代码。
因此产品形态是**产物驱动**的，不是聊天窗驱动的。聊天窗只是采集和讲解的界面。

### 1.3 导师 ≠ 会说话的 README

导师的核心动作不是"我讲"，而是**让用户讲、我来纠正**。
闭环：Agent 讲 → 用户复述/补全 → Agent 指出偏差 → 修正理解 → 落成产物。
没有"用户复述"这一步，产品退化成文档生成器，教不会人。

## 2. 架构

```
┌─────────────────────────────────────────────────────┐
│ 产出层   流程图 / 架构图 / 模块讲解稿 / 术语表        │
│          (docs/*.md + archify 生成的 HTML/SVG)       │
└───────────────────────▲─────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────┐
│ 对话层   小游                                         │
│          导师人格 · 提问策略 · 分层讲解 · 复述检验      │
│          运行时: Claude Agent SDK                     │
└──────────▲────────────────────────────▲─────────────┘
           │ 取事实                      │ 取业务
┌──────────┴──────────────┐  ┌──────────┴─────────────┐
│ 代码层 code-indexer     │  │ 知识层 knowledge-store │
│ 路由表 / 组件树 /       │  │ docs/ 下 markdown      │
│ API 调用点 / 依赖图     │  │ 提议-确认 两态          │
│ 静态分析, 不走 LLM      │  │ 检索 + 写入            │
└─────────────────────────┘  └────────────────────────┘
```

**主循环**：用户提问 → 代码层取事实 → 知识层取业务 → 分层讲解 → 用户复述/补充 → 写回知识层（提议态）→ 出图 → PR 确认。

## 3. MVP 闭环（首场景：新人 onboard）

输入一个本地仓库路径，六步走完即产品可用。

| 步  | 动作                                                                                          | 产出         | 关键约束                                   |
| --- | --------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------ |
| 1   | **扫描**：路由表 → 页面清单 → 模块聚类                                                        | 项目地图初稿 | 纯静态分析，不调 LLM                       |
| 2   | **选路径**：让用户挑一条真实业务路径（如"给病人开一条医嘱"）                                  | 选定链路     | **禁止按目录树讲**，必须从用户真实问题切入 |
| 3   | **追链路**：入口→路由→页面→组件→API                                                           | 数据流图     | 用 archify 出图，每条边都有代码出处        |
| 4   | **讲解**：业务价值 / 数据流 / 实现细节 / 边界与坑 四层                                        | 讲解稿       | 先问后讲：先确认用户已知什么               |
| 5   | **探讨检验**：让用户说自己的理解，Agent 一起对照代码验证（10.6 起替代「复述检验」，去考试化） | 掌握度评估   | 产品灵魂，不可跳过                         |
| 6   | **落产物**：写 `docs/` + 出图                                                                 | PR           | 绝不自动 push                              |

第 3、5、6 步是核心资产。第 1、2 步是入口体验。第 4 步最容易做，也最不构成壁垒。

## 4. 模块设计

```
fe_project_mentor/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # 仓库接入
│   ├── onboard/[repo]/           # 六步向导
│   └── api/
│       ├── index/route.ts        # 触发扫描
│       ├── chat/route.ts         # 流式对话 (SSE)
│       └── confirm/route.ts      # 知识确认 → 开 PR
├── lib/
│   ├── code-indexer/             # 代码层
│   │   ├── detect.ts             # 探测栈 / 构建器 / 微前端
│   │   ├── adapters/vue3.ts      # Vue 3 适配器（M1）
│   │   ├── routes.ts             # 路由提取
│   │   ├── components.ts         # 组件树
│   │   ├── api-calls.ts          # API 调用点
│   │   └── deps.ts               # 依赖图
│   ├── knowledge-store/          # 知识层
│   │   ├── schema.ts             # frontmatter 定义与校验
│   │   ├── read.ts
│   │   └── propose.ts            # 只写 proposed 态
│   ├── mentor/                   # 对话层
│   │   ├── agent.ts              # Agent SDK 装配
│   │   ├── persona.md            # 导师人格与提问策略
│   │   └── tools.ts              # 暴露给 Agent 的工具
│   ├── diagram/                  # 出图，封装 archify
│   └── git/                      # 工作副本 + PR 生成
└── docs-template/                # 注入目标仓的 docs 骨架
```

### 4.1 code-indexer

**M1 目标仓：`iho-icis-ui`（iHO 重症监护临床系统）** —— 已核实：

| 项       | 事实                                                          |
| -------- | ------------------------------------------------------------- |
| 栈       | Vue 3.3 + Vite 4 + TS + Pinia + vue-router 4                  |
| UI       | naive-ui + `cnhis-design-vue`（自研库）                       |
| 微前端   | **qiankun 子应用**，容器 `#icisMicroApp`，主应用不在本仓      |
| 路由     | `src/router/index.ts` 单文件集中式表，11 条                   |
| 业务模块 | `src/page/<模块>/`，13 个                                     |
| API 层   | `src/service/$http.ts` + `src/service/api/<域>/`，17 个域     |
| 其他     | unocss、vitest、`scripts/generate-api.js`（API 类型是生成的） |

**这个仓对 M1 格外友好**：路由表集中，且**每条路由的 `meta.label` 直接写着中文业务名**
（`/bed-overview` → "床位总览"）。所以"项目地图"的骨架几乎可以白捡，不用猜。

**关键发现：命名不一致是业务知识的真实缺口。**
API 域 `catheter` ↔ 页面 `conduit-manage` ↔ 业务名"导管管理"，三者字面完全不同；
`water-content` ↔ "血气控制台" 同理。**这种映射无法从代码推出，只能问人。**
这正是 1.1 那条原则的活证据，也是 M2 提问清单的第一批素材。

**微前端范围（已定）**：icis 是子应用，主应用在别的仓，**跨应用链路在本仓内不可能追全**。
所以 M1/M2 只追**仓内链路**：`路由 → page → 组件 → service/api → $http → 后端`，
跨应用边界一律标记为"外部依赖"并停止追踪。这不是妥协，是本仓信息边界决定的。

**适配层设计**（M1 只做 Vue 3）：

```
code-indexer/
├── index.ts          # 统一接口 scan(repoPath) -> ProjectMap
├── detect.ts         # 探测 Vue2/3、构建器、是否 qiankun 子应用
├── adapters/
│   ├── vue3.ts       # M1 实现
│   └── vue2.ts       # M3 之后再说（血库仓是 Vue 2.7）
├── routes.ts / components.ts / api-calls.ts / deps.ts
└── ignore.ts         # 排除规则
```

- **路由提取**：M1 直接静态解析 `src/router/index.ts` 取 `path` / `name` / `component()` / `meta.label`。
  比预想简单——不需要处理 `import.meta.glob`。
- **组件树**：`@vue/compiler-sfc` 解析 SFC template AST 取组件引用。**不要用 ts-morph**。
- **API 调用点**：`src/service/api/**` 是声明式定义，`$http.ts` 是统一封装（axios）。
  链路 = 页面/composable 调用 api 函数 → api 函数调 `$http` → 后端。
- **排除规则**：`node_modules/`（可能是**符号链接**，须检测并跳过）、`dist/`、`.git/`、
  `vite.config.ts.timestamp-*.mjs`（构建残留）、**`token.temp`（疑似凭证，必须排除）**。
- **`web/` 与 `plugin/` 目录**：用途未明，M1 先跳过，确认后再纳入。

**硬约束**：不把源码喂给 LLM 做分析，LLM 只消费索引结果摘要，否则成本和一致性都不可控。

**其余 7 个仓**（技术栈不统一，非 M1 范围）：

| 仓                        | 栈                              | 备注                                          |
| ------------------------- | ------------------------------- | --------------------------------------------- |
| `reuseapp-blood-bank-web` | Vue 2.7 + vue-cli(webpack) + JS | vue-router 3 + Vuex 3，ant-design-vue 1.7     |
| `iho-cssd-ui`             | Vue 3.5 + Vite 4 + TS           | vue-router 4 + Pinia，**也是 qiankun 子应用** |
| 其余 5 个                 | 未核实                          |                                               |

**与既有约定共存**：血库仓内已有自己的 `CLAUDE.md` / `AGENTS.md`，`iho-cssd-ui` 有 `PM/` 和
`前端任务提示语.md`。小游注入 `docs/` 前先检查，避免与既有约定冲突。

### 4.2 knowledge-store（最关键）

文件布局，注入目标仓：

```
docs/
├── CONTEXT.md              # 项目总览 + 导航（唯一入口）
├── glossary.md             # 术语表：业务黑话 ↔ 代码标识符
├── modules/<module>.md     # 模块职责、边界、关键文件、坑
├── flows/<flow>.md         # 业务链路 + 数据流 + 代码出处
└── decisions/NNN-*.md      # 为什么这么做（ADR 风格）
```

每条知识 frontmatter 带状态：

```yaml
---
status: proposed | confirmed
source: agent | user # 谁提出的
evidence: # 代码出处，必填
  - src/pages/order/detail.vue:120
confidence: high | medium | low
---
```

**写入协议（不可妥协）**：

- Agent **只能**写 `status: proposed`。
- `confirmed` 只能由用户动作产生（点确认 → 合并 PR）。
- `evidence` 必填。没有代码出处的业务描述不许入库。
- 理由：业务猜测错了还静默存下来，知识库会整体腐烂，比没有更糟。

### 4.3 mentor-engine

用 Claude Agent SDK 装配，把 `persona.md` 作为系统提示。人格要点：

- **先问后讲**：先探明用户已知边界，不重复讲他已会的。
- **分层讲解**：L1 一句话业务价值 → L2 数据流 → L3 实现细节 → L4 边界与坑。默认停在 L2，用户要深挖再往下。
- **追问意图**：遇到"为什么"类问题且知识库无答案时，主动向用户提问并记录答案。
- **复述检验**：讲完一个模块，要求用户用自己的话复述或补全图，明确指出偏差。
- **禁止**：不编造业务规则；不知道就说不确定，并给出验证方法（看哪行代码、问谁）。

暴露给 Agent 的工具：`index_routes`、`index_components`、`trace_flow`、`search_knowledge`、`propose_knowledge`、`render_diagram`。

### 4.4 review-gate

- 产物一律以 PR/diff 呈现，**绝不自动 push**。
- 让"确认" = merge PR，与 4.2 的 proposed→confirmed 语义完全对齐。
- 顺带解决知识库污染：用户不 approve，脏知识进不了主干。

## 5. 仓库接入与运行形态（已定：本地路径）

用户直接给出本地仓库绝对路径，小游在本机读写。

**形态推论（重要）**：本地路径 ⇒ 应用必须跑在用户机器上，**不能部署到 Vercel**。
所以"独立 Web 产品"实际是**本地运行的 Web 应用**。这反而带来一串简化：

- 不需要 GitHub App / OAuth / 远端凭证托管。
- git 操作直接用本机 git CLI 和用户已有凭证。
- 知识传播靠 **git 本身**：产物写进目标仓 `docs/`，用户自己 push，团队自然拿到。
  即"知识通过 git 传播，而不是通过平台传播"——与 4.2 的仓内知识库设计自洽。
- 目标仓就在 `d:/multica/gitlab/` 下，小游自己在 `d:/multica/fe_project_mentor/`，
  与既有 AgentTeam 流水线同处一个工作区，天然便于自测。

**路径输入**：浏览器拿不到本地绝对路径（File System Access API 的 handle 也无法直接交给 Node），
所以用**用户粘贴路径** + 本地保存"最近打开"列表。不要做原生目录选择器。

**安全约束（必须有，不是可选）**：

- 服务端能读用户磁盘，必须做路径规范化 + 白名单校验，拒绝仓库目录外的读写。
- 防 prompt injection 诱导 Agent 读 `~/.ssh/*`、`.env*`、`~/.aws/*` 等敏感文件。
  （与 AgentTeam 既有约定"敏感文件必须人工审批"保持一致。）
- 扫描排除 `node_modules/`（可能是符号链接，须检测）、`dist/`、`.git/`、`*.zip`。
- 服务只监听 `127.0.0.1`，不监听 `0.0.0.0`。（2026-09-29 已放开：为方便局域网演示，dev 改为 `-H 0.0.0.0`，注意本机文件暴露风险）

**写回策略**：产物写到新分支 `xiaoyou/docs-<date>`，app 内展示 diff；
用户点"确认"后 app 执行 commit（**不 push**），push 由用户自己做。
这样保留了 4.4 的 review 语义，又不需要任何远端凭证。

## 6. 技术栈

| 层           | 选型                                                               |
| ------------ | ------------------------------------------------------------------ |
| 前端 + API   | Next.js (App Router)，全栈一体                                     |
| 大模型接入   | `@anthropic-ai/sdk`，baseURL / authToken / model 全可配            |
| 代码静态分析 | Vue SFC：`vue-template-compiler`(Vue2) / `@vue/compiler-sfc`(Vue3) |
| 出图         | 复用 `archify` skill，产出内联 HTML/SVG                            |
| git 操作     | 直接操作本地仓：新分支 + commit，**不 push**（push 由用户自己做）  |
| 模型         | 主力 Claude Opus/Sonnet，出图等轻任务用 Haiku                      |

## 7. 里程碑

### M1 — 代码层 + 地图（能看，不会教）

- 交付：本地路径接入 `iho-icis-ui` → 路由表 / 业务模块 / API 调用点 → 项目地图页面。
- 验收：
  - 11 条路由 + 13 个业务模块全部识别，与人工核对一致率 ≥ 95%。
  - 每个模块能列出它调用的 API 域，并**主动标出** `catheter ↔ conduit-manage` 这类命名不一致。
  - 扫描全仓（含 `node_modules`）耗时 < 10s，且不误入符号链接。

### M2 — 讲解 + 复述检验（会教）

- 交付：选路径 → 追链路 → 四层讲解 → 复述检验。
- 验收：找一位没接触过该项目的同学走完一遍，能独立画出主链路数据流图。

### M3 — 知识沉淀 + PR（能积累）

- 交付：`docs/` 骨架注入、proposed 写入、确认 → PR。
- 验收：跨两次会话，第二次对话能直接引用第一次沉淀的知识，无需重读代码。

## 8. 未决问题与风险

| #   | 问题                                                       | 影响                            |
| --- | ---------------------------------------------------------- | ------------------------------- |
| 1   | 复述检验怎么判分：LLM 打分可靠性存疑                       | M2 的核心风险，可能需要人工校准 |
| 2   | `iho-icis-ui` 的 `web/` 和 `plugin/` 目录用途未明          | 可能藏着额外的路由或构建期逻辑  |
| 3   | 大仓扫描性能：万级文件下的索引耗时                         | 决定是否需要增量索引            |
| 4   | 多人协作时 `docs/` 的冲突处理                              | 决定 knowledge-store 是否需要锁 |
| 5   | 分发形态：本机 `yarn dev` 跑 localhost，还是打包成桌面 App | 决定要不要引 Tauri/Electron 壳  |
| 6   | 其余 5 个仓的栈未核实                                      | 决定 `vue2.ts` 适配器何时必须做 |

## 9. M1 实施状态（已完成）

### 跑法

```bash
yarn dev                          # 本地 Web 应用，监听 0.0.0.0:3003（局域网可访问）
yarn scan <仓路径>                 # CLI 打印项目地图
yarn verify <仓路径>               # 验收断言
```

### 已实现的模块

| 文件                                        | 作用                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `lib/code-indexer/detect.ts`                | 探测 Vue2/3、构建器、是否 qiankun 子应用（看入口运行时标记，不只看依赖）   |
| `lib/code-indexer/ignore.ts`                | 递归遍历，**符号链接一律不跟随**；排除 node_modules/dist/`*.temp`/`*.zip`  |
| `lib/code-indexer/ast.ts`                   | TS AST 与 SFC 脚本块解析、别名还原                                         |
| `lib/code-indexer/adapters/vue3.ts`         | 从 `src/router/index.ts` 提取 path/name/label/component/权限码             |
| `lib/code-indexer/api-calls.ts`             | API 域清单 + 由 import 推导的模块↔域链接（不猜名字）                       |
| `lib/code-indexer/modules.ts`               | `src/page/*` → 业务模块，附组件清单与组件树                                |
| `lib/code-indexer/deps.ts`                  | 组件图与渲染树：模板标签解析 + 四种引用方式判定                            |
| `lib/code-indexer/auto-components.ts`       | 读 unplugin 生成的 `components.d.ts` 拿自动导入清单                        |
| `lib/code-indexer/endpoints.ts`             | **server-only**：从 api 文件提取「函数 → HTTP 方法 + 后端 URL」            |
| `lib/code-indexer/endpoint-types.ts`        | 端点类型与 `resolveModuleEndpoints`，**零 Node 依赖**，供客户端组件 import |
| `lib/code-indexer/via-label.ts`             | 引用方式的展示名，CLI 与 UI 共用                                           |
| `lib/code-indexer/index.ts`                 | 编排与告警                                                                 |
| `lib/security/paths.ts`                     | 路径白名单（realpath 解链接 + Windows 大小写归一）                         |
| `app/api/scan`、`app/api/repos`             | 扫描 / 列仓                                                                |
| `app/page.tsx`、`lib/ui/ProjectMapView.tsx` | 接入页 + 项目地图                                                          |
| `scripts/tree.ts`                           | `yarn tree <仓> <模块>` 带完整路径打印某个模块的组件树                     |

### 验收结果（`iho-icis-ui`，17 项全过）

- 路由 11 / 业务模块 13 / API 域 17，与人工核对一致
- 组件图 145 SFC / 206 条边 / 385 个外部标签；自动导入清单取自 `components.d.ts`
- **后端端点 322 个**，只有 1 个导出函数不打后端（纯日期工具函数）
- 扫描 602 文件，耗时 ~550ms（远低于 10s 上限）
- 越权路径（`d:/multica`、`C:/Users/.../.ssh`）一律 403
- 全项目 `tsc --noEmit` 零报错

### 组件树的三种引用方式（重要发现）

做 `deps.ts` 时发现：**子组件不一定出现在模板里**。这个仓有三种引用方式，
只认「模板标签 + 显式 import」会漏掉整条主链：

| via        | 形态                                                           | 例子                                                       |
| ---------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| `import`   | 显式 import 且模板里当标签用                                   | `<ConduitMange />`                                         |
| `auto`     | `unplugin-vue-components` 自动导入，**源码里没有 import 语句** | `<global-select-bck1 />` → 查 `components.d.ts`            |
| `async`    | `defineAsyncComponent(() => import(...))`                      | `bed-overview/index.vue:34`                                |
| `indirect` | 显式 import 但**只作为值传递**，由 `<component :is>` 渲染      | `conduit-manage/index.vue` 把 `ConduitHome` 塞进 `tabList` |

`indirect` 是最容易让新人迷路的一类：模板里搜不到标签名，组件是通过数据挂上去的。
`conduit-manage` 的整个业务主体 `ConduitMange.vue` 就走这条路，
一开始没识别出来，树里少了 6 个组件。

另外发现 `bed-overview/index.vue` 用 `<component :is="curTab?.component">` +
`defineAsyncComponent` 组合切换 tab —— 静态读代码完全看不出子页面在哪。
这类 `dynamic-children` 已作为告警单独报出（全仓 7 处）。

### `$http` 链路终点（第 3 节「追链路」的最后一块）

`$http.ts` 导出 `{ get, post, upload, download, delete }`，各域文件形如：

```ts
import $http from "@/service/$http";
export function queryCatheterConfigList(params?) {
  return $http.get<CatheterConfigurationDTO[]>(
    "/icis/api/catheter-configurations/search",
    params,
  );
}
```

于是链路补齐为：

```
页面模块 → api 函数 → $http → GET /icis/api/catheter-configurations/search
```

`conduit-manage` 实测能对回 11 个端点。两个实现要点：

1. **不写死 `$http` 这个名字**，而是判断「import 解析结果落在共享层文件里」，
   这样别名 import 或换变量名也不会漏。
2. **模板字符串 URL 必须支持**。``$http.post(`/icis/catheter-elements/delete/${params.id}`)``
   这类 RESTful 路径一开始整批丢了（11 个未解析），支持后降到 1 个，
   占位符原样保留成 `{params.id}` 以显示路径形状。

### 一个踩过的坑：客户端 / 服务端边界

`ProjectMapView` 是 `"use client"`，我一度让它 import 了 `endpoints.ts`——
那个文件 `import typescript` 和 `node:fs`，于是 Node 模块被拖进浏览器 bundle，
webpack 直接 `UnhandledSchemeError: Reading from "node:fs" is not handled`，
**CLI 全部验收通过、UI 却整个 500**。

修法是把纯类型和纯逻辑拆到 `endpoint-types.ts`（零 Node 依赖），
server-only 的 AST 提取留在 `endpoints.ts`。
**教训：CLI 绿不等于产品可用，这也是「必须真的打开 UI 看」的实证。**

### 告警质量（一次重要修正）

初版命名不一致告警 **32 条，绝大多数是误报**——`system-config/instrument-project` 用
`instrument` 域其实完全对得上，只因我只比对模块名就报了。

改为**同时比对模块名和引用方子路径**，并过滤掉被 ≥3 个模块引用的共享域后，降到 **10 条**，
且都是该问人的真问题：

- `conduit-manage` ↔ `catheter`（导管）
- `medical-advice-manage` ↔ `mdm`（主数据，缩写不可解）
- `nursing-record` ↔ `fdp-api`（缩写不可解）、`ai-generate`
- `system-config/conduit-element` ↔ `catheter`

另有 2 条模块外路由（指向 `src/view/out-page/`）和 5 个无路由入口的模块
（`assessment-scale`/`nursing-assessment`/`statistics`/`vital-signs`/`word-gauge`），
后者的处置方式（子页面？未挂载代码？）需要问人。

### 已知局限（诚实记录）

1. **组件树是静态分析的边界。** 四种引用方式能识别，但 `<component :is="someVar">`
   里 `someVar` 具体指向谁、props 透传的组件，仍然看不全——这类已作为
   `dynamic-children` 告警报出，交给人工判断。
2. `indirect` 的判定靠「import 绑定名在脚本里出现 >1 次」，理论上会把
   「import 了但只在类型标注里用到」误判成依赖。这是刻意的：漏掉一条主链的
   代价远大于多出一条边。
3. `refs` 里剔类型靠的是「名字在域的导出函数清单里」——混合 import
   （`import { SomeDTO, someFn }`）纯语法分不出类型，只能这样反查。
   若某域函数定义在域目录之外，可能被误剔。
4. `medical-advice-manage` ↔ `doctors-advice` 因共享 token `advice` 被漏报。
   属可接受的假阴性：重叠规则挡掉的误报远多于它漏掉的真问题。
5. 装依赖需加 `--ignore-optional`：yarn 1 不按平台过滤，会去下
   `@esbuild/linux-loong64` 这类无关二进制，在镜像上反复重试卡死。
6. `web/` 和 `plugin/` 目录仍未探查（见第 8 节第 2 条）。

## 10. M2 实施状态（第一切片：追问闭环，已完成）

M2 的目标是「会教」，但按第 10 节原定的顺序，先做**追问闭环**而不是先做讲解——
因为「Agent 提问 → 用户回答 → 落成产物」这个闭环才是 M2 的骨架，讲解只是它的输出之一。

### 配置（全部可覆盖）

**配置写在项目根目录的 `.env.local`**（参考 `.env.example`），Next.js 服务端启动时自动加载。

这一点是踩坑后补上的：最初只读 shell 环境变量，于是**换个终端启动 `yarn dev` 就会静默解析出空模型名**，
报错还很难懂。改成 `.env.local` 后配置跟着项目走，与从哪个 shell 启动无关。
`.env` / `.env.*` 已进 `.gitignore`（`.env.example` 用 `!` 例外保留在仓里）。

诊断入口：`GET /api/config` 返回脱敏后的解析结果（凭证只报「是否设置 + 长度」，**绝不回内容**），
用来快速区分「配置没读到」还是「别的问题」。

**模型名为空会直接报错**（`assertLlmReady` 与 `complete` 各拦一道），
不会让空串一路走到 API 请求才失败——那样报错极难定位。

一律「`XIAOYOU_*` 优先，`ANTHROPIC_*` 兜底」，所以当前环境（火山方舟代理）开箱可用：

| 配置项                  | 兜底                             | 默认                  |
| ----------------------- | -------------------------------- | --------------------- |
| `XIAOYOU_BASE_URL`      | `ANTHROPIC_BASE_URL`             | 官方端点              |
| `XIAOYOU_AUTH_TOKEN`    | `ANTHROPIC_AUTH_TOKEN`           | —                     |
| `XIAOYOU_API_KEY`       | `ANTHROPIC_API_KEY`              | —                     |
| `XIAOYOU_MODEL`         | `ANTHROPIC_DEFAULT_SONNET_MODEL` | -                     |
| `XIAOYOU_STRONG_MODEL`  | `ANTHROPIC_DEFAULT_OPUS_MODEL`   | -                     |
| `XIAOYOU_STAGING_DIR`   | —                                | `<小游目录>/.xiaoyou` |
| `XIAOYOU_ALLOWED_ROOTS` | —                                | `<workspace>/gitlab`  |

模型位走 `ANTHROPIC_DEFAULT_*_MODEL` 兜底，是为了**让小游跟随 Claude Code 的模型配置**，
而不是把 Claude 模型名写死。本机实测解析结果：`model=deepseek-v4.1-flash`、
`strongModel=glm-5.3-flash`。

实测（`yarn probe`，走真实代码路径 `loadConfig → complete / completeJson`）：

- 火山方舟**不支持 `models.list`**（404），只能直接打 `messages`；用 `authToken` 而非 `apiKey`。
- **推理型模型需要 `max_tokens` 余量**：`deepseek-v4.1-flash` 在 `max_tokens=32` 时返回
  空文本（有 token 消耗但无文本，推理 token 吃完了），256 起正常。因此 `complete` 默认
  2048，结构化调用给到 2048。**卡紧 max_tokens 是这类模型最容易踩的坑。**

### 新增模块

| 文件                                   | 作用                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `lib/config.ts`                        | 配置加载 + 凭证缺失时的可照做提示                                                     |
| `lib/llm/client.ts`                    | 单轮 `complete` / `completeJson`（代理不保证支持 tool/JSON mode，靠提示词 + 抠 JSON） |
| `lib/knowledge/schema.ts`              | 条目 schema、frontmatter 序列化/解析、**写入前校验**                                  |
| `lib/knowledge/store.ts`               | 知识暂存库：`propose` / `confirm` / 生成 `CONTEXT.md` 索引                            |
| `lib/mentor/questions.ts`              | 从 M1 发现派生提问队列                                                                |
| `lib/mentor/structure.ts`              | 用户回答 → 结构化知识条目                                                             |
| `lib/mentor/session.ts`                | 目标仓 → 它的暂存库                                                                   |
| `app/api/{questions,answer,knowledge}` | 提问 / 落条 / 列表与确认                                                              |
| `lib/ui/MentorPanel.tsx`               | 追问 + 知识暂存面板                                                                   |
| `scripts/ask.ts`                       | 追问闭环 CLI（支持 `--file` 传中文长回答）                                            |
| `scripts/verify-knowledge.ts`          | 写入协议验收                                                                          |
| `scripts/smoke-ui.tsx`                 | 用真实数据 SSR 渲染 UI，抓渲染期崩溃                                                  |

### 提问队列（`iho-icis-ui` 实测 35 条）

| 类别       | 条数 | 来源                                               |
| ---------- | ---- | -------------------------------------------------- |
| 重复端点   | 11   | 按「域组合」聚合，避免 95 个重复端点刷出 95 个问题 |
| 命名不一致 | 10   | M1 `naming-mismatch`                               |
| 动态渲染   | 7    | M1 `dynamic-children`                              |
| 无路由模块 | 5    | M1 `orphan-module`                                 |
| 模块外路由 | 2    | M1 `orphan-route`                                  |

### 一个重要的设计选择：知识先暂存，不碰目标仓

原 plan 4.2 说知识写进目标仓 `docs/`。实现时改成**先写暂存区**
（`<小游目录>/.xiaoyou/<仓名>/docs/`），确认后才由单独步骤落到目标仓分支。

理由：直接写目标仓会让「Agent 提议 / 用户确认」在文件层面混成一步，
而且每次试跑都脏用户的工作区。拆开后「提议」和「确认」是两个物理位置，
不靠自觉。**代价是暂存区不进 git，跨机器不同步**——这是已知取舍。

### 与 plan 原设计的偏差（Agent SDK）

原计划用 Claude Agent SDK 作运行时，实现时改用 `@anthropic-ai/sdk` 单轮调用。理由：

1. 追问闭环是**单轮**任务（提问、结构化回答），不需要 agent 工具循环。
2. Agent SDK 会拉起 Claude Code 子进程，装包体积大，且要额外验证它在火山方舟代理下能否工作。

**Agent SDK 仍然需要**，但时机是讲解阶段——那时 Agent 要调 `trace_flow`、`search_knowledge`
这些工具去探索。到那一步再引入，并单独验证代理兼容性。

### 验收结果

- `yarn verify`（M1）17 项全过
- `yarn verify:knowledge` 14 项全过，含四条防腐断言：
  缺 evidence 拒绝写入、缺 answer 拒绝写入、**Agent 不能直接写 `confirmed`**、
  **confirmed 条目不许被 Agent 覆盖**
- `yarn smoke` 用真实数据 SSR 渲染 `ProjectMapView`（166KB HTML）无崩溃
- 追问闭环 HTTP 全通：问题 → 中文回答 → 结构化条目 → 暂存 → 确认

### 已知局限

1. **MentorPanel 没在浏览器里点过。** API、类型、bundle 编译、SSR 冒烟都验了，
   但「点回答 → 看到条目出现」这一步需要人眼确认。
2. 问题措辞是**确定性模板**，没让 LLM 润色。好处是可复现、零 token；代价是问法偏机械。
3. `slugify` 只保留 `\w` 和中文，`+`、`:` 等会折叠成 `-`。目前够用，
   但如果两个不同问题 id 折叠后相同就会互相覆盖——已在用问题 id 而非
   `category+subject` 来降低这个风险。
4. 暂存区不跨机器同步（见上）。
5. 复述检验完全未做，仍是 M2 剩余部分最大的风险（第 8 节第 1 条）。

## 10.5 落产物到目标仓（MVP 第 6 步，已完成）

MVP 六步的最后一块：把暂存区（`.xiaoyou/<仓>/docs/`）的知识写到目标仓的新分支并 commit，
**绝不 push**。做完这一步，「知识随 git 传播」才真正闭环。

### 新增模块

| 文件                                           | 作用                                                        |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `lib/git/deliver.ts`                           | 核心：复制暂存区 docs → 目标仓 → 建分支 → commit（不 push） |
| `app/api/deliver/route.ts`                     | POST 触发放置，走路径白名单                                 |
| `scripts/deliver.ts` + `yarn deliver`          | CLI，支持 `--force`                                         |
| `scripts/verify-deliver.ts` + `verify:deliver` | 14 项验收                                                   |

### 写回策略（对齐 plan 第 5 节 / 4.4 review-gate）

- **绝不 push**：只 commit，push 由用户自己做，git review 语义不破坏。
- **保守覆盖**：目标仓已有同名文件就跳过，不覆盖人工内容（手写 `CONTEXT.md` 的测试也验证了这点）。
- **脏工作区拦截**：目标仓有已跟踪改动时就停下（报错），避免把用户未提交的活卷进分支；
  `--force` 可跳过检查。
- **confirm 保留**：already-confirmed 的条目原样落下，不被 Agent 改写（沿用防腐协议）。

### 验收

- `yarn verify:deliver` 14 项全过：分支创建、docs 写入、commit 不 push、同名跳过、
  手写文件不被覆盖、脏工作区拦截、已存在文件不覆盖。
- `npx tsc --noEmit` 零报错。
- **真实落库**（`yarn deliver d:/multica/gitlab/iho-icis-ui`）：
  新建分支 `xiaoyou/docs-20260928`，commit `e357ef0`，写入 7 个文件
  （CONTEXT.md + 3 decisions + 3 glossary），1 条人工 confirmed 原样保留；
  目标仓原工作区干净，`dev` 分支改动未被污染。

### 已知局限

1. **分支名用日期 `xiaoyou/docs-<yyyyMMdd>`**，同一天多次落库会落在同一条分支，
   第二次因文件全在就直接返回空、不开新分支。若一天内要多次落，可靠不同内容自然区分，
   或后续改成带序号。
2. **「落到目标仓」按钮没在浏览器里真正点过**。API、类型、SSR、CLI 都验了，
   但「点按钮 → 看到分支/commit 展示」需要人眼确认。

## 10.6 M2 第二切片：讲解 + 探讨式交流（Agent SDK，已完成）

M2「会教」的核心两步（第 4、5 步）直接建在 Claude Agent SDK 上，按第 11 节原要求
**先探针验证代理兼容性**，再装配 mentor Agent。

**交互形态修正（2026-09-29，覆盖原「复述检验」设计）**：目标用户是在职前端开发，
小游比他懂代码逻辑，但业务用户更了解，关系定位是**一起探讨的同伴**，不是考官。原第 5 步的「复述检验」
（布置复述作业、逐条判错打分）改为**探讨协议**：抛开放问题听用户说他的理解，
对了顺着往深引，偏了温和地一起对照代码验证，聊出的业务知识照旧落 proposed。
「让用户讲、Agent 纠正」的灵魂（原则 1.3）不变，只是去掉了考试味。

### Agent SDK 接入的三个实证坑（探针：yarn probe:agent）

1. **SDK 只认 native binary。** PATH 里的 `claude` 报 "not found"，`claude.cmd` 报
   `spawn EINVAL`（Node spawn 不带 shell 起不了 .cmd）。必须指到
   `…/node_modules/@anthropic-ai/claude-code/bin/claude.exe`，可用 `XIAOYOU_CLAUDE_CODE_PATH`
   覆盖（lib/mentor/agent.ts 的 `resolveClaudeCodePath` 按 PATH 推导 + 缓存）。
2. **进程内工具必须先 `createSdkMcpServer` 包装**再挂 `options.mcpServers`；直接传
   `options.tools` 不生效。模型侧看到的名字是 `mcp__xiaoyou__<tool>`。
3. **必须显式注入 `ANTHROPIC_MODEL` / `ANTHROPIC_SMALL_FAST_MODEL`**。Claude Code 子进程
   自己挑模型名（opus/sonnet 别名），不钉住就会拿别名去打代理而失败。

### 新增模块

| 文件                                            | 作用                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `lib/mentor/persona.md`                         | 导师人格：先问后讲、四层协议、探讨协议（替代考试式复述检验）、不编造铁律                  |
| `lib/mentor/tools.ts`                           | 四个工具（plan 4.3）：get_project_map / trace_flow / search_knowledge / propose_knowledge |
| `lib/mentor/agent.ts`                           | Agent SDK 装配：env 注入、binary 解析、persona 系统提示、会话续接                         |
| `app/api/teach/route.ts`                        | 讲解会话 SSE（session/text/tool/done/error 五类事件）                                     |
| `lib/ui/TeachPanel.tsx`                         | 讲解 + 探讨聊天面板（路由 chip 一键开聊，流式渲染）                                       |
| `scripts/teach.ts` + `yarn teach`               | 讲解 CLI（--file 读中文长文、--session 续接、--jsonl 事件日志）                           |
| `scripts/agent-probe.ts` + `yarn probe:agent`   | Agent SDK 代理兼容探针（纯对话 + 强制工具回路两段）                                       |
| `scripts/verify-teach.ts` + `yarn verify:teach` | 离线验收 10 项                                                                            |

### 与 plan 原设计的一处偏差（诚实记录）

plan 4.1 的硬约束是「不把源码喂给 LLM，LLM 只消费索引结果摘要」——那是 **M1 索引阶段**
的成本与一致性约束。讲解阶段 persona 要求「每条技术断言落到代码出处（行号）」，
索引摘要里没有行号，于是运行中的 mentor Agent 被允许用内置 Read 按需补读少量文件
（实测一轮讲解补读 4 个文件）。这与索引阶段的约束不冲突：批量全仓分析仍全在
code-indexer 静态层，LLM 只增量消费。

### 实测（iho-icis-ui，真实代理）

- **讲解**：`/bed-overview` 一键开讲，14 turns。L1 业务价值（床位总览看板）、L2 数据流
  （含 `<component :is>` 三 Tab 动态切换这个最大的坑）、4 个后端端点汇总，全部带文件行号。
  主动标了一个低置信度疑点（「出科」tab 复用「转科患者」接口），没有编造业务定义。
- **纠错能力实测**（形态修正前做的「带错复述」实验，仍是有效证据）：用户故意带 4 处
  错误说自己的理解（接口角色张冠李戴、编造概念区别、域归属错），全部被逐条抓出并给出
  代码出处；对其中代码无法裁决的业务问题拒绝下结论、落成 low 置信度 proposed 条目；
  对可裁决的落成 high 置信度条目。两条都进了暂存区，走 propose_knowledge 的同一套
  防腐校验。探讨形态下这批错会以「咱们对着代码看一眼」的方式指出，能力要求相同。
- **探讨形态实测**（修正后新人格，/conduit-manage）：7 turns。同伴语气（「咱们」「你觉得」），
  主动抛了两个开放问题（conduit/catheter 命名之谜、数据驱动表单），对不确定的业务问题
  明说「这个我不确定」并落成 proposed，结尾邀请用户先谈自己的读法而不是验收。
  考试式「复述作业」没有出现。
- 多轮靠 sessionId 续接（Agent SDK `resume + continue`），讲解 → 用户说理解 → 一起对照
  代码聊，在同一会话。

### 验收

- `yarn verify:teach` 10 项全过（人格三要素、四工具接线、binary 可解析、两条产物为
  proposed 且 evidence 非空、置信度正确）。
- `tsc --noEmit` 零报错；M1 / knowledge / deliver / smoke 回归全绿。
- **`yarn build` 收尾报 `ERR_INVALID_ARG_TYPE`，但编译与静态生成均成功，且 stash
  验证改动前的干净树同样报错——是既有问题，与本轮无关**（dev 形态不受影响，未排查根因）。

### 已知局限

1. **TeachPanel 没在浏览器里点过**：SSE 流式渲染、工具标记、中断按钮需 `yarn dev` 人眼确认。
2. 扫描结果进程内缓存：dev server 长驻期间改目标仓代码不会刷新索引（重启 dev 即好）。
3. **探讨中纠错的准确性完全交给模型自评**（第 8 节风险 1 的残余）：本次实测挑错质量
   很高，但样本量 = 1，仍未做人工校准。探讨形态没有判分环节了，但「指出偏差」本身
   仍可能错，需要攒样本人工核对。
4. `maxTurns = 12` 上限：特别缠的链路可能被截断，届时 agent 会自然收尾而非报错。
5. `yarn probe:agent` / `yarn teach` 依赖真实代理可用，离线环境跑不了。

## 11. 下一步

**M1 / M2 全部切片 / MVP 六步全部完成。** 小游已经从「能看能收」变成「能教」：
扫描 → 选路径 → 追链路 → 四层讲解 → 探讨交流 → 知识沉淀 → 落库到目标仓。

1. **浏览器人眼确认（最高优先）**：`yarn dev` 后把 TeachPanel（讲解流式、探讨多轮）、
   MentorPanel（追问、落库）真实点一遍——第 10 / 10.5 / 10.6 节三处「没点过」的债一起还。「已人工确认」
2. **探讨纠错人工校准**（第 8 节风险 1）：攒一批「用户理解有误 → 小游指出偏差」的样本
   人工核对，验证模型纠错的可靠性，别等用户发现纠错本身不可信。「后续使用时如果遇到再处理」
3. **出图接 archify**（plan 第 3 步「追链路」的图）：trace_flow 的结构化输出已经
   是现成的图数据源，差 render_diagram 工具。「暂不出图，后续考虑处理」
4. **出图之外的 M3**：跨会话引用知识（sessionId 目前只在单次 dev 生命周期内可续）。
5. `web/` / `plugin/` 目录探查（第 8 节第 2 条）、其余仓栈核实（第 6 条）、
   大仓性能（第 3 条）按原优先级排队。
6. `yarn build` 收尾报错（ERR_INVALID_ARG_TYPE，改动前已存在）待排查，
   当前 dev 形态不受影响。
