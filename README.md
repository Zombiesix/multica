# multica / AgentTeam 前端研发工作区

`d:\multica` 是一个**前端研发工作区**，里面有两条**互相独立**的主线，共用一个「看代码 + 记知识」的底座：

| 主线                         | 干什么                                                   | 入口                                                       | 谁在用           |
| ---------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ---------------- |
| **① 研发流水线**（6 步闭环） | 获取需求 → AI 写代码 → 人工测试 → 提交合并 → 填工时      | [xiaoqian-manager](xiaoqian-manager/)（宿主）+ `/pipeline` | 小前端           |
| **② 业务助手 assistant**     | 随时问业务：这个模块干嘛的、这个字段谁改的、权限在哪判的 | Claude Code 内 `/assistant`                                | 任何要懂业务的人 |

两条线**不互调、不共享 bank**，但都站在同一层底座上：

```text
       ① 研发流水线                        ② 业务助手 assistant
   (xiaoqian-manager + AgentTeam)          (/assistant skill)
              │                                   │
              └──────────────┬────────────────────┘
                             ▼
        ┌────────────────────────────────────────────────┐
        │ 事实层 code-indexer（现算，不落盘）              │
        │ 记忆层 Hindsight :8888（按内容分 bank，互不污染）│
        └────────────────────────────────────────────────┘
```

- **事实层**：`code-indexer` 静态索引器 —— 路由 / 组件树 / API 域 / store / 事件 / 权限 / 存储。
- **记忆层**：本机 Docker 里的 Hindsight（见第四部分 §12–§15）—— 流水线存「研发流程经验」，助手存「业务知识」，**两套 bank 分开**。

其余：`swagger-mcp-server`（实时 API 文档）供流水线用；[om/](om/) 是**独立**的发版看板，不参与任何主线。

---

# 第一部分：研发流水线（①）

## 1. 总流程：一条 6 步流水线（宿主 = xiaoqian-manager）

> 所有流程围绕 `xiaoqian-manager` 这个 Web 项目展开。`小前端` = 用这套系统的研发人（同时是协作平台的 `username` 过滤条件）。

```text
 ① 获取需求             ② 规划+编码(AI)        ③ 审查+修复(AI)        ④ 人工测试          ⑤ 提交合并        ⑥ 填工时
 小前端 点同步            AgentTeam               AgentTeam             小前端 本地测       小前端 手动       小前端 触发
 ─────────┼──────────────┼──────────────────────┼──────────────────────┼─────────────────┼──────────────┼──────────
           │  协作平台     │  自动                                   │                   │             │
   xiaoqian │ fetch       │  recon → 出计划 → 拍板 → 写码 → 审查 → 修复 │  页面效果手工测    │  提交上远程    │  回写工时
   -manager │ synced →    │                                          │  通过 → 点完成     │  点完成        │
            │ tasks.json  │                                          │                   │             │
            └────────────┴──────────────────────────────────────────┴─────────────────┴─────────────┴──────────
```

| 步骤                                      | 做什么                                      | 在哪执行                     | 由谁操作          | 说明                                                       |
| ----------------------------------------- | ------------------------------------------- | ---------------------------- | ----------------- | ---------------------------------------------------------- |
| **① 获取需求**                            | 从协作平台(teamwork)拉取需求列表/详情入库   | xiaoqian-manager             | 小前端 点击同步   | 过滤条件 `user=小前端`，落盘 `tasks.json`                  |
| **②③ 规划+编码 / 审查+修复（AgentTeam）** | AI 出计划 → 人工拍板 → 写代码 → 审查 → 修复 | multica 家 `/pipeline` 剧本  | AI + 小前端拍板   | **只用 xiaoyou-code-indexer、swagger-mcp-server 洞察代码** |
| **④ 人工测试**                            | 在浏览器/页面做人工效果测试                 | xiaoqian-manager test 阶段   | 小前端 点完成     | 通过才进入下一步                                           |
| **⑤ 提交合并**                            | 手工把代码提交、合并到远程                  | xiaoqian-manager deploy 阶段 | 小前端 手动点完成 | 选仓库 + 目标分支，触发 git 提交推送/cherry-pick           |
| **⑥ 填工时**                              | 把本次研发工时写回协作平台                  | xiaoqian-manager 工时        | 小前端 触发       | 复用协作平台登录态                                         |

