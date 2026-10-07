import fs from "node:fs";
import path from "node:path";
import { query, type CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import { type AppConfig, loadConfig } from "@/lib/config";
import { createMentorServer } from "@/lib/mentor/tools";

/**
 * mentor Agent 装配（Claude Agent SDK）。
 *
 * 运行时 = Claude Code 子进程（native binary），模型走代理端点：
 * 探针实证（scripts/agent-probe.ts）：
 * - `claude` / `claude.cmd` 都不能直接给 SDK 用（前者找不到、后者 spawn EINVAL），
 *   必须指向 native binary claude.exe；XIAOYOU_CLAUDE_CODE_PATH 可覆盖。
 * - 进程内工具要先 createSdkMcpServer 包一层挂进 mcpServers，
 *   模型侧看到的名字是 mcp__xiaoyou__<tool>。
 * - Claude Code 自己挑模型名，必须显式注入 ANTHROPIC_MODEL / ANTHROPIC_SMALL_FAST_MODEL，
 *   钉到代理认识的模型 id，否则会去请求 opus/sonnet 别名而失败。
 */

export type MentorEvent =
  | { kind: "session"; sessionId: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string }
  | { kind: "done"; result: string; turns: number; sessionId: string | null }
  | { kind: "error"; message: string };

export interface MentorAgentRun {
  repoPath: string;
  prompt: string;
  /** 多轮：传上次返回的 sessionId 则续接同一会话（讲解 → 复述检验靠这个闭环） */
  sessionId?: string | null;
  strong?: boolean;
  maxTurns?: number;
}

let cachedClaudePath: string | null | undefined;

function candidateClaudePaths(): string[] {
  const out: string[] = [];
  const override = process.env.XIAOYOU_CLAUDE_CODE_PATH;
  if (override) out.push(override);

  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    // npm 全局装的 claude：bin 在 <global>/node_modules/@anthropic-ai/claude-code/bin/
    out.push(path.join(dir, "node_modules", "@anthropic-ai", "claude-code", "bin", exe));
    out.push(path.join(dir, exe));
  }
  out.push(path.join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".local", "bin", exe));
  return out;
}

function resolveClaudeCodePath(): string {
  if (cachedClaudePath !== undefined) {
    if (cachedClaudePath === null) {
      throw new Error(
        "找不到 Claude Code native binary。请设置 XIAOYOU_CLAUDE_CODE_PATH 指向 claude 可执行文件。",
      );
    }
    return cachedClaudePath;
  }
  cachedClaudePath = candidateClaudePaths().find(p => {
    try {
      // Windows 上 .cmd 会导致 spawn EINVAL，只认二进制
      if (p.endsWith(".cmd") || p.endsWith(".bat")) return false;
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }) ?? null;
  return resolveClaudeCodePath();
}

/** 探针实证的注入项：凭证 + 把模型名钉到代理认识的 id */
function agentEnv(cfg: AppConfig, strong: boolean): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (cfg.llm.baseURL) env.ANTHROPIC_BASE_URL = cfg.llm.baseURL;
  if (cfg.llm.authToken) env.ANTHROPIC_AUTH_TOKEN = cfg.llm.authToken;
  if (cfg.llm.apiKey) env.ANTHROPIC_API_KEY = cfg.llm.apiKey;
  const model = strong ? cfg.llm.strongModel || cfg.llm.model : cfg.llm.model;
  env.ANTHROPIC_MODEL = model;
  env.ANTHROPIC_SMALL_FAST_MODEL = cfg.llm.model;
  return env;
}

let cachedPersona: string | null = null;

function loadPersona(): string {
  if (cachedPersona !== null) return cachedPersona;
  cachedPersona = fs.readFileSync(path.join(process.cwd(), "lib", "mentor", "persona.md"), "utf8");
  return cachedPersona;
}

