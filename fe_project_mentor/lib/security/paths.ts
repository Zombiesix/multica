import fs from "node:fs";
import path from "node:path";

/**
 * 小游跑在本机、能读用户磁盘，所以路径必须过白名单。
 * 默认根目录由 cwd 推导：小游在 <workspace>/fe_project_mentor，目标仓在 <workspace>/gitlab。
 * 可用 XIAOYOU_ALLOWED_ROOTS 覆盖（用 path.delimiter 分隔多个）。
 */
function allowedRoots(): string[] {
  const env = process.env.XIAOYOU_ALLOWED_ROOTS;
  if (env) {
    return env
      .split(path.delimiter)
      .map(s => s.trim())
      .filter(Boolean)
      .map(r => path.resolve(r));
  }
  return [path.resolve(process.cwd(), "..", "gitlab")];
}

export function listAllowedRoots(): string[] {
  return allowedRoots().map(r => {
    try {
      return fs.realpathSync(r);
    } catch {
      return r;
    }
  });
}

export class PathRejected extends Error {}

/**
 * Windows 路径大小写不敏感，但 startsWith 敏感（用户打 `d:/...`，
 * realpathSync 保留小写盘符，而白名单根目录可能是 `D:\...`）。
 * 比较前统一规范化。
 */
function comparable(p: string): string {
  const normalized = path.resolve(p).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/**
 * 校验并规范化用户给的路径。
 * 用 realpathSync 解掉符号链接，避免「白名单内放个链接指向仓外」这种绕过。
 */
export function assertAllowedPath(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) throw new PathRejected("路径为空");
  if (!path.isAbsolute(trimmed)) throw new PathRejected("必须是绝对路径");

  const resolved = path.resolve(trimmed);

  let real: string;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    throw new PathRejected(`路径不存在或不可访问：${resolved}`);
  }

  if (!fs.statSync(real).isDirectory()) {
    throw new PathRejected(`不是目录：${real}`);
  }

  const roots = listAllowedRoots();
  const targetCmp = comparable(real);
  const within = roots.some(root => {
    const rootCmp = comparable(root);
    return targetCmp === rootCmp || targetCmp.startsWith(rootCmp + path.sep);
  });

  if (!within) {
    throw new PathRejected(
      `路径不在允许的根目录内。\n允许：${roots.join("\n      ")}\n实际：${real}`,
    );
  }

  return real;
}