### 一个重要的边界（②③ vs ⑤）

**AgentTeam（②③）的产物只到「代码合并到本地分支 + 删除 worktree」为止，绝不做 commit / push 远程**：

- 它把 worktree 里的代码合并到**本地固定分支**（仓内有 `dev-zjb` 用 `dev-zjb`，否则用 `dev`，非 master），然后删除 worktree。
- **远程提交、push、合并到目标分支**是 ⑤ 步，由 `小前端` 在 xiaoqian-manager 的 deploy 阶段手动完成（含 cherry-pick）。
- 这样 AI 永远接触不到远程写操作，出问题也是"本地可回滚、远程有人把关"。

---

## 2. AgentTeam 是什么（②③ 步的核心）

| 角色         | 文件                                                                  | 干什么                                          |
| ------------ | --------------------------------------------------------------------- | ----------------------------------------------- |
| orchestrator | 主对话 + [.claude/commands/pipeline.md](.claude/commands/pipeline.md) | 控流程、读 state、委派、汇总;**不住任何上下文** |
| planner      | [.claude/agents/planner.md](.claude/agents/planner.md)                | 只规划,出 `plan.md` + 编号问题                  |
| coder        | [.claude/agents/coder.md](.claude/agents/coder.md)                    | 写代码,跑 lint/test/build                       |
| reviewer     | [.claude/agents/reviewer.md](.claude/agents/reviewer.md)              | 只读审查 git diff,出 blocker/suggestion/nit     |

核心不变式:

- **文件即接口** —— 不靠对话历史,靠落盘。
- **流程分级** —— `tier: full | light`,小改动不进昂贵环节。
- **人工只卡门禁** —— 全部拍板进 `decisions.md`,留审计链。

### 喂食一个需求（PM 任务 → 流水线输入）

> 由 **pipeline-feed skill** 完成：会话内 `/pipeline <别名>` 时，若该需求尚未接入（无 `docs/requirements/<别名>/`），orchestrator 在 init 阶段自动调用 skill，参数 = PM 计划文件路径（如 `get-plan/plans/<任务ID>.md`）。

1. **抽字段**：定别名 `R-<任务ID后6位>`（例 `R-013345`），提取产品/模块、客户、描述、附件链接。
2. **查 project-map**：按「产品/模块 + 标题关键词」映射到 gitlab 仓库目录，查不到/命中多条 → 向张三要，确认后回填，不许猜。基准分支按 `dev-zjb` 优先规则定。
3. **拷模板**：复制 `_template/` → `docs/requirements/R-013345/`，context.md 顶部放**需求标题 + 一句话需求描述**。
4. **登记**：tasks.md 新行、state.json(phase=init)、decisions.md(tier 判定)、file-lock.md。
5. **tier 建议**：改文案/单文件小修 → light；新增组件、动 store/表格/页面、多步任务 → full；拿不准标 full 并写明原因。
6. **到此为止** —— 不建 worktree、不动真实源码，回到流水线继续。

### AgentTeam 内部流程（full）

```text
> /pipeline R-16931            # 已喂食：直接跑
> /pipeline resume R-16931     # 中断：从 state.json + orchestrator-log.md 重建
```

主对话读 state → feed(如需)→ recon 事实底稿(`node scripts/recon.mjs <ID>`，确定性、覆盖式)→ @planner 出计划(可能的 Q 等答) → 人工确认拍板 `decisions.md` → @coder 编码跑测 → @reviewer 审查 → blocker 回 @coder 修(≤2轮)→ verify → done（**合并到本地固定分支 + 删 worktree，不 push**）。

### light 流程

```text
> /pipeline R-16931        # tier=light 时自动走 精简三段
```

直接 coding → verify → done，跳过 planner / plan_confirm / reviewer。

