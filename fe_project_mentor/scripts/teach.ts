import fs from "node:fs";
import { streamMentorAgent } from "../lib/mentor/agent";
import { assertAllowedPath } from "../lib/security/paths";

/**
 * 讲解 CLI：让 mentor Agent 带教一条链路。
 *
 * 用法：
 *   yarn teach <仓路径> "<问题>"            单轮讲解
 *   yarn teach <仓路径> --file q.md         从文件读问题（中文长文本走文件，别走命令行）
 *   yarn teach <仓路径> --file q.md --session <id> --jsonl   续接会话（复述检验用），事件按行输出
 *
 * exit code：0 = 正常跑完（agent 自己结束）；1 = 参数/路径/运行错误。
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const jsonl = argv.includes("--jsonl");
  const args = argv.filter(a => !a.startsWith("--"));
  const opt = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const rawPath = args[0];
  if (!rawPath) {
    console.error("用法：yarn teach <仓路径> \"<问题>\" [--file q.md] [--session <id>] [--jsonl]");
    process.exit(1);
  }

  let repoPath: string;
  try {
    repoPath = assertAllowedPath(rawPath);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  let prompt: string;
  const file = opt("file");
  if (file) {
    prompt = fs.readFileSync(file, "utf8").trim();
  } else {
    prompt = (args[1] ?? "").trim();
  }
  if (!prompt) {
    console.error("问题不能为空（或用 --file 从文件读）");
    process.exit(1);
  }

  let sessionId = opt("session") ?? null;
  let turns = 0;

  for await (const ev of streamMentorAgent({ repoPath, prompt, sessionId })) {
    if (jsonl) {
      console.log(JSON.stringify(ev));
    }
    switch (ev.kind) {
      case "session":
        sessionId = ev.sessionId;
        if (!jsonl) console.error(`[session ${ev.sessionId}]`);
        break;
      case "text":
        turns++;
        if (!jsonl) process.stdout.write(ev.text);
        break;
      case "tool":
        if (!jsonl) console.error(`\n[tool ${ev.name}]`);
        break;
      case "done":
        if (!jsonl) {
          console.error(`\n[done turns=${ev.turns}]`);
        }
        break;
      case "error":
        console.error(`\n[error] ${ev.message}`);
        process.exitCode = 1;
        break;
    }
  }

  if (jsonl) {
    // 最后一行给验收脚本一个稳定锚点
    console.log(JSON.stringify({ kind: "final", sessionId, turns }));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
