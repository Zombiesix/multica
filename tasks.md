# tasks

> 需求元信息表。tier 在 init 阶段由张三拍板，写进该需求 decisions.md。
> **仓库**列 = `gitlab/` 下的仓库目录名（不是 worktree 名——2026-10-12 起改动直接落在该仓固定分支工作区）。`recon.mjs` 靠这一列定位仓库。

| 需求ID | 项目 | 优先级 | tier | 仓库 | 状态 | 入口 |
| ------ | ---- | ------ | ---- | -------- | ---- | ---- |
| A-001  | project-a | P0 | full | project-a | 待开始 | /pipeline A-001 |
| R-952512 | iHO-输血管理系统 | 待处理 | full | reuseapp-blood-bank-web | 已完成 | /pipeline R-952512 |
| R-016931 | iHO-输血管理系统 | 待处理 | full | reuseapp-blood-bank-web | 待验收 | /pipeline R-016931 |
| R-371467 | iHO-护理管理系统 | 待处理 | full | iho-nurse-manager-ui | 已完成 | /pipeline R-371467 |
| R-oral-10091133 | iHO-不良事件上报 | 待处理 | light | iho-aers-web | 已完成 | /pipeline R-oral-10091133 |
| R-154886 | iHO-护理系统 | 待处理 | light | iho-nurse-manager-ui | 已完成 | /pipeline R-154886 |
| R-034684 | iHO-护理管理系统 | 待处理 | full | iho-nurse-manager-ui | 待验收 | /pipeline R-034684 |