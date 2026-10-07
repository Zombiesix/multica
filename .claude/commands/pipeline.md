# pipeline - 前端需求流水线 orchestrator 剧本

> 本文件是主对话的「剧本」，不是调度引擎。主对话按此执行状态机，读取 `state.json` 决定下一步，再用下方委派模板调用 subagent。主对话不住任何上下文——每次交互结束把认知写 `orchestrator-log.md`，resume 时从文件重建。

## 启动 / 恢复

- 启动：`/pipeline A-001`
- 恢复：`/pipeline resume A-001`

主对话动作序：
1. 读 `state.json`，取 `tier`、`phase`、`lastAgent`、`iteration`。
2. 读 `progress.md`、`orchestrator-log.md` 重建认知。
3. `phase` 的值 = 下一步委托的 subagent。不猜，直接读。
4. 套用下方对应委派模板，只传路径，只收摘要。

## 各阶段委派模板

### init → 用 pipeline-feed skill 喂食（一句话接入）
会话开始时，若该需求尚未接入流水线（`state.json` 不存在 / 无 `docs/requirements/<别名>/`），调用 **pipeline-feed** skill，参数 = PM 计划文件路径（如 `get-plan/plans/<任务ID>.md`）。由 skill 完成脚手架：
- 抽字段 → 定别名 `R-<任务ID后6位>`
- 查 `project-map.md` 定 worktree（**基准分支：仓内有 `dev-zjb` 用 `dev-zjb`，否则用 `dev`**，非 master）
- 拷 `_template/` → 填 `context.md`（把 **需求标题 + 一句需求描述** 放最顶）、`tasks.md`、`decisions.md`(tier)、`state.json`(phase=planning 或 coding)
- 需求标题与一句需求描述进了 context.md 顶部，planner 据此快速理解，plan.md 生成更快更准
已接入则跳过，直接读 `state.json` 定下一步。

### planning → @planner（仅 full）
```
请作为 planner 处理需求 A-001。
- 读 context: docs/requirements/A-001/context.md
- 有不确定的问题按编号写入 questions.md 并暂停等答案
- 计划写入 plan.md，必须含「将改动文件清单」
- 改动敏感文件时写成 Q
返回:只一行摘要(plan.md 路径 + 问题数)
```

### plan_confirm → 主对话 + 张三
读 questions.md 展示 → 张三答 answers.md(按编号) → 确认拍板写 decisions.md(时间/决策/拍板人/原因)。

### coding → @coder
```
请作为 coder 实现需求 A-001。
- 读 plan.md、answers.md(修复轮改传 review.md、review-fix.md)
- 只读 plan 摘要与文件指针，不重扫全需求
- 每子任务更新 progress.md
- 跑 lint/test/build 写 test-report.md
返回:只摘要(进度 + 测试结果)
```

### code_review → @reviewer（仅 full）
```
请作为 reviewer 审查 A-001。
- 读 git diff 和 plan.md(含「将改动文件清单」)
- 对照 test-report.md 核验测试是否真实跑通
- 按 rubric 出 review.md，标记 blocker/suggestion/nit
返回:只摘要(blocker 数 + 其余条数)
```

### fixing → @coder（仅 full，有 blocker 时）
```
请作为 coder 修复 A-001 的 blocker。
- 只读 review.md、review-fix.md，只改 blocker，不读 plan.md
返回:只摘要(已修 blocker + 复测结果)
```
iteration+1；超 maxIteration(2) → 写 decisions.md 转人工。

### verify → @coder
```
请作为 coder 复验 A-001。
- 跑 lint/test/build，更新 test-report.md
返回:只摘要(是否全绿)
```
不全绿 → 回 coding/fixing；全绿 → done。

### done → 主对话
写 `worklog.md`、`state.json` 置 done → 张三验收 → 收尾：
1. 提交 worktree 分支：commit message **只含标题一行、不加任何正文/描述**，标题取 `context.md` 的**需求标题**（`feat(R-<别名>): <标题>`；标题含中文时写消息文件用 `-F`，勿经 bash 中文参数）。禁止再追加改动摘要类正文——commit 信息里除标题行外不得有其他行。
2. 合并回**固定分支**：仓内有 `dev-zjb` 用 `dev-zjb`，否则用 `dev`（非 master）→ `git merge feature/<别名>`
3. **删除 worktree 前先摘掉它指向主仓的 `node_modules` 符号链接**（`unlink <worktree>/node_modules`，若为链接）——`git worktree remove --force` 会顺着该链接删进主仓 node_modules，把主仓依赖清空。再 `git worktree remove --force ../<仓库>-<别名>`、`git branch -d feature/<别名>`。worktree 依赖一律走 pnpm 全局 store，禁止手动符号链接指回主仓工作树内部。
4. 清 `file-lock.md`。worktree 名即 `<仓库>-<别名>`。

## 轨道约束
- fail-safe：任何阶段拿不到预期产物 → 写 orchestrator-log 并停下来问张三，不硬猜继续。
- orchestrator 每次收到 subagent 摘要后，把「下一步 + 已知信息」写 orchestrator-log.md 再丢弃对话。
- **全局约束（对流水线主对话与所有 subagent 生效）**：
  1. **禁止更改 node / npm / yarn 版本**——不执行任何 `nvm use`、`node -v` 引发的变更、`npm`/`yarn`/`pnpm` 全局切换或 `engines`/`.nvmrc`/package.json 里的版本改动。版本锁定为现状。
  2. **涉及 `node_modules` 文件夹数据修改时，必须先严格提示**：在改动前明确打出一句「**因为 <原因> 需要进行 node_modules 修改**」（如依赖安装、重新构建、安装新包），并征得同意后才执行。不得静默 install / 改依赖 / 动 link、不得在收尾工作中顺手清改 node_modules（删 worktree 前对符号链接的 unlink 例外，见 done 阶段）。