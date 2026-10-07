import path from "node:path";
import { scanRepo } from "./index";
import type { ProjectMap } from "./types";

/** 进程内缓存：同一进程里避免重复全仓扫描（~550ms/次）。XIAOYOU_TTL_MS=0 可禁用缓存 */
const DEFAULT_TTL_MS = 300_000;

const cache = new Map<string, { map: ProjectMap; scannedAt: number }>();

function ttlMs(): number {
  const raw = Number(process.env.XIAOYOU_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_TTL_MS;
}

export function getScan(repoPath: string): ProjectMap {
  const key = path.resolve(repoPath);
  const ttl = ttlMs();
  const hit = cache.get(key);
  if (hit && (ttl === 0 || Date.now() - hit.scannedAt < ttl)) return hit.map;
  const map = scanRepo(key);
  cache.set(key, { map, scannedAt: Date.now() });
  return map;
}

export function clearScanCache(): void {
  cache.clear();
}
