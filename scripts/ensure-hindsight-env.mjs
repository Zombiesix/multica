import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'scripts');
const src = path.join(dir, 'hindsight.env.example');
const dst = path.join(dir, 'hindsight.env');

if (fs.existsSync(dst)) {
  console.log('[setup] scripts/hindsight.env 已存在，跳过');
} else if (fs.existsSync(src)) {
  fs.copyFileSync(src, dst);
  console.log('[setup] 已从 hindsight.env.example 生成 scripts/hindsight.env，请填入你的 Ark Plan Key 和 SiliconFlow Key');
} else {
  console.log('[setup] 警告：scripts/hindsight.env.example 不存在，跳过 hindsight.env 生成');
}
