import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { loadConfig } from "../lib/config";

/**
 * Agent SDK 探针：验证「Claude Code 子进程 + 火山方舟代理」这条链路能不能干活。
 *
 * 与 lib/llm/client.ts 的探针不同，这条链路会真实拉起 claude 子进程，
 * 模型走 ANTHROPIC_MODEL 环境变量注入。两段验证：
 *   1) 纯对话（无工具）——只验代理兼容
 *   2) 强制调一个 trivial 工具——验 tool_use/tool_result 回路（讲解要靠这个）
 *
 * 只打印配置与结果，不打印任何凭证内容。
 */

function agentEnv(): NodeJS.ProcessEnv {
  const cfg = loadConfig();
  const env = { ...process.env };
  if (cfg.llm.baseURL) env.ANTHROPIC_BASE_URL = cfg.llm.baseURL;
  if (cfg.llm.authToken) env.ANTHROPIC_AUTH_TOKEN = cfg.llm.authToken;
  if (cfg.llm.apiKey) env.ANTHROPIC_API_KEY = cfg.llm.apiKey;
  // Claude Code 自己挑模型名（opus/sonnet 别名），必须显式钉到代理认识的模型 id
  env.ANTHROPIC_MODEL = cfg.llm.model;
  env.ANTHROPIC_SMALL_FAST_MODEL = cfg.llm.model;
  return env;
}

interface TextOut {
  texts: string[];
  toolUses: string[];
  turns: number;
}

async function run(
  prompt: string,
  defs: Parameters<typeof createSdkMcpServer>[0]["tools"],
  maxTurns: number,
): Promise<TextOut> {
  const out: TextOut = { texts: [], toolUses: [], turns: 0 };
  // 进程内工具必须先包成 SDK MCP server，再挂进 mcpServers
  const server = createSdkMcpServer({ name: "probe", version: "0.0.1", tools: defs });
  const stream = query({
    prompt,
    options: {
      cwd: process.cwd(),
      env: agentEnv(),
      mcpServers: { probe: server },
      maxTurns,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      pathToClaudeCodeExecutable:
        "D:\\Program Files\\nodejs\\node-global\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe",
      stderr: () => {},
    },
  });
  for await (const msg of stream) {
    if (process.env.PROBE_DEBUG) {
      const m = msg as { type: string; message?: { content?: { type?: string; name?: string }[] } };
      console.log(
        "  msg:",
        m.type,
        m.message?.content?.map(c => c.type + (c.name ? `(${c.name})` : "")).join(","),
      );
    }
    if (msg.type === "assistant") {
      out.turns++;
      for (const block of (msg as { message?: { content?: unknown[] } }).message?.content ?? []) {
        const b = block as { type?: string; name?: string; text?: string };
        if (b.type === "text" && b.text) out.texts.push(b.text);
        if (b.type === "tool_use" && b.name) out.toolUses.push(b.name);
      }
    }
    if (msg.type === "result") {
      const r = msg as { is_error?: boolean; result?: string };
      if (r.is_error) throw new Error(`agent 报错: ${String(r.result).slice(0, 300)}`);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const failures: string[] = [];

  console.log("\n解析出的配置");
  console.log("  baseURL    :", cfg.llm.baseURL ?? "(未设置 → 官方端点)");
  console.log("  authToken  :", cfg.llm.authToken ? `已设置(len ${cfg.llm.authToken.length})` : "(未设置)");
  console.log("  model      :", cfg.llm.model, "(将注入 ANTHROPIC_MODEL)");

  // 1) 纯对话
  try {
    const out = await run("只回复两个字：通了", [], 1);
    const text = out.texts.join("").trim();
    if (text) {
      console.log(`\n[PASS] 纯对话    -> ${JSON.stringify(text.slice(0, 80))}`);
    } else {
      console.log("\n[FAIL] 纯对话    -> 空回复");
      failures.push("纯对话空回复");
    }
  } catch (err) {
    console.log(`\n[FAIL] 纯对话    -> ${(err as Error).message}`);
    failures.push("纯对话报错");
  }

  // 2) 强制工具回路
  const ping = tool(
    "ping_probe",
    "探针工具：返回传入的 msg 原样字符串。必须调用一次再作答。",
    { msg: z.string() },
    async args => ({ content: [{ type: "text", text: args.msg }] }),
  );
  try {
    const out = await run("调用 ping_probe 工具（msg 填 通了），然后把它的返回值原样告诉我。", [ping], 4);
    if (out.toolUses.some(u => u.includes("ping_probe"))) {
      console.log(`[PASS] 工具回路  -> 调用 ${out.toolUses.join(",")}；回复 ${JSON.stringify(out.texts.join("").slice(0, 80))}`);
    } else {
      console.log(`[FAIL] 工具回路  -> 没调工具，直接回复 ${JSON.stringify(out.texts.join("").slice(0, 80))}`);
      failures.push("工具没被调用");
    }
  } catch (err) {
    console.log(`[FAIL] 工具回路  -> ${(err as Error).message}`);
    failures.push("工具回路报错");
  }

  console.log();
  if (failures.length > 0) {
    console.error(`探针失败 ${failures.length} 项：${failures.join("；")}`);
    process.exit(1);
  }
  console.log("探针通过\n");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
