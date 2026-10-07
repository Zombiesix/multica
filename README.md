# multica / AgentTeam 工作区

`d:\multica` 是一个多项目工作区，装两类东西：

1. **AgentTeam 前端需求流水线**的基础设施 —— 一套基于 Claude Code subagent 三层隔离的需求流水线：一个需求 = 一个 git worktree + 一个独立会话；会话内按环节委派独立 subagent；一切信息通过 `docs/requirements/<ID>/` 落盘传递。
2. **周边工具子项目** —— 发版看板、swagger MCP、小千管理、小游导师、代码索引器（见「7. 子项目一览」）。

---

## 1. AgentTeam 是什么

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

---

## 2. 目录约定

分两层:**multica 家**(本目录)与 **worktree**(产品仓内,纯代码)。

**multica 家 `d:\multica`(会话开在这)**

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
om/                     发版看板(本地前端发版管理)
swagger-mcp-server/     swagger-multi MCP 补丁版服务器 + 全局配置说明
xiaoqian-manager/       小千管理(Next.js 任务/流程管理,端口 3010)
fe_project_mentor/      小游 · 前端项目导师(Next.js + Claude Agent SDK,端口 3003)
xiaoyou-code-indexer/   Vue3 仓库静态索引器(CLI + MCP)
```

**worktree(纯代码工作区)**

- 建在 `gitlab/<project-map 仓库目录>/` 下(与 multica 同级的 `gitlab/` 目录),只被 coder 读写;不进流程状态、不复制 `.claude/`、不复制 `docs/`。
- **基准分支(固定规则)**:仓内有 `dev-zjb` 用 `dev-zjb`,否则用 `dev`(非 master)。worktree 基于该分支创建,收尾合并回该分支。

**archive/(历史归档,禁区)**

- 存放已废弃的设计草稿(如旧版 `plan-record.md`、`README.txt`)。**仅供人工翻阅,禁止任何 agent 读/写,或作为当前需求依据。**
- 三道防线:`.gitignore` 排除(git 不追踪)+ `.claude/settings.json` deny 规则(拦 Read/Write/Edit/Glob)+ agent prompt 明令不读。改动 archive 需先临时调整 `settings.json` deny 再改。
- 若要给 archive 加说明文档,放本 README 或 `docs/` 下,**不要放 archive/ 内部**(禁写)。

---

## 3. 喂食一个需求(PM 任务 → 流水线输入)

> 喂食由 **pipeline-feed skill** 完成:会话内 `/pipeline <别名>` 时,若该需求尚未接入(无 `docs/requirements/<别名>/`),orchestrator 在 init 阶段自动调用 skill,参数 = PM 计划文件路径(如 `get-plan/plans/<任务ID>.md`)。skill 做的事:

1. **抽字段**:定别名 `R-<任务ID后6位>`(例 `R-013345`),提取产品/模块、客户、描述、附件链接。
2. **查 project-map**:按「产品/模块 + 标题关键词」映射到 gitlab 仓库目录,查不到/命中多条 → 向张三要,确认后回填,不许猜。基准分支按 `dev-zjb` 优先规则定。
3. **拷模板**:复制 `_template/` → `docs/requirements/R-013345/`,context.md 顶部放**需求标题 + 一句话需求描述**(planner 据此快速理解)。
4. **登记**:tasks.md 新行、state.json(phase=init)、decisions.md(tier 判定)、file-lock.md(已知文件先锁,未知留空待 planner 回填)。
5. **tier 建议**:改文案/单文件小修 → light;新增组件、动 store/表格/页面、多步任务 → full;拿不准标 full 并写明原因。
6. **到此为止** —— 不建 worktree、不动真实源码,回到流水线继续。

---

## 4. 使用(会话内)

> **执行模型**:会话开在 multica 的家(宿主编带 `.claude/` 和 `docs/`),**不**切到 worktree 开会话。worktree 只是 coder 写代码的工作区,agent 之间用绝对路径握手。会话内文档都在 `docs/requirements/<别名>/` 读,代码改动用 coder 传的 worktree 路径。

### 启动新需求

```bash
# 在 multica 家开会话(命令/agents/模板都在这里)
cd d:/multica && claude
```

### full 流程

```text
> /pipeline get-plan/plans/577476114790016931.md     # 未喂食过:feed 先接入
> /pipeline R-16931                                   # 已喂食:直接跑
```

主对话读 state → feed(如需)→ @planner 出计划(可能的 Q 等你在 `answers.md` 答)→ 你确认拍板 `decisions.md` → @coder 编码跑测 → @reviewer 审查 → blocker 回 @coder 修(≤2轮)→ verify → done。

### light 流程

```text
> /pipeline R-16931        # tier=light 时自动走 精简三段
```

直接 coding → verify → done,跳过 planner / plan_confirm / reviewer。

### 中断恢复

```text
> /pipeline resume R-16931
```

从 `state.json` + `orchestrator-log.md` 重建,丢弃旧上下文。

### 收尾(done)

验收 → 提交 → 合并回 **dev-zjb / dev** → 清 worktree:

```bash
# 1) 提交 worktree 分支(coder 已提交时跳过)
#    commit message 只含标题一行:feat(R-<别名>): <需求标题>,不加任何正文
#    标题含中文时写消息文件用 -F,勿经 bash 中文参数
cd ../<仓库>-<别名>
git add -A && git commit -F <消息文件>

