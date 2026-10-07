import { assertLlmReady, loadConfig } from "../lib/config";
import { complete, completeJson } from "../lib/llm/client";

/**
 * 探针：走真实代码路径（loadConfig → complete / completeJson），
 * 确认当前环境的代理 + 解析出来的模型名能不能干活。
 *
 * 只打印配置值和结果，不打印任何凭证内容。
 */
async function main(): Promise<void> {
  const cfg = loadConfig();
  const failures: string[] = [];

  console.log("\n解析出的配置");
  console.log("  baseURL    :", cfg.llm.baseURL ?? "(未设置 → 官方端点)");
  console.log("  authToken  :", cfg.llm.authToken ? `已设置(len ${cfg.llm.authToken.length})` : "(未设置)");
  console.log("  apiKey     :", cfg.llm.apiKey ? `已设置(len ${cfg.llm.apiKey.length})` : "(未设置)");
  console.log("  model      :", cfg.llm.model);
  console.log("  strongModel:", cfg.llm.strongModel);
  console.log("  stagingDir :", cfg.stagingDir);

  try {
    assertLlmReady(cfg);
  } catch (err) {
    console.error("\n" + (err as Error).message);
    process.exit(1);
  }

  // 1) 纯文本补全
  try {
    const text = await complete("只回复两个字：通了", { maxTokens: 256 }, cfg);
    if (text) {
      console.log(`\n[PASS] 文本补全  ${cfg.llm.model} -> ${JSON.stringify(text)}`);
    } else {
      console.log(`\n[FAIL] 文本补全  ${cfg.llm.model} -> 空回复（有 token 消耗但无文本）`);
      failures.push("文本补全返回空");
    }
  } catch (err) {
    console.log(`\n[FAIL] 文本补全  ${cfg.llm.model} -> ${(err as Error).message}`);
    failures.push("文本补全报错");
  }

  // 2) JSON 补全——追问闭环实际走的就是这条
  try {
    const json = await completeJson<{ ok: boolean; note: string }>(
      '把 {"ok": true, "note": "通了"} 原样返回。',
      { maxTokens: 256 },
      cfg,
    );
    console.log(`[PASS] JSON 补全  -> ${JSON.stringify(json)}`);
    if (json?.ok !== true) failures.push("JSON 内容不对");
  } catch (err) {
    console.log(`[FAIL] JSON 补全  -> ${(err as Error).message}`);
    failures.push("JSON 补全失败");
  }

  // 3) 强模型
  try {
    const text = await complete("只回复两个字：通了", { maxTokens: 256, strong: true }, cfg);
    if (text) {
      console.log(`[PASS] 强模型      ${cfg.llm.strongModel} -> ${JSON.stringify(text)}`);
    } else {
      console.log(`[FAIL] 强模型      ${cfg.llm.strongModel} -> 空回复`);
      failures.push("强模型返回空");
    }
  } catch (err) {
    console.log(`[FAIL] 强模型      ${cfg.llm.strongModel} -> ${(err as Error).message}`);
    failures.push("强模型报错");
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