---

# 第二部分：业务助手 assistant（②）

## 3. 它是什么

在 Claude Code 里随时叫起来的**业务助手**：**问什么答什么、说存才存、答不上就说答不上**。
给人（懂技术但不懂公司业务）解答业务，**不做任何主动行为**。

| 职责           | 怎么用                                       | 行为                                                        |
| -------------- | -------------------------------------------- | ----------------------------------------------------------- |
| **① 答业务**   | `/assistant 导管管理是干嘛的`                | 先查已存结论(recall)，未命中走索引器**现算** → 用人话直接答 |
| **② 存文档**   | 明说「把这条存进 iho-icis-ui」               | 才落进 Hindsight，带溯源元数据(evidence/repo/module/date)   |
| **③ 查看清理** | `/assistant status` / `list` / `delete <id>` | 一眼看出「到底存没存进去」                                  |

**它不做**：不主动讲解、不追问、不做考试式提问、不自动入库、不改目标仓源码、不起 Web UI。

入口 skill：[.claude/skills/assistant/SKILL.md](.claude/skills/assistant/SKILL.md)；
配套 subagent（答案会很长时隔离上下文用）：[.claude/agents/assistant-qa.md](.claude/agents/assistant-qa.md)。

### 两条铁律

- **铁律一 · 事实现算**：路由表 / 组件树 / API 清单 / 端点会随代码变 → **一律现算、不入库**。
  只有「为什么这么设计 / 字段的业务含义 / 命名背后的黑话 / 历史决策与坑」才值得存。
- **铁律二 · 只说人话**：答的是**业务答案**，不是代码导读。不贴大段代码、不用执行顺序组织答案、不堆变量名。
  代码出处（`文件:行`）只作依据，**附在末尾**，不挡正文。

## 4. 三层粒度 → 三种手段

| 粒度       | 手段                                                                        | 产物                                                                   |
| ---------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **项目**   | `yarn assistant:map gitlab/<仓>`（等价 `/assistant init <仓>`）             | `docs/assistant/<仓>/map.md`（**时点快照**，可能过期，权威以现算为准） |
| **模块**   | `trace` / `trace-state` / `trace-event` / `channels` / `modules` / `search` | 不落盘，当场答                                                         |
| **文件夹** | 助手**按需 `Read`** 少量源码（必要时先 `trace` 缩小范围）                   | **不产出任何持久文档**；值得留的由你说 `store`                         |

## 5. 命令速查

```bash
# 事实层（现算，不落盘）—— 索引器 CLI
node code-indexer/bin/cli.mjs map    gitlab/<仓>              # 项目全貌
node code-indexer/bin/cli.mjs trace  gitlab/<仓> <模块|路由>    # 业务链路:路由→组件树→API→store/事件/权限/存储
node code-indexer/bin/cli.mjs trace-state gitlab/<仓> <store>[.<字段>]
node code-indexer/bin/cli.mjs trace-event gitlab/<仓> <组件> <事件>
node code-indexer/bin/cli.mjs channels gitlab/<仓> --kind permission|storage
node code-indexer/bin/cli.mjs modules gitlab/<仓> [<模块>]
node code-indexer/bin/cli.mjs search  gitlab/<仓> <词>
node code-indexer/bin/cli.mjs stats   gitlab/<仓>              # 探活

# 文档层（Hindsight 记忆）
yarn assistant:memo status --all
yarn assistant:memo recall --bank assistant-iho-icis-ui --query "导管管理 命名"
yarn assistant:memo retain --bank assistant-iho-icis-ui --content "<结论>" \
     --repo iho-icis-ui --module conduit-manage --evidence src/x.ts:6 --date 2026-10-10
yarn assistant:memo list   --bank assistant-iho-icis-ui --repo iho-icis-ui --days 7
yarn assistant:memo patch  --bank <bank> --id <id> --text "<改后的结论>"
yarn assistant:memo delete --bank <bank> --id <id>     # 软退休(可逆，仍可 restore)
yarn assistant:memo restore --bank <bank> --id <id>
yarn assistant:memo clear  --bank <bank> --yes         # ⚠️ 清空整个 bank

# 自检
yarn assistant:probe        # 端到端探针(可加 --reset)
yarn assistant:map gitlab/<仓>
```

