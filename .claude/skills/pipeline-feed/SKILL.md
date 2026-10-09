---
name: pipeline-feed
description: AgentTeam 前置喂食器——把一份 PM 需求/任务 markdown(plan 文件)映射进流水线,生成 docs/requirements/<别名>/ 需求目录并登记 tasks.md. 触发词:喂食、喂给流水线、feed、接入需求、把这个需求弄进流程。
---

# pipeline-feed / AgentTeam 需求喂食器

把一份 PM 计划文件(如 `xiaoqian-manager/data/temp/<任务ID>.md`)转成流水线可消费的需求目录。这是**启动会话前**的固定动作,不是流水线本身,也不建 worktree、不提交代码。

> 计划文件是**临时文件**,统一放 `xiaoqian-manager/data/temp/`,读完即弃、不长期保留,别往里面写回任何结论。两种来源:
> - **任务ID 流程**:xiaoqian-manager「开始」按钮预生成的 `<任务ID>.md`;
> - **口头流程**:pipeline 主对话把 `/pipeline <描述>` 的原文落盘的 `R-oral-<MMDDHHmm>.md`(文件名即别名)。

## 输入

- 一份 PM 任务 md(必填)。可能含字段:查询ID、任务ID、产品/模块、客户、创建/执行人、计划时间、状态、研发阶段、任务类型、难度、最大工时、版本、问题描述、分配任务说明、轨迹、附件链接。
- (可选)用户给的需求别名;没给就用规则生成。

## 步骤

### 1. 读源文件并抽字段
整个读取 PM 文件,提取:
- 别名,三选一(优先级从高到低):用户显式给的别名 > 口头临时文件(文件名即别名,如 `R-oral-10091130`)> `R-<任务ID后6位>`。
- 关联:`查询ID` 一并记录,tasks.md 里用于追溯(口头需求没有,留空,不许编造)。
- 元信息:产品/模块、客户、执行人、状态、版本、难度、最大工时。
- 描述:`问题描述` 及 `分配任务说明` 正文。
- 附件:所有图片/CDN 链接,原样保留。

### 2. 查映射定 worktree
- 读 `project-map.md`,按 PM 卡「产品/模块 + 标题」查对应 gitlab 仓库目录:
  - 表中有「判断规则」的行,**按标题关键词匹配**(如消毒供应含「PDA」→ `iho-cssd-ui-mobile`,护理系统含「护理大屏」→ `iho-nbs-web`)。
  - 命中失败 / 命中多条 / 一产品多仓 → 向 张三 要,确认后回填 `project-map.md`,不许猜。
- 采集需求标题用于判断;worktree 名 = `<gitlab 仓库目录名>-<别名>`(例 `iho-cssd-ui-mobile-R-013345`),防重名、好识别。
- **基准分支(固定规则)**:仓内有 `dev-zjb` 用 `dev-zjb`,否则用 `dev`(非 master)。worktree 基于该分支创建,收尾合并回该分支。

### 3. 生成需求目录(脚手架)
复制 `docs/requirements/_template/` → `docs/requirements/<别名>/`,逐个替换 `{REQUIREMENT_ID}` 占位符。

### 3. 逐文件填写
- **context.md**:顶部先写 **需求标题**(= PM 文件首行 `# ` 标题,如 `医生站输血医嘱界面血液分类和排序`)+ **需求描述(一句话)**(由标题/问题描述浓缩,供 planner 快速理解);正文 `需求描述(全文)`=`问题描述`+`分配任务说明`;附上图片链接;`需求来源`=PM 文件路径;`关联代码位置` 若用户没给就空着,planner 会补。
- **tasks.md**:path 为 `docs/requirements/<别名>/`;追加一行:
  - 需求ID=`<别名>`,项目=`产品/模块`,优先级/状态 照抄(无则占位),tier 先标**待定**,worktree=`<gitlab 仓库目录名>-<别名>`(例 `iho-cssd-ui-mobile-R-013345`),入口=`/pipeline <别名>`。
- **state.json**:requirement=`<别名>`;tier 照 tasks.md;phase=init;updatedAt=现在。
- **decisions.md**:加一行 tier 判定(原因=难度/任务类型/是否动页面)。若 tier 不确定,留占位并按住键等我确认。
- **file-lock.md**:若改动文件已知则登记;未知留空注明「待 planner 出 plan 后回填」。
- questions/answers/progress/review/review-fix/test-report/worklog 保持模板空白,不填。

### 4. tier 建议(写到 decisions.md 并在回复里给我)
| 信号 | tier |
| ---- | ---- |
| 改文案/样式/单文件小修、难度低 | light |
| 新增组件、动 store/表格/页面、难度中上、任务类型含多步 | full |

拿不准就标 full,并把「为什么不标 light 的原因」写进 decisions.md。

### 5. 汇报(不越权)
返回一段概况:别名、产品/模块、需求一句话、**我建议 tier=xxx 及理由**、已生成哪些文件、需要我确认/补填的点。**到此为止** —— 不建 worktree、不克隆、不跑流水线、不动真实源码。

## 注意事项

- 这是纯脚手架 + 字段映射,**不改任何产品代码**。
- 若 `docs/requirements/_template/` 不存在,提示先建模板再跑。
- 敏捷陷阱:别把 PM 原文整段塞进 tasks.md(那是元信息表),正文进 context.md,元信息进 tasks.md。
- 源文件图片无法本地访问时,保留链接不做猜测补充。