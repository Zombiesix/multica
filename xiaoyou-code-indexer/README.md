# xiaoyou-code-indexer

Vue3 仓库静态索引器：扫描目标仓生成 ProjectMap（路由表 / 业务模块 / API 域 / 组件图 / 静态告警），供 Claude Code 或其它 Agent 以 MCP 工具或 CLI 的方式消费。

从 fe_project_mentor 提取，零业务耦合。npm 依赖仅 typescript、@vue/compiler-sfc、@vue/compiler-dom（peerDependencies）。

## CLI

```bash
node bin/cli.mjs <cmd> <repo> [...args]
# 或全局链接后: xiaoyou-index <cmd> <repo>
```

| 命令                                     | 说明                                                   |
| ---------------------------------------- | ------------------------------------------------------ |
| `scan <repo>`                            | 完整 ProjectMap JSON（体积大，谨慎直接喂模型）         |
| `map <repo>`                             | 项目全貌摘要（路由/模块/API 域/告警，推荐给 Agent 用） |
| `trace <repo> <route\|module>`           | 追一条链路：路由 → 组件树 → API 域 → 后端端点          |
| `warnings <repo> [--kind K] [--limit N]` | 静态告警列表                                           |
| `search <repo> <keyword>`                | 按关键词查路由/模块/端点                               |
| `stats <repo>`                           | 扫描规模与耗时（探活）                                 |
| `rescan <repo>`                          | 清缓存重扫                                             |
| `serve <repo>`                           | 启动 stdio MCP server                                  |

全部输出 JSON；加 `--compact` 输出紧凑单行。

注意：Git Bash 下传 `/route-path` 会被 MSYS 转成 Windows 路径，加 `MSYS_NO_PATHCONV=1` 前缀。

## MCP server 接入（Claude Code）

在目标项目的 `.mcp.json` 中加入：

```json
{
  "mcpServers": {
    "xiaoyou-indexer": {
      "command": "node",
      "args": [
        "D:/multica/xiaoyou-code-indexer/bin/cli.mjs",
        "serve",
        "D:/multica/gitlab/<vue3-repo>"
      ]
    }
  }
}
```

工具清单：

- `get_project_map` — 项目全貌（讲解/定位前先调它）
- `trace_flow(target)` — 追业务链路，返回组件树与后端端点出处
- `list_warnings(kind?, limit?)` — 静态告警
- `search_index(keyword)` — 关键词检索
- `rescan` — 清缓存重扫（目标仓变更后用）

### 缓存

扫描结果按仓路径进程内缓存，默认 TTL 300 秒；`XIAOYOU_TTL_MS=0` 禁用缓存，`rescan` 工具可强制重扫。v1 约定单 server 单仓：多仓 = 在 `.mcp.json` 注册多个 server。

## 作为 npm 包（bundler 场景）

```ts
import { scanRepo, getScan } from "xiaoyou-code-indexer";
import { projectOverview, traceFlow } from "xiaoyou-code-indexer/query";
import type { ProjectMap } from "xiaoyou-code-indexer/types";
```

exports 白名单只暴露 `. / ./types / ./endpoint-types / ./via-label / ./query`；产物为 ESM + 独立 `dist/types` 声明，供 Next/webpack 等 bundler 消费。CLI 与 MCP 入口走 tsx 直跑 TS 源，无需构建即可使用。

## 开发

```bash
yarn install
yarn typecheck   # tsc --noEmit
yarn build       # 产出 dist/（消费方经 file:/npm 链接后需重装依赖同步拷贝）
```

## 消费方（file: 依赖）注意事项

yarn v1 的 `file:` 是整目录拷贝（含该包自身 node_modules）。消费方在改完本包后需 `rm -rf node_modules/<pkg> && yarn install --check-files` 强制同步。本包以 peerDependencies 声明 typescript/@vue/compiler-\*，消费方需自备这些依赖。
