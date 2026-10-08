# multica / AgentTeam 前端研发流水线

`d:\multica` 是一条**前端需求研发的完整流水线工作区**。它把「获取需求 → AI 写代码 → 人工测试 → 提交合并 → 填工时」串成一个闭环，由两个部分配合完成：

1. **xiaoqian-manager（小千管理）** —— 可视化 Web 项目，是**整个流程的宿主**。需求获取、人工测试、提交合并、填工时都在这里点，`小前端` 是操作人/研发人。
2. **AgentTeam** —— 核心 AI 编码引擎。需求里的"规划 + 写代码 + 审查 + 修复"两大步由它基于 Claude Code subagent 三层隔离完成，通过文件落盘驱动。

---

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

| 步骤 | 做什么 | 在哪执行 | 由谁操作 | 说明 |
|---|---|---|---|---|
| **① 获取需求** | 从协作平台(teamwork)拉取需求列表/详情入库 | xiaoqian-manager | 小前端 点击同步 | 过滤条件 `user=小前端`，落盘 `tasks.json` |
| **②③ 规划+编码 / 审查+修复（AgentTeam）** | AI 出计划 → 人工拍板 → 写代码 → 审查 → 修复 | multica 家 `/pipeline` 剧本 | AI + 小前端拍板 | **只用 xiaoyou-code-indexer、swagger-mcp-server 洞察代码** |
| **④ 人工测试** | 在浏览器/页面做人工效果测试 | xiaoqian-manager test 阶段 | 小前端 点完成 | 通过才进入下一步 |
| **⑤ 提交合并** | 手工把代码提交、合并到远程 | xiaoqian-manager deploy 阶段 | 小前端 手动点完成 | 选仓库 + 目标分支，触发 git 提交推送/cherry-pick |
| **⑥ 填工时** | 把本次研发工时写回协作平台 | xiaoqian-manager 工时 | 小前端 触发 | 复用协作平台登录态 |

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

## 3. 周边工具（喂给 ②③ 步的"眼睛"）

AgentTeam 在规划/写码时靠这两个工具洞察陌生代码：

| 工具 | 干什么 | 怎么跑 |
|---|---|---|
| **xiaoyou-code-indexer** | Vue3 仓库静态索引器：扫目标仓生成 ProjectMap（路由/模块/API 域/组件图/告警），CLI 或 stdio MCP 供 Agent 消费 | `node bin/cli.mjs <cmd> <repo>` |
| **swagger-mcp-server** | swagger-multi MCP **补丁版**服务器（修复 URL 解析截断、非法 JSON 两个 bug），覆盖 nursing(10 分组)/icis/treat/cssd 共 13 个服务，给 Agent 喂实时 API 文档 | 配置写入用户全局 `~/.claude.json`，重启生效 |

---

## 4. 目录约定

分两层：**multica 家**（本目录，AgentTeam 会话开在这）与 **worktree**（产品仓内，纯代码）。

**multica 家 `d:\multica`**

```text
project-map.md          平台产品 → gitlab 仓库映射(张三维护,喂食用)
tasks.md                需求元信息表(含 tier)
file-lock.md            并行冲突仲裁表
package.json            工作区脚本(如 `yarn om` 启动发版看板)
docs/requirements/
  _template/            10+ 个空白模板,喂食从这里复制
  <R-xxxxx>/            context.md questions.md answers.md plan.md
                        decisions.md progress.md review.md review-fix.md
                        test-report.md worklog.md orchestrator-log.md
                        state.json
xiaoqian-manager/       小千管理(Next.js) —— 全部流程的宿主(①④⑤⑥)
xiaoyou-code-indexer/   Vue3 仓库静态索引器(CLI + MCP),②③步用
swagger-mcp-server/     swagger-multi MCP 补丁版服务器,②③步用
om/                     发版看板(独立,见 §7)
fe_project_mentor/      小游导师(独立,暂缓,见 §7)
```

**worktree（纯代码工作区）**

