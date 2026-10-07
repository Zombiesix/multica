import { NextResponse } from "next/server";
import { describeConfig, loadConfig } from "@/lib/config";

export const runtime = "nodejs";

/**
 * 诊断用：看服务端实际解析出了什么配置。
 * 只回脱敏信息（凭证仅报「是否设置」和长度），绝不回内容。
 */
export async function GET() {
  const cfg = loadConfig();
  const described = describeConfig(cfg);

  const ready =
    Boolean(cfg.llm.authToken || cfg.llm.apiKey) && Boolean(cfg.llm.model);

  return NextResponse.json({
    ready,
    ...described,
    hint: ready
      ? "配置就绪。"
      : "配置不完整：把缺失项写进项目根目录的 .env.local（参考 .env.example），然后重启 yarn dev。",
  });
}
