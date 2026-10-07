import path from "node:path";

/**
 * 小游的全部可配置项。一律「XIAOYOU_* 优先，ANTHROPIC_* 兜底」，
 * 这样既能直接复用当前环境的代理配置，又能单独覆盖。
 *
 * 推荐把配置写进项目根目录的 .env.local —— Next.js 会在服务端启动时自动加载，
 * 于是配置跟着项目走，不依赖你从哪个 shell 启动 `yarn dev`。
 * 只靠 shell 环境变量的话，换个终端启动就会静默解析出空模型名。
 */
export interface LlmConfig {
  baseURL: string | undefined;
  authToken: string | undefined;
  apiKey: string | undefined;
  model: string;
  /** 需要更强推理时用（讲解、复述检验） */
  strongModel: string;
}

export interface AppConfig {
  llm: LlmConfig;
  /** 知识产物暂存目录；确认前不碰目标仓 */
  stagingDir: string;
}

export function loadConfig(): AppConfig {
  const baseURL = process.env.XIAOYOU_BASE_URL ?? process.env.ANTHROPIC_BASE_URL;
  const authToken = process.env.XIAOYOU_AUTH_TOKEN ?? process.env.ANTHROPIC_AUTH_TOKEN;
  const apiKey = process.env.XIAOYOU_API_KEY ?? process.env.ANTHROPIC_API_KEY;

  return {
    llm: {
      baseURL,
      authToken,
      apiKey,
      // 模型位不写死 Claude 模型名，跟随 Claude Code 的模型配置。
      // 解析结果可能是空串，由 assertLlmReady / complete 拦下并给出明确指引。
      model: process.env.XIAOYOU_MODEL || process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || "",
      strongModel:
        process.env.XIAOYOU_STRONG_MODEL || process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || "",
    },
    stagingDir:
      process.env.XIAOYOU_STAGING_DIR ?? path.resolve(process.cwd(), ".xiaoyou"),
  };
}

/** 脱敏描述，用于诊断与日志。**绝不输出凭证内容。** */
export function describeConfig(cfg: AppConfig): Record<string, string> {
  const { baseURL, authToken, apiKey, model, strongModel } = cfg.llm;
  return {
    baseURL: baseURL ?? "(未设置 → 官方端点)",
    credential: authToken
      ? `authToken 已设置(len ${authToken.length})`
      : apiKey
        ? `apiKey 已设置(len ${apiKey.length})`
        : "(未设置)",
    model: model || "(空)",
    strongModel: strongModel || "(空)",
    stagingDir: cfg.stagingDir,
  };
}

const ENV_HINT =
  "配置写在项目根目录的 .env.local 里（Next.js 服务端会自动加载，且已被 gitignore）。";

/** 起飞前检查。缺什么就直说是哪个变量，不要让空值一路走到 API 请求才报错。 */
export function assertLlmReady(cfg: AppConfig): void {
  const { baseURL, authToken, apiKey, model, strongModel } = cfg.llm;

  if (!authToken && !apiKey) {
    throw new Error(
      `缺少大模型凭证：请设置 XIAOYOU_AUTH_TOKEN（或 ANTHROPIC_AUTH_TOKEN），` +
        `或 XIAOYOU_API_KEY（或 ANTHROPIC_API_KEY）。${ENV_HINT}`,
    );
  }

  if (!model) {
    throw new Error(
      `模型名为空：请设置 XIAOYOU_MODEL，或设置 ANTHROPIC_DEFAULT_SONNET_MODEL 作为兜底。${ENV_HINT}`,
    );
  }

  if (!strongModel) {
    console.warn(
      `警告：强模型名为空（XIAOYOU_STRONG_MODEL / ANTHROPIC_DEFAULT_OPUS_MODEL 都未设置）。` +
        `需要强模型的环节会失败。${ENV_HINT}`,
    );
  }

  if (!baseURL) {
    console.warn("提示：未设置 XIAOYOU_BASE_URL / ANTHROPIC_BASE_URL，将走官方端点。");
  }
}