> Git Bash 下以 `/` 开头的参数会被 MSYS 转成 Windows 路径，需要时加 `MSYS_NO_PATHCONV=1` 前缀。

## 6. 边界（硬规矩）

- **只读目标仓**，产物只写 `docs/assistant/`；不 push、不改目标仓源码。
- 不把源码批量喂 LLM；对话中只按需 `Read` 少量文件补行号。
- 不读敏感文件：`.env*`、`token.temp`、`~/.ssh/*`、`~/.aws/*`。
- **不与流水线 bank 混用**：`li-expertise` / `multica-project` 是研发流程记忆，业务知识写 `assistant-*`。
- 事实每次现算，`docs/assistant/` 下的地图只是快照。
- **文档层挂掉时不许静默**：Hindsight 不可达 → CLI 硬报错（非 0 退出）；此时仍要答题（事实层不依赖 Hindsight），但必须显式说明「文档层不可用，以下结论没有引用已存记忆」。

## 7. 排错与注意

| 现象                         | 原因 / 怎么办                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `✗ Hindsight 不可达`         | 容器没起。`docker ps --filter name=hindsight`；此时**存不进也查不到**，别当成「本来就没结论」                         |
| 存完立刻 `list` 只见 1 条    | 派生条(observation)是**异步**的，稍等再看；`status` 的「待整理」数字会告诉你还有多少在排队                            |
| 答案里没有 `文件:行`         | 该条是**没带 evidence 的旧数据**；`list` 翻到它补 `--evidence`，或用 `patch` 补                                       |
| 索引器对某仓返回 0 路由/端点 | **先别接助手**。跑 `stats` + `warnings` 核对，为 0 且无解释时先补索引器（否则助手会说「这个模块没有接口」= 静默撒谎） |
| 目标仓是 Vue2                | 索引器目前只支持 Vue3，需另做适配器                                                                                   |

---

# 第三部分：底座与周边

## 8. 周边工具（喂给两条主线的"眼睛"）

| 工具                   | 干什么                                                                                                                                                    | 谁用                   | 怎么跑                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------- |
| **code-indexer**       | Vue3 仓库静态索引器：扫目标仓生成 ProjectMap（路由/模块/API 域/组件图/告警），CLI 或 stdio MCP 供 Agent 消费                                              | 流水线 ②③ + 助手事实层 | `node bin/cli.mjs <cmd> <repo>`             |
| **swagger-mcp-server** | swagger-multi MCP **补丁版**服务器（修复 URL 解析截断、非法 JSON 两个 bug），覆盖 nursing(10 分组)/icis/treat/cssd 共 13 个服务，给 Agent 喂实时 API 文档 | 流水线 ②③ 仅           | 配置写入用户全局 `~/.claude.json`，重启生效 |
| **Hindsight**          | 本机 Docker 记忆系统（API :8888 / UI :9999），两条主线共用实例、**bank 分开**                                                                             | 流水线 + 助手          | 见第四部分 §12–§15                          |

> 现在只有 code-indexer 是**两条线共用**的；索引器属于「只读、纯静态」，谁查都不落盘。

## 9. xiaoqian-manager 各项功能对应的代码位置

| 总流程步骤             | 触发点                             | 实现位置                                                                                 |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| ① 获取需求             | 同步按钮(Sync)                     | `lib/server/teamwork/client.ts`(fetchList,user=小前端) + `mapper.ts` → `data/tasks.json` |
| ②③ 规划+编码+审查+修复 | 卡片→worktree 路径给 AgentTeam     | 见 §2；`/pipeline` 剧本 + 4 subagent                                                     |
| ④ 人工测试             | test 阶段 点完成                   | `components/task/StageSheet.tsx`(test stage)                                             |
| ⑤ 提交合并             | deploy 阶段 选仓库+目标分支 点完成 | `lib/server/git/deploy.ts`(pull→commit→push→cherry-pick→push)                            |
| ⑥ 填工时               | 工时入口                           | `lib/server/teamwork/client.ts` 的 `saveWorkHours`                                       |

