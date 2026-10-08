# swagger-multi MCP 全局配置说明

本文档记录将 `swagger-multi` MCP 从项目级配置迁移为**用户全局配置**的完整过程，以及期间发现并修复的包 bug、最终配置结构和使用方法。

---

## 1. 背景与目标

- 原配置位于项目级 `D:\multica\get-swagger\.mcp.json`，只有 4 个服务（nursing/icis/treat/cssd），且使用不带 `group` 参数的 `/v2/api-docs` 地址（已返回 404）。
- swagger 网关要求使用分组参数，例如 `/v2/api-docs?group=defaultGroup`、`/v2/api-docs?group=3-护理计划（住院）`。
- 目标：将 `swagger-multi` 转为当前电脑用户的**全局 MCP**，按分组正确配置所有服务。

## 2. 最终配置位置

全局 MCP 配置写入文件：

```
C:\Users\zhangjiubo\.claude.json
```

其结构（`mcpServers.swagger-multi`）：

```json
{
  "mcpServers": {
    "swagger-multi": {
      "command": "node",
      "args": [
        "D:/multica/swagger-mcp-server/node_modules/@aike1202/swagger-mcp-server/build/index.js",
        "nursing-1-护理（住院）=http://192.168.1.211:9080/nursingswagger/v2/api-docs?group=1-%E6%8A%A4%E7%90%86%EF%BC%88%E4%BD%8F%E9%99%A2%EF%BC%89",
        "...（其余 9 个 nursing 分组，共 10 个）",
        "icis-default=http://192.168.1.211:9080/icisswagger/v2/api-docs?group=defaultGroup",
        "treat-default=http://192.168.1.211:9080/treatswagger/v2/api-docs?group=defaultGroup",
        "cssd-default=http://192.168.1.211:9080/cssdSwagger/v2/api-docs?group=defaultGroup"
      ]
    }
  }
}
```

- **command**：`node`
- **第一个 arg**：补丁版 MCP 服务器入口（本目录下安装的包）
- **其余 13 个 arg**：`服务名=swagger文档URL`，URL 中的 `group` 值已做 URL 编码

> 注意：不再使用 `npx -y @aike1202/swagger-mcp-server`，因为官方包存在解析 bug（见第 4 节），必须运行本地的补丁版。

## 3. 服务与分组清单（共 13 个服务）

| 服务名                       | 分组                 | 说明                                  |
| ---------------------------- | -------------------- | ------------------------------------- |
| `nursing-1-护理（住院）`     | `1-护理（住院）`     | 住院护理                              |
| `nursing-2-护理（急诊）`     | `2-护理（急诊）`     | 急诊护理                              |
| `nursing-3-护理计划（住院）` | `3-护理计划（住院）` | 住院护理计划（含护理模板/诊断定义等） |
| `nursing-4-护理计划（急诊）` | `4-护理计划（急诊）` | 急诊护理计划                          |
| `nursing-5-护理管理（住院）` | `5-护理管理（住院）` | 住院护理管理                          |
| `nursing-6-护理管理（急诊）` | `6-护理管理（急诊）` | 急诊护理管理                          |
| `nursing-7-移动医护`         | `7-移动医护`         | 移动医护                              |
| `nursing-8-护理大屏`         | `8-护理大屏`         | 护理大屏                              |
| `nursing-报告卡`             | `报告卡`             | 报告卡                                |
| `nursing-未分类`             | `未分类`             | 未分类接口                            |
| `icis-default`               | `defaultGroup`       | 重症（ICU）系统，含 `/icis/*` 接口    |
| `treat-default`              | `defaultGroup`       | 治疗系统                              |
| `cssd-default`               | `defaultGroup`       | 消毒供应中心系统                      |

nursing 分组来源（`http://192.168.1.211:9080/nursingswagger/swagger-resources`）：

- 护理（住院）、护理（急诊）、护理计划（住院）、护理计划（急诊）、护理管理（住院）、护理管理（急诊）、移动医护、护理大屏、报告卡、未分类

## 4. 修复的 Bug（`@aike1202/swagger-mcp-server@1.2.0`）

本地补丁安装在：

```
D:\multica\swagger-mcp-server\node_modules\@aike1202\swagger-mcp-server\build\services\loader.js
```

