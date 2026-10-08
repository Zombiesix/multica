import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), '.teamwork');
const src = path.join(dir, 'Auth.example');
const dst = path.join(dir, 'auth.txt');

if (fs.existsSync(dst)) {
  console.log('[setup] .teamwork/auth.txt 已存在，跳过');
} else if (fs.existsSync(src)) {
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dst);
  console.log('[setup] 已从 Auth.example 生成 .teamwork/auth.txt，请填入你的 loginName / password');
} else {
  console.log('[setup] 警告：.teamwork/Auth.example 不存在，跳过 auth.txt 生成');
}