# 2) 回主仓,合并回固定分支(仓内有 dev-zjb 用 dev-zjb,否则用 dev,非 master)
cd ../<仓库>
git merge feature/<别名>

# 3) 删除 worktree 前先摘掉它指向主仓的 node_modules 符号链接!
#    git worktree remove --force 会顺着链接删进主仓 node_modules
unlink <worktree>/node_modules        # 若为链接
git worktree remove --force ../<仓库>-<别名>
git branch -d feature/<别名>
```

随后:清 `file-lock.md` → 回填 `worklog.md` 工时 → state 置 done。

---

## 5. 门禁清单(每次跑都要盯)

1. light/full 在 init 定,写 `decisions.md`
2. plan 未确认不得编码(full)
3. reviewer 有 blocker 必须回 coder 修(full)
4. 修复 ≤ 2 轮,超了转人工
5. 每步产物必须落盘
6. 每需求独立 worktree + 独立会话
7. coder 不跨 worktree
8. subagent 只收摘要,不接完整代码/推理
9. 敏感文件(.env\*/auth.txt)必须人工审批
10. 人工验收后才提交合并,随后清理 worktree

**全局约束(对流水线主对话与所有 subagent 生效)**:

- **禁止更改 node / npm / yarn 版本**——不执行 `nvm use`、全局切换或 `engines`/`.nvmrc`/package.json 里的版本改动。版本锁定为现状。
- **涉及 `node_modules` 数据修改时,必须先严格提示**——改动前明确打出「**因为 <原因> 需要进行 node_modules 修改**」并征得同意后才执行;不得静默 install / 改依赖 / 动 link(done 阶段删 worktree 前的 unlink 例外)。

---

## 6. 并行与秘密

- 并行前先查 `file-lock.md`;planner 的 plan.md「将改动文件清单」是锁依据。
- 改动触及 `.env*` 等敏感文件 → planner 升级成 Q → 你 `decisions.md` 审批。
- 同项目同文件的需求不建议并行。

---

## 7. 子项目一览

| 目录                                           | 是什么                                                                                                                                            | 怎么跑                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [om/](om/)                                     | 发版看板:按后端人员分组跟踪各前端项目发版(打包状态/版本号/进度),纯本地,数据在 `om/data.json`                                                      | `yarn om` → http://localhost:3000                                     |
| [swagger-mcp-server/](swagger-mcp-server/)     | swagger-multi MCP **补丁版**服务器(URL 解析截断、非法 JSON 两个 bug 的修复)及全局 MCP 配置说明,覆盖 nursing(10 分组)/icis/treat/cssd 共 13 个服务 | 配置写入用户全局 `~/.claude.json`,重启 Claude Code 生效;详见其 README |
| [xiaoqian-manager/](xiaoqian-manager/)         | 小千管理:Next.js 任务/流程管理(flow/task/timesheet/sync)                                                                                          | `yarn dev`(端口 3010)                                                 |
| [fe_project_mentor/](fe_project_mentor/)       | 小游 · 前端项目导师:能带人读懂陌生前端项目并让理解沉淀成团队资产的 Agent(产物驱动 + 复述检验),基于 Claude Agent SDK                               | `yarn dev`(端口 3003);scan/teach/deliver 等脚本见其 package.json      |
| [xiaoyou-code-indexer/](xiaoyou-code-indexer/) | Vue3 仓库静态索引器:扫描目标仓生成 ProjectMap(路由/模块/API 域/组件图/告警),CLI 或 stdio MCP 供 Agent 消费                                        | `node bin/cli.mjs <cmd> <repo>`;MCP 接入见其 README                   |

> 注意:swagger-mcp-server 与 xiaoyou-code-indexer 的 README 中历史路径仍写 `D:\agent-work\...`,即本工作区旧路径,等价于现在的 `d:\multica`。

---

## 8. 定制

- **改 agent 行为**:编辑 `.claude/agents/*.md`(工具/权限/maxTurns prompt)。
- **改流程剧本**:编辑 `.claude/commands/pipeline.md`(委派话术、阶段、轨道约束)。
- **改喂食逻辑**:编辑 `.claude/skills/pipeline-feed/SKILL.md`。
- **改模板**:编辑 `docs/requirements/_template/*`。
- 三个 agent 统一 `permission: acceptEdits`,如要更严,单独收紧。