- 建在 `gitlab/<project-map 仓库目录>/` 下（与 multica 同级的 `gitlab/` 目录），只被 coder 读写；不进流程状态、不复制 `.claude/`、不复制 `docs/`。
- **基准分支（固定规则）**：仓内有 `dev-zjb` 用 `dev-zjb`，否则用 `dev`(非 master)。worktree 基于该分支创建，收尾合并回该分支（**本地合并，见 §1 边界**）。

**archive/（历史归档,禁区）**

- 存放已废弃的设计草稿。**仅供人工翻阅,禁止任何 agent 读/写,或作为当前需求依据。**
- 三道防线：`.gitignore` 排除 + `.claude/settings.json` deny 规则(拦 Read/Write/Edit/Glob) + agent prompt 明令不读。改动 archive 需先临时调整 `settings.json` deny 再改。
- 若要给 archive 加说明文档，放本 README 或 `docs/` 下。

---

## 5. xiaoqian-manager 各项功能对应的代码位置

| 总流程步骤 | 触发点 | 实现位置 |
|---|---|---|
| ① 获取需求 | 同步按钮(Sync) | `lib/server/teamwork/client.ts`(fetchList,user=小前端) + `mapper.ts` → `data/tasks.json` |
| ②③ 规划+编码+审查+修复 | 卡片→worktree 路径给 AgentTeam | 见 §2；`/pipeline` 剧本 + 4 subagent |
| ④ 人工测试 | test 阶段 点完成 | `components/task/StageSheet.tsx`(test stage) |
| ⑤ 提交合并 | deploy 阶段 选仓库+目标分支 点完成 | `lib/server/git/deploy.ts`(pull→commit→push→cherry-pick→push) |
| ⑥ 填工时 | 工时入口 | `lib/server/teamwork/client.ts` 的 `saveWorkHours` |

---

## 6. 门禁清单 + 全局约束

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

## 7. 项目全景

### 流程链（协作）

`xiaoqian-manager`(宿主) ↔ `AgentTeam`(`/pipeline` 剧本 + 4 subagent + pipeline-feed skill) ↔ `xiaoyou-code-indexer` / `swagger-mcp-server`(②③步的眼睛)

### 独立项目（不参与总流程）

| 项目 | 是什么 | 状态 |
|---|---|---|
| [om/](om/) | 发版看板：按后端人员分组跟踪各前端项目发版（打包状态/版本号/进度），纯本地，数据在 `om/data.json` | 独立部署（`yarn om` → :3000） |
| [fe_project_mentor/](fe_project_mentor/) | 小游 · 前端项目导师：能带人读懂陌生前端项目并让理解沉淀成团队资产 | **暂时不考虑，后面得改** |

---

## 8. 定制

- **改 agent 行为**：编辑 `.claude/agents/*.md`（工具/权限/maxTurns prompt）。
- **改流程剧本**：编辑 `.claude/commands/pipeline.md`（委派话术、阶段、轨道约束）。
- **改喂食逻辑**：编辑 `.claude/skills/pipeline-feed/SKILL.md`。
- **改模板**：编辑 `docs/requirements/_template/*`。
- **改 ①④⑤⑥**：编辑 `xiaoqian-manager/`（`lib/server/git`、`lib/server/teamwork`、`components`）。
- 三个 agent 统一 `permission: acceptEdits`，如要更严，单独收紧。

---

## 9. Hindsight 记忆系统（Phase 1 已上线）

> 给 6 步流水线加"学习型记忆"：人工的拍板、纠正、否决理由沉淀为 Agent 可检索记忆，
> 让第 N+1 个需求吃到前 N 个的人工经验。方案文档见
> [docs/hindsight-实施方案.md](docs/hindsight-实施方案.md)。

### 架构（本机 Docker 一容器搞定）

```text
┌─ Docker 容器 hindsight:slim（API :8888 / UI :9999，--restart unless-stopped）┐
│   内置 PostgreSQL + pgvector（卷 hindsight-data）                              │
│   LLM 抽取 = 火山方舟 deepseek-v4.1-flash（Agent Plan Key）                   │
│   Embedding  = 硅基流动 BAAI/bge-m3 1024维（免费）                            │
│   Reranker = rrf（纯算法，零外部依赖）                                        │
└──────────┬───────────────────────────────────────────────────────────────────┘
           │ REST :8888
  ┌────────┴──────────────────────────────────────────┐
  │ AgentTeam 侧: scripts/hindsight-memo.py（CLI 三命令）│
  │ Web 侧: xiaoqian-manager/lib/server/hindsight/client.ts │
  └─────────────────────────────────────────────────────┘
```