/**
 * 仓库只读闸门：探讨 agent 绝不能直接改目标仓，写操作只有两条合法路径——
 * propose_knowledge 落文档暂存（走进程内 MCP 工具），或用户在页面上点「落库到目标仓」。
 * 其余一切写类工具（Edit/Write/Bash…）在权限层直接拒掉，不依赖模型自觉。
 * deny 的 message 会回给模型，由它转告用户。
 */
const READONLY_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "LS",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
]);

const REPO_WRITE_DENIED =
  "禁止修改目标仓库：只能生成文档并需手动落库，不可直接修改。" +
  "需要改代码时，把改动建议用 propose_knowledge 落成待确认条目，由用户手动落库。";

const canUseTool: CanUseTool = async (toolName, _input, { mcpServer }) => {
  // 进程内 MCP 工具（get_project_map / trace_flow / search_knowledge / propose_knowledge）：
  // 读索引或写暂存区，不碰目标仓
  if (mcpServer?.source === "sdk") return { behavior: "allow" };
  if (READONLY_TOOLS.has(toolName)) return { behavior: "allow" };
  return { behavior: "deny", message: REPO_WRITE_DENIED };
};

export async function* streamMentorAgent(run: MentorAgentRun): AsyncGenerator<MentorEvent> {
  const cfg = loadConfig();
  if (!cfg.llm.model) {
    yield { kind: "error", message: "模型名为空：请设置 XIAOYOU_MODEL 或 ANTHROPIC_DEFAULT_SONNET_MODEL。" };
    return;
  }

  let claudePath: string;
  try {
    claudePath = resolveClaudeCodePath();
  } catch (err) {
    yield { kind: "error", message: (err as Error).message };
    return;
  }

  const stream = query({
    prompt: run.prompt,
    options: {
      cwd: run.repoPath,
      env: agentEnv(cfg, !!run.strong),
      mcpServers: { xiaoyou: createMentorServer(run.repoPath) },
      maxTurns: run.maxTurns ?? 12,
      // default 模式 + canUseTool 白名单：读类工具放行，写类工具一律拒
      // （bypassPermissions 下 canUseTool 不会被调用，闸门形同虚设）
      permissionMode: "default",
      canUseTool,
      pathToClaudeCodeExecutable: claudePath,
      // 先问后讲的人格是系统提示；仓库上下文（当前在带教哪个仓）一并钉进去
      systemPrompt:
        `你正在带教的项目仓库是「${path.basename(run.repoPath)}」（本地路径 ${run.repoPath}）。\n\n` +
        loadPersona(),
      ...(run.sessionId ? { resume: run.sessionId, continue: true } : {}),
      stderr: () => {},
    },
  });

  let sessionId: string | null = null;
  let turns = 0;

  try {
    for await (const msg of stream) {
      if (msg.type === "system") {
        const init = msg as { subtype?: string; session_id?: string };
        if (init.subtype === "init" && init.session_id) {
          sessionId = init.session_id;
          yield { kind: "session", sessionId };
        }
        continue;
      }

      if (msg.type === "assistant") {
        turns++;
        const content = (msg as { message?: { content?: unknown[] } }).message?.content ?? [];
        for (const block of content) {
          const b = block as { type?: string; name?: string; text?: string };
          if (b.type === "text" && b.text) yield { kind: "text", text: b.text };
          if (b.type === "tool_use" && b.name) yield { kind: "tool", name: b.name };
        }
        continue;
      }

      if (msg.type === "result") {
        const r = msg as { is_error?: boolean; result?: string; session_id?: string };
        if (r.is_error) {
          yield { kind: "error", message: String(r.result ?? "agent 运行失败").slice(0, 500) };
          return;
        }
        yield {
          kind: "done",
          result: String(r.result ?? ""),
          turns,
          sessionId: r.session_id ?? sessionId,
        };
        return;
      }
    }
  } catch (err) {
    yield { kind: "error", message: (err as Error).message };
  }
}
