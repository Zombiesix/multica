# AgentTeam / 前端开发自动化工作流

一套基于 Claude Code subagent 三层隔离的前端需求流水线。一个需求 = 一个 git worktree + 一个独立会话;会话内按环节委派独立 subagent;一切信息通过 `docs/requirements/<ID>/` 落盘传递。

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

分两层:**AgentTeam 家**(本目录)与 **worktree**(产品仓内,纯代码)。

**AgentTeam 家 `d:/agent-work`(会话开在这)**

```text
project-map.md          平台产品 → gitlab 仓库映射(张三维护,喂食用)
tasks.md                需求元信息表(含 tier)
file-lock.md            并行冲突仲裁表
docs/requirements/
  _template/            10+ 个空白模板,喂食从这里复制
  <R-xxxxx>/            context.md questions.md answers.md plan.md
                        decisions.md progress.md review.md review-fix.md
                        test-report.md worklog.md orchestrator-log.md
                        state.json
```

**worktree(纯代码工作区)**

- 建在 `<project-map 仓库目录>/` 下,只被 coder 读写;不进流程状态、不复制 `.claude/`、不复制 `docs/`。

**archive/(历史归档,禁区)**

- 存放已废弃的设计草稿(如旧版 `plan-record.md`、`README.txt`)。**仅供人工翻阅,禁止任何 agent 读/写,或作为当前需求依据。**
- 三道防线:`.gitignore` 排除(git 不追踪)+ `.claude/settings.json` deny 规则(拦 Read/Write/Edit/Glob)+ agent prompt 明令不读。改动 archive 需先临时调整 `settings.json` deny 再改。
- 若要给 archive 加说明文档,放本 README 或 `docs/` 下,**不要放 archive/ 内部**(禁写)。

---

## 3. 喂食一个需求(把 PM 任务变成流水线输入)

> 喂食是**启动会话前**在主仓库做的固定动作,不是主线会话干的事。

PM 任务文件(如 `get-plan/plans/577476114790016931.md`)→ 流水线:

1. **定别名**:取任务/查询ID 生成 `R-<后6位>`(例 `R-013345`)。
2. **查 project-map**:按「产品/模块 + 客户」映射到 gitlab 仓库目录,查不到向 张三 要。
3. **拷模板**:复制 `_template/` → `docs/requirements/R-013345/`。
4. **填 context.md**:PM 的「问题描述」「分配任务说明」+ 截图链接 → 需求描述。
5. **填 tasks.md**:新开一行(项目 / 优先级 / tier / worktree / 状态 / 入口),worktree 列 = `<gitlab 仓库目录名>-<别名>`(例 `iho-cssd-ui-mobile-R-013345`)。
6. **定 tier 写 decisions.md**:按「七、Tier 决策表」拍板。
7. **初始化 state.json**:requirement=`R-013345`, phase=init, tier 已定。
8. **登记 file-lock.md**:若已知改动文件先锁定(未知留空,planner 后回填)。
9. 建议先跑 `full` 流程一次验证跳转,(可选)再跑一次 `light` 空跑。

---

## 4. 使用(会话内)

> **执行模型**:会话开在 AgentTeam 的家(宿主编带 `.claude/` 和 `docs/`),**不**切到 worktree 开会话。worktree 只是 coder 写代码的工作区,agent 之间用绝对路径握手。会话内文档都在 `docs/requirements/<别名>/` 读,代码改动用 coder 传的 worktree 路径。

### 启动新需求

```bash
# 1) 在 AgentTeam 家开会话(命令/agents/模板都在这里)
cd d:/agent-work && claude
# 2) 会话内:先建需求(worktree 由 feed/init 规划,不在此手工)
```

### 准备 worktree(先建好,会话内只传路径)

```bash
cd gitlab/<project-map 仓库目录>            # 例 cd gitlab/iho-cssd-ui
# worktree 命名为 <仓库>-<别名>,防重名、好识别 → 例 iho-cssd-ui-R-001
git worktree add ../<仓库>-<别名> -b feature/<别名>
```

### 收尾(done)

验收后:coder 分支改动 → **合并回主仓** → 提交代码 → **清空 worktree**:

```bash
# 1) 提交 worktree 分支的改动(coder 已提交时跳过)
cd ../<仓库>-<别名>
git add -A && git commit -m "feat(<别名>): ..."

# 2) 回主仓,合并
cd ../<仓库>
git merge <仓库>/feature/<别名>             # 或 git merge feature/<别名>

# 3) 清理 worktree 与分支
git worktree remove ../<仓库>-<别名>         # 清理 worktree 目录
git branch -d feature/<别名>                 # 删除已合并分支
```

> 合并到主仓默认分支(master/main)后即完成交付。是否推送远端出 MR,按团队推送/审查流程执行(流水线中的「提交 MR」即为这一步)。

### full 流程

```text
> /pipeline R-16931
```

主对话读 state → `@planner` 出计划(可能的 Q 等你在 `answers.md` 答)→ 你确认拍板 `decisions.md` → `@coder` 编码跑测 → `@reviewer` 审查 → blocker 回 `@coder` 修(≤2轮)→ verify → done。

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

验收 → 提交 MR → `git worktree remove` → 清 `file-lock.md` → 回填 `worklog.md` 工时。

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
10. 人工验收后才提交 MR,随后清理

---

## 6. 并行与秘密

- 并行前先查 `file-lock.md`;planner 的 plan.md「将改动文件清单」是锁依据。
- 改动触及 `.env*` 等敏感文件 → planner 升级成 Q → 你 `decisions.md` 审批。
- 同项目同文件的需求不建议并行。

---

## 7. 定制

- **改 agent 行为**:编辑 `.claude/agents/*.md`(工具/权限/maxTurns prompt)。
- **改流程剧本**:编辑 `.claude/commands/pipeline.md`(委派话术、阶段、轨道约束)。
- **改模板**:编辑 `docs/requirements/_template/*`。
- 三个 agent 统一 `permission: acceptEdits`,如要更严,单独收紧。