### 部署步骤（已完成，2026-10-08）

1. `yarn setup` —— 自动生成 `scripts/hindsight.env`（从 [hindsight.env.example](scripts/hindsight.env.example) 复制，模板已入库），填入你的 Ark Plan Key + SiliconFlow Key
2. `docker pull ghcr.nju.edu.cn/vectorize-io/hindsight:latest-slim`（ghcr.io 被墙，用南大镜像）
3. `docker run -d --name hindsight --restart unless-stopped -p 8888:8888 -p 9999:9999 --env-file scripts/hindsight.env -v hindsight-data:/home/hindsight/.pg0 hindsight:slim`
4. `python scripts/ensure-banks.py`（建 li-expertise / multica-project / iho-cssd-ui 3 库 + 预填 5 条静态规矩）

> 模板里每个变量都有注释说明来源和注意事项；key 只留本地 `hindsight.env`，已被 gitignore。

重启电脑后 Docker Desktop 自启 → 容器自动拉起，无需人工干预。

### 踩过的坑（都排掉了）

| 坑 | 解法 |
|---|---|
| npm 全局装过同名 `docker` 文档生成器，抢 PATH | 管理员 PowerShell 删 shim |
| ghcr.io 国内被墙 | `ghcr.nju.edu.cn` 南大镜像 |
| 完整版镜像 9GB | slim 版 1.88GB + 外部 embedding 服务 |
| 方舟 Plan Key 路径隔离 | 只在 `/api/plan/v1` 有效，标准 `/api/v3` 一律 401 |
| 方舟 embedding 全不能用 | 250515 即将下线；vision-251215 是多模态专用 API 格式不兼容；Plan Key 调不了 embeddings → **换 SiliconFlow bge-m3** |
| pgvector HNSW 索引上限 2000 维 | bge-m3 原生 1024 维，天然合规 |
| `RERANKER_PROVIDER=none` 启动报错 | 合法值没有 none，用 `rrf` |
| recall/reflect 的 `budget` 传数字报 422 | 是枚举：`low` / `mid` / `high` |
| 三处调用方端点全是文档假设 | 已对照 OpenAPI 实测修正（见下方真实端点） |

### 真实 API 端点（OpenAPI 实测验证）

| 操作 | 端点 | 请求体 |
|---|---|---|
| 建库 | `PUT /v1/default/banks/{bank_id}` | `{}` |
| retain | `POST /v1/default/banks/{bank_id}/memories` | `{"items":[{"content":"...","context":"..."}]}` |
| recall | `POST /v1/default/banks/{bank_id}/memories/recall` | `{"query":"...","budget":"low"}` |
| reflect | `POST /v1/default/banks/{bank_id}/reflect` | `{"query":"..."}` |

### 接入点（已接线）

- **pipeline.md**：init recall / decisions retain / done reflect 人工门禁 / fixing retain / reviewer 画像
- **planner.md**：记忆冲突 → 升级为 M1/M2 编号问题
- **reviewer.md**：口味符合度 + 重复问题标记
- **stage/route.ts**：⑤ deploy 成功 → retain「已部署」状态
- 全程软降级：Hindsight 没起 → 返回空/跳过，绝不禁流水线

### 下一步（Phase 2）

1. 跑一个真实需求走完整流水线，验证各阶段 recall/retain 是否按预期触发
2. 观察 recall 命中率，必要时调 budget 档位
3. 拍板 retain 积累 ≥10 条后，评估是否开 ◇ 线（①④⑥ 可选阶段）

---

## 附：project-map / 平台产品 → gitlab 仓库 映射

> AgentTeam 喂食时据 PM 卡的「产品/模块 + 客户 + 标题关键词」查此表，决定 worktree 建在哪个 gitlab 仓库下。**由 张三 维护确认,AI 不猜。**

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