## 10. 目录约定

分两层：**multica 家**（本目录，AgentTeam / assistant 会话都开在这）与 **worktree**（产品仓内，纯代码）。

**multica 家 `d:\multica`**

```text
.claude/
  commands/pipeline.md      流水线剧本（①的②③步）
  agents/{planner,coder,reviewer}.md    流水线 subagent
  agents/assistant-qa.md                助手问答 subagent（答案长时用）
  skills/pipeline-feed/                 喂食 skill
  skills/assistant/                     助手入口 skill + references/{service-protocol,what-to-store}.md
project-map.md            平台产品 → gitlab 仓库映射(张三维护,喂食用)
tasks.md                  需求元信息表(含 tier)
file-lock.md              并行冲突仲裁表
package.json              工作区脚本(`yarn om` / `assistant:*` 等)
docs/requirements/
  _template/              10+ 个空白模板,喂食从这里复制
  <R-xxxxx>/              context.md questions.md answers.md plan.md
                          decisions.md progress.md review.md review-fix.md
                          test-report.md worklog.md orchestrator-log.md
                          state.json
docs/assistant/<仓>/map.md   助手项目地图（生成物，时点快照）
docs/assistant-*.md          助手的设计计划 / 实施步骤 / 使用说明
docs/hindsight-*.md          Hindsight 方案与接入
scripts/recon.mjs            流水线事实底稿
scripts/hindsight-memo.py    流水线侧记忆 CLI
scripts/assistant-{memo,map,probe}.mjs   助手侧记忆 CLI / 地图 / 探针
xiaoqian-manager/        小千管理(Next.js) —— 全部流程的宿主(①④⑤⑥)
code-indexer/            Vue3 仓库静态索引器(CLI + MCP),两条线共用
swagger-mcp-server/      swagger-multi MCP 补丁版服务器,②③步用
om/                      发版看板(独立,见 §16)
```

**worktree（纯代码工作区）**

- 建在 `gitlab/<project-map 仓库目录>/` 下（与 multica 同级的 `gitlab/` 目录），只被 coder 读写；不进流程状态、不复制 `.claude/`、不复制 `docs/`。
- **基准分支（固定规则）**：仓内有 `dev-zjb` 用 `dev-zjb`，否则用 `dev`(非 master)。worktree 基于该分支创建，收尾合并回该分支（**本地合并，见 §1 边界**）。
- 助手**只读** `gitlab/<仓>`：不建 worktree、不写任何文件。

**archive/（历史归档,禁区）**

- 存放已废弃的设计草稿。**仅供人工翻阅,禁止任何 agent 读/写,或作为当前需求依据。**
- 三道防线：`.gitignore` 排除 + `.claude/settings.json` deny 规则(拦 Read/Write/Edit/Glob) + agent prompt 明令不读。改动 archive 需先临时调整 `settings.json` deny 再改。
- 若要给 archive 加说明文档，放本 README 或 `docs/` 下。

## 11. 门禁清单 + 全局约束（流水线适用）

### 门禁清单（每次跑都要盯）

1. light/full 在 init 定，写 `decisions.md`
2. plan 未确认不得编码(full)
3. reviewer 有 blocker 必须回 coder 修(full)
4. 修复 ≤ 2 轮,超了转人工
5. 每步产物必须落盘
6. 每需求独立 worktree + 独立会话
7. coder 不跨 worktree
8. subagent 只收摘要,不接完整代码/推理
9. 敏感文件(.env\*/auth.txt)必须人工审批
10. 人工验收后才合并,随后清理 worktree（**只合本地固定分支，远程提交留给 ⑤**）

### 全局约束（对流水线主对话与所有 subagent 生效）