### Bug 1：URL 解析截断（group 参数丢失）

- **位置**：`loader.js` 的 `parseArgs()`
- **原代码**：
  ```js
  const [name, url] = arg.split("=", 2);
  ```
  `split("=", 2)` 只保留前两段，URL 中第二个 `=` 之后的内容被丢弃。例如：
  `icis-default=http://.../v2/api-docs?group=defaultGroup` → URL 变成 `http://.../v2/api-docs?group`（丢了 `=defaultGroup`），请求返回 404。
- **修复**：改为只按第一个 `=` 切分，完整保留 URL：
  ```js
  const eqIdx = arg.indexOf("=");
  const name = arg.slice(0, eqIdx);
  const url = arg.slice(eqIdx + 1);
  ```

### Bug 2：非法 JSON 文档解析失败（icis 服务）

- **现象**：`icis` 的 swagger 文档含有单引号数组，例如 `"example":['2024-10-16','2024-10-17']`，不是合法 JSON。axios 的 `JSON.parse` 失败，返回原始字符串，导致 `list_endpoints` 等工具抛 "Cannot convert undefined or null to object"。
- **修复**：在 `getDoc()` 抓取后，若返回的是字符串则修复单引号 example 数组再解析：
  ```js
  doc = response.data;
  if (typeof doc === "string") {
    const repaired = doc.replace(/"example"\s*:\s*\[[^\]]*?\]/g, (m) =>
      m.replace(/'/g, '"'),
    );
    doc = JSON.parse(repaired);
  }
  ```

### 已验证

- `nursing`（10 个分组）、`treat-default`、`cssd-default` 的文档均为合法 JSON，无需 Bug 2 修复。
- 仅 `icis-default` 的文档存在 Bug 2 的问题。
- 修复后 13 个服务的 `list_services` / `list_endpoints` / `get_endpoint_details` 全部测试通过。

## 5. 使用说明

重启 Claude Code（或重新加载 MCP）后生效。可用工具：

| 工具                               | 说明                                    |
| ---------------------------------- | --------------------------------------- |
| `list_services`                    | 列出所有服务                            |
| `list_endpoints`                   | 列出某服务全部接口（需 `service_name`） |
| `search_apis`                      | 按关键字搜索接口                        |
| `get_endpoint_details`             | 获取接口完整定义（参数、响应 schema）   |
| `get_schema` / `list_schemas`      | 获取/列出 schema                        |
| `debug_endpoint` / `generate_curl` | 调试请求 / 生成 curl                    |

示例服务名：`nursing-3-护理计划（住院）`、`icis-default`、`treat-default`、`cssd-default`。

## 6. 接口示例：`POST /icis/nursing-template/import`

所在服务：`icis-default`（分组 `defaultGroup`）

| 项       | 值                                                                               |
| -------- | -------------------------------------------------------------------------------- |
| 路径     | `/icis/nursing-template/import`                                                  |
| 方法     | POST                                                                             |
| 接口名   | 护理模板导入                                                                     |
| 描述     | 重症系统配置-护理单配置页签-导入                                                 |
| 请求格式 | `multipart/form-data`                                                            |
| 参数     | `file`（formData，文件类型，swagger 标注非必填）                                 |
| 返回     | HTTP 200，`通用返回结果«object»`（含 code/data/msg/success/errorData/subErrors） |

同分组相关路径（`/icis/nursing-template/*`）：`add`、`update`、`delete/{id}`、`list`、`list-by-department-id`、`searchPageByName`、`templateElements`、`getBckList`、`enableFlag`、`export`、`import`、`nursing-template-department/update-order`。

## 7. 维护注意事项

- **补丁位于 `node_modules` 内**，若对该目录执行 `yarn`/`npm install` 重新安装 `@aike1202/swagger-mcp-server`，loader.js 的补丁会被覆盖，需要重新应用。可用 `patch-package` 固化补丁（`postinstall` 自动恢复）。
- 官方包更新到修复该 bug 的新版本后，可改回 `npx -y @aike1202/swagger-mcp-server` 并删除本地补丁目录。
- `update_global_mcp.sh` 记录了重建全局 MCP 配置的完整命令，可重复执行。
- swagger 文档地址/分组可能随后端变更，变更后需同步更新 `.claude.json` 中的 URL。
