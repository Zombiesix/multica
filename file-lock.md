# file-lock / 文件占用登记

> 并行需求仲裁依据。主对话建新需求前查这里确认不撞文件；planner plan.md 的「将改动文件清单」是锁的依据。done 收尾时清除。
>
> **同仓串行（硬规则）**：改动直接落在主仓工作区，同仓两个需求会互相污染，**同一仓库同一时间只能跑一个需求**。
> 并行只在不同仓之间成立；开工门禁（工作区必须干净）会自动拦住同仓并行的第二个需求。

| 文件 | 占用需求 | 状态 |
| ---- | -------- | ---- |
| `reuseapp-blood-bank-web/src/views/blood-system/components/CustomExtendField.vue` | R-016931 | 新建 |
| `reuseapp-blood-bank-web/src/views/blood-system/AddMatchTest.vue` | R-016931 | 改 |
| `reuseapp-blood-bank-web/src/views/blood-system/mixin/AddMatchForm.js` | R-016931 | 改 |