- **禁止更改 node / npm / yarn 版本**——不执行 `nvm use`、全局切换或 `engines`/`.nvmrc`/package.json 里的版本改动。版本锁定为现状。
- **涉及 `node_modules` 数据修改时,必须先严格提示**——改动前打出「**因为 <原因> 需要进行 node_modules 修改**」并征得同意后才执行;不得静默 install / 改依赖 / 动 link(done 阶段删 worktree 前的 unlink 例外)。

### 并行与秘密

- 并行前先查 `file-lock.md`;planner 的 plan.md「将改动文件清单」是锁依据。
- 改动触及 `.env*` 等敏感文件 → planner 升级成 Q → 你 `decisions.md` 审批。
- 同项目同文件的需求不建议并行。

---

# 第四部分：Hindsight 记忆系统

> 两条主线共用同一个 Hindsight 实例，**按 bank 分开**，互不污染检索。
> 给流水线加"学习型记忆"：人工的拍板、纠正、否决理由沉淀为 Agent 可检索记忆，让第 N+1 个需求吃到前 N 个的人工经验。
> 方案文档见 [docs/hindsight-实施方案.md](docs/hindsight-实施方案.md) / [docs/hindsight-接入方案.md](docs/hindsight-接入方案.md)。

## 12. 架构（本机 Docker 一容器搞定）

```text
┌─ Docker 容器 hindsight:slim（API :8888 / UI :9999，--restart unless-stopped）┐
│   内置 PostgreSQL + pgvector（卷 hindsight-data）                              │
│   LLM 抽取 = 火山方舟 deepseek-v4.1-flash（Agent Plan Key）                   │
│   Embedding  = 硅基流动 BAAI/bge-m3 1024维（免费）                            │
│   Reranker = rrf（纯算法，零外部依赖）                                        │
└──────────┬───────────────────────────────────────────────────────────────────┘
           │ REST :8888
  ┌────────┴──────────────────────────────────────────────────────┐
  │ 流水线侧: scripts/hindsight-memo.py（软降级，绝不拦流程）      │
  │          xiaoqian-manager/lib/server/hindsight/client.ts       │
  │ 助手侧:   scripts/assistant-memo.mjs（硬报错，怕"以为存了"）   │
  └───────────────────────────────────────────────────────────────┘
```

### Bank 划分（两套，勿混）

| bank                               | 属于   | 存什么                                                |
| ---------------------------------- | ------ | ----------------------------------------------------- |
| `li-expertise` / `multica-project` | 流水线 | 人工评审口味、流水线静态规矩（约束/分支/提交规范）    |
| `iho-cssd-ui` 等产品线 bank        | 流水线 | 产品线维度经验                                        |
| `assistant-<repo>`                 | 助手   | 该仓的业务知识、模块职责、术语、坑、历史决策          |
| `assistant-shared`                 | 助手   | 跨仓通用：业务黑话/缩写、组织与角色含义、通用架构约定 |

> 助手**绝不往流水线 bank 写业务知识**，反之亦然——混在一起会互相污染检索。

## 13. 部署步骤（已完成，2026-10-08）

1. `yarn setup` —— 自动生成 `scripts/hindsight.env`（从 [hindsight.env.example](scripts/hindsight.env.example) 复制，模板已入库），填入你的 Ark Plan Key + SiliconFlow Key
2. `docker pull ghcr.nju.edu.cn/vectorize-io/hindsight:latest-slim`（ghcr.io 被墙，用南大镜像）
3. `docker run -d --name hindsight --restart unless-stopped -p 8888:8888 -p 9999:9999 --env-file scripts/hindsight.env -v hindsight-data:/home/hindsight/.pg0 hindsight:slim`
4. `python scripts/ensure-banks.py`（建 li-expertise / multica-project / iho-cssd-ui 3 库 + 预填 5 条静态规矩）

> 模板里每个变量都有注释说明来源和注意事项；key 只留本地 `hindsight.env`，已被 gitignore。
> 助手侧的 `assistant-<repo>` / `assistant-shared` bank 按需建立，不用预先跑脚本。

