import Anthropic from "@anthropic-ai/sdk";
import { type AppConfig, loadConfig } from "@/lib/config";

let cached: { client: Anthropic; cfg: AppConfig } | null = null;

/**
 * 构造 Anthropic 客户端。
 * 走 authToken 而不是 apiKey，是因为火山方舟这类代理用 Authorization: Bearer，
 * 而不是 x-api-key。
 */
export function getLlm(cfg: AppConfig = loadConfig()): { client: Anthropic; cfg: AppConfig } {
  if (cached && cached.cfg === cfg) return cached;

  const { baseURL, authToken, apiKey } = cfg.llm;
  const client = new Anthropic({
    ...(baseURL ? { baseURL } : {}),
    ...(authToken ? { authToken } : {}),
    ...(apiKey ? { apiKey } : {}),
  });

  cached = { client, cfg };
  return cached;
}

export interface CompleteOptions {
  system?: string;
  maxTokens?: number;
  /** 用更强的模型（讲解、复述检验） */
  strong?: boolean;
  temperature?: number;
}

/** 单轮补全，取纯文本结果。追问闭环用这个就够，不需要 agent 工具循环。 */
export async function complete(
  prompt: string,
  opts: CompleteOptions = {},
  cfg: AppConfig = loadConfig(),
): Promise<string> {
  const { client } = getLlm(cfg);
  const model = opts.strong ? cfg.llm.strongModel : cfg.llm.model;

  // 最后一道闸：空模型名发出去只会得到一个难懂的报错
  if (!model) {
    throw new Error(
      opts.strong
        ? "强模型名为空，无法调用。请设置 XIAOYOU_STRONG_MODEL 或 ANTHROPIC_DEFAULT_OPUS_MODEL。"
        : "模型名为空，无法调用。请设置 XIAOYOU_MODEL 或 ANTHROPIC_DEFAULT_SONNET_MODEL。",
    );
  }

  const res = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 2048,
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    messages: [{ role: "user", content: prompt }],
  });

  return res.content
    .map(b => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

/**
 * 要 JSON 的补全。代理不保证支持 tool/JSON mode，所以靠提示词 + 从回复里抠 JSON。
 */
export async function completeJson<T>(
  prompt: string,
  opts: CompleteOptions = {},
  cfg: AppConfig = loadConfig(),
): Promise<T> {
  const raw = await complete(
    `${prompt}\n\n只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释文字。`,
    opts,
    cfg,
  );

  const text = stripCodeFence(raw);
  try {
    return JSON.parse(text) as T;
  } catch {
    // 模型偶尔会前后加话，兜一层：抠出最外层的 {...}
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }
    throw new Error(`模型没有返回可解析的 JSON：${raw.slice(0, 200)}`);
  }
}

function stripCodeFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}
