# file-lock / 文件占用登记

> 并行需求仲裁依据。主对话建新需求前查这里确认不撞文件；planner plan.md 的「将改动文件清单」是锁的依据。done 收尾时清除。

| 文件 | 占用需求 | 状态 |
| ---- | -------- | ---- |
| `reuseapp-blood-bank-web/src/views/blood-system/components/CustomExtendField.vue` | R-016931 | 新建 |
| `reuseapp-blood-bank-web/src/views/blood-system/AddMatchTest.vue` | R-016931 | 改 |
| `reuseapp-blood-bank-web/src/views/blood-system/mixin/AddMatchForm.js` | R-016931 | 改 |