重启电脑后 Docker Desktop 自启 → 容器自动拉起，无需人工干预。

### 踩过的坑（都排掉了）

| 坑                                            | 解法                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| npm 全局装过同名 `docker` 文档生成器，抢 PATH | 管理员 PowerShell 删 shim                                                                                          |
| ghcr.io 国内被墙                              | `ghcr.nju.edu.cn` 南大镜像                                                                                         |
| 完整版镜像 9GB                                | slim 版 1.88GB + 外部 embedding 服务                                                                               |
| 方舟 Plan Key 路径隔离                        | 只在 `/api/plan/v1` 有效，标准 `/api/v3` 一律 401                                                                  |
| 方舟 embedding 全不能用                       | 250515 即将下线；vision-251215 是多模态专用 API 格式不兼容；Plan Key 调不了 embeddings → **换 SiliconFlow bge-m3** |
| pgvector HNSW 索引上限 2000 维                | bge-m3 原生 1024 维，天然合规                                                                                      |
| `RERANKER_PROVIDER=none` 启动报错             | 合法值没有 none，用 `rrf`                                                                                          |
| recall/reflect 的 `budget` 传数字报 422       | 是枚举：`low` / `mid` / `high`                                                                                     |
| 三处调用方端点全是文档假设                    | 已对照 OpenAPI 实测修正（见下方真实端点）                                                                          |

### 真实 API 端点（OpenAPI 实测验证）

| 操作    | 端点                                               | 请求体                                          |
| ------- | -------------------------------------------------- | ----------------------------------------------- |
| 建库    | `PUT /v1/default/banks/{bank_id}`                  | `{}`                                            |
| retain  | `POST /v1/default/banks/{bank_id}/memories`        | `{"items":[{"content":"...","context":"..."}]}` |
| recall  | `POST /v1/default/banks/{bank_id}/memories/recall` | `{"query":"...","budget":"low"}`                |
| reflect | `POST /v1/default/banks/{bank_id}/reflect`         | `{"query":"..."}`                               |

> 助手侧实测补充（2026-10-10，详见 [scripts/assistant-probe.mjs](scripts/assistant-probe.mjs) 头注释）：
> 一条 retain 落 **2 条**（world + 派生 observation），`metadata` 只在 world 上、派生条为空，`tags` 两条都在；
> `tags_match` 默认 `any` 会捞出无标签条目，要「只要该 tag」必须显式传 `all_strict`；
> `delete` 单条 = `PATCH {"state":"invalidated"}`（可逆），**`DELETE {bank}/memories` 是清空整库**。

## 14. 接入点（已接线）

**流水线侧**

- **pipeline.md**：init recall / decisions retain / done reflect 人工门禁 / fixing retain / reviewer 画像
- **planner.md**：记忆冲突 → 升级为 M1/M2 编号问题
- **reviewer.md**：口味符合度 + 重复问题标记
- **stage/route.ts**：⑤ deploy 成功 → retain「已部署」状态
- 全程**软降级**：Hindsight 没起 → 返回空/跳过，绝不禁流水线

**助手侧**

- **assistant skill**：答题前 recall 已存结论 → 未命中走索引器现算；`store` 才 retain；`status`/`list`/`delete` 做查看与清理
- `scripts/assistant-{memo,map,probe}.mjs` 三个 CLI 承载全部读写
- 刻意**硬报错**：怕「以为在存其实没存」，不可达就非 0 退出 + 明说文档层不可用

## 15. 下一步

### Phase 2（流水线）

1. 跑一个真实需求走完整流水线，验证各阶段 recall/retain 是否按预期触发
2. 观察 recall 命中率，必要时调 budget 档位
3. 拍板 retain 积累 ≥10 条后，评估是否开 ◇ 线（①④⑥ 可选阶段）

### 助手层

P0–P4 已实施完毕（记忆 CLI / 项目地图 / 答题 skill / 按需存 / 端到端验收）。
设计原因见 [docs/assistant-agent-建设计划.md](docs/assistant-agent-建设计划.md)，分步做法见 [docs/assistant-agent-实施步骤.md](docs/assistant-agent-实施步骤.md)，
给同事看的操作手册见 [docs/assistant-使用说明.md](docs/assistant-使用说明.md)。对外窗口本期不做，只留口子。

