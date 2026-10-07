---
name: folder-docs
description: 为组件/文件夹编写「AI 友好文档」：在同级目录生成精简的 README.md 并给每个文件补充代码注释。Use when the user asks to 添加 README、整理文件夹文档、给组件/文件加注释、沿用同样的格式文档化、编写组件说明文档。触发词：README、文档化、整理文档、添加注释。
---

# 文件夹文档化（folder-docs）

## 目标

让 AI 读到文件夹级 README 就能高效、快速了解整个文件夹；用到具体实现时，再读每个文件中变量/方法的注释。分两层：

1. **文件夹同级 README.md** —— 整体概览（每个文件的职责、业务逻辑/用法、文件关系网）
2. **代码内注释** —— 每个文件的变量、方法等细节

**README 保持精简、尽量少包含具体代码块**（因为代码后续大概率会变，写死容易过期）。

## 步骤

### 1. 先摸清文件夹

- 列出文件夹内所有文件（Glob `**/*`），判断每个文件的类型：
  - **业务组件**（页面/容器，通常是 index.vue）→ README 中描述大致业务逻辑
  - **功能组件**（弹窗、表单等可复用组件）→ README 中描述使用方式 + 业务逻辑
  - **非组件文件**（hook / 工具 / 常量 / 配置 / 样式）→ README 中描述具体功能
- 快速浏览每个文件（不必深究引用文件内部逻辑），确认：它 import 了什么、被谁引用、对外 emit / expose / defineExpose 什么。

### 2. 写 README.md（放到文件夹同级目录）

建议结构（可随模块增删）：

```markdown
# 模块名（目录名）

一句话：这个模块是干什么的。

## 目录结构
| 文件 | 类型 | 说明 |
| --- | --- | --- |

## index.vue — 页面/组件名
（业务组件：页面分区、操作流程、数据流；功能组件：由谁打开/传入什么/成功回调）

## 其余文件（每个都写一段）
…

## 文件关系网
（简单文字树/箭头，标注 openModal、emit 回调、父-子渲染关系）

## 主要外部依赖及用途（可选）
| 模块 | 用途 |
```

要点：
- **不粘代码块**：避免贴 `const xxx = ...`、函数签名；可用极少量必要字段名/枚举名，但要意识到它们会变。
- **引用文件只写用途**：如"引用了 A，它是为了查询 xx 数据"，不写具体怎么查、内部实现。
- **文件关系网**：用简单文字树/箭头描述文件之间的调用、回调关系。
- 子目录已有 README 时用相对链接互相指向。

### 3. 给每个文件补注释

- 给**变量 / ref / computed / reactive**、**函数 / 方法**、**非显而易见的逻辑**补简短中文注释（与项目一致）。
- 行尾注释或方法上方单行注释，不写大段文档注释。
- 项目内弹窗管理 hook（use-a-modal / use-ur-modal / use-sign-modal / use-inventory-modal）是统一重复模式，注释可统一格式：`modalList`（已打开弹窗列表）、`globalModalConfigs`（枚举 → 懒加载组件映射）、`openModal`（实例化追加列表、afterLeave 移除、onRegister 打开传参）。
- 只加注释，不改代码逻辑。

## 项目内示例

本仓库已按此格式文档化的目录（可作格式参考）：
- `src/views/department-supply/application/README.md`
- `src/views/department-supply/use-record/README.md`
- `src/views/department-supply/use-registration/README.md`
- `src/views/department-supply/Inventory-manage/README.md`

## 注意事项

- 不深挖引用文件的内部实现，只判断用途（服务、组件、工具等）。
- IDE 报出的 Hint / 未使用变量若是原有代码问题，与注释无关，可提醒但不改动。
- README 只放"会稳定的"信息（文件职责、业务逻辑、关系网）；易变的实现细节放代码注释。