---

# 第五部分：全景与定制

## 16. 项目全景

### 流程链（协作）

`xiaoqian-manager`(宿主) ↔ `AgentTeam`(`/pipeline` 剧本 + 4 subagent + pipeline-feed skill) ↔ `code-indexer` / `swagger-mcp-server`(②③步的眼睛)

### 助手链（独立）

`/assistant` skill (+ `assistant-qa` subagent) ↔ `code-indexer`(事实层，现算) ↔ `Hindsight`(文档层，`assistant-*` bank)

### 独立项目（不参与总流程）

| 项目       | 是什么                                                                                            | 状态                          |
| ---------- | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| [om/](om/) | 发版看板：按后端人员分组跟踪各前端项目发版（打包状态/版本号/进度），纯本地，数据在 `om/data.json` | 独立部署（`yarn om` → :3000） |

## 17. 定制

- **改 agent 行为**：编辑 `.claude/agents/*.md`（工具/权限/maxTurns prompt）。
- **改流程剧本**：编辑 `.claude/commands/pipeline.md`（委派话术、阶段、轨道约束）。
- **改喂食逻辑**：编辑 `.claude/skills/pipeline-feed/SKILL.md`。
- **改模板**：编辑 `docs/requirements/_template/*`。
- **改 ①④⑤⑥**：编辑 `xiaoqian-manager/`（`lib/server/git`、`lib/server/teamwork`、`components`）。
- **改助手行为**：编辑 `.claude/skills/assistant/SKILL.md`（编排）、`references/service-protocol.md`（答话协议）、`references/what-to-store.md`（存/不存判断）、`.claude/agents/assistant-qa.md`（隔离上下文）。
- 三个流水线 agent 统一 `permission: acceptEdits`，如要更严，单独收紧。

---

## 附：project-map / 平台产品 → gitlab 仓库 映射

> AgentTeam 喂食时据 PM 卡的「产品/模块 + 客户 + 标题关键词」查此表，决定 worktree 建在哪个 gitlab 仓库下。**由 张三 维护确认,AI 不猜。**
> 助手也用同一张表定位目标仓（只读）。

| 平台产品/模块        | 判断规则(标题关键词)              | 命中 → gitlab 仓库目录      | jenkins job      |
| -------------------- | --------------------------------- | --------------------------- | ---------------- |
| iHO-消毒供应系统     | 含「PDA」                         | → `iho-cssd-ui-mobile`      |                  |
|                      | 其他(含「PDA」之外的消毒供应需求) | → `iho-cssd-ui`             |                  |
| iHO-护理系统         | 含「护理大屏」                    | → `iho-nbs-web`             |                  |
|                      | 其他(含护理系统非大屏需求)        | → `iho-nurse-manager-ui`    |                  |
| iHO-输血管理系统     | (无条件)                          | → `reuseapp-blood-bank-web` |                  |
| iHO-重症监护临床系统 | (无条件)                          | → `iho-icis-ui`             |                  |
| iHO-护理管理系统     | (无条件)                          | → `iho-nurse-manager-ui`    |                  |
| iHO-不良事件上报     | (无条件)                          | → `iho-aers-web`            |                  |
| iHO-病理系统         | (无条件)                          | → `iho-pathology-ui`        |                  |
| iHO-病案管理         | (无条件)                          | → `iho-medical-record-ui`   | `iho-mrms-web`   |
| iHO-院感管理系统     | (无条件)                          | → `iho-haimis-ui`           | `iho-haimis-web` |
| iHO-医技工作站       | (无条件)                          | → `iho-medical-ui`          | `iho-treat-web`  |
| iHO-患者健康档案     | (无条件)                          | → `iho-ehr-ui`              | `iho-ehr-web`    |

jenkins 地址前缀：`http://192.168.1.120:9990/jenkins/job/<job名>`
