#!/usr/bin/env python
"""ensure-banks.py - 幂等创建 Hindsight bank + 预填充 multica-project 静态规矩。

用法：
  python scripts/ensure-banks.py [--product iho-cssd-ui]

行为：
  - 建/clip 3 个 bank：li-expertise / multica-project / <产品线>(默认 iho-cssd-ui)。
  - 往 multica-project 预填充一遍流水线静态规矩（一次性，重复跑幂等覆盖）。
  - **软降级**：Hindsight 不可用 → 打印不可达提示、exit 0，不抛异常。
  - bank 创建 REST 地址见 ASSUMPTION 块，部署后与真实 schema 不符只改这里。
"""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

# ===== 已验证（2026-10-08 对照 OpenAPI 实测）=====
BASE_URL = "http://localhost:8888"
API_PREFIX = "/v1/default/banks"
TIMEOUT_S = 30

DEFAULT_PRODUCT = "iho-cssd-ui"

# multica-project 静态规矩（写入 = 规则被应用的实例，供 planner/orchestrator recall）
mv = "multica-project"
STATIC_RULES = [
    "禁用更改 node / npm / yarn 版本：不执行 nvm use、全局切换或 engines/.nvmrc/package.json 版本改动，版本锁定为现状。",
    "涉及 node_modules 数据修改前必须先明确提示「因为 <原因> 需要进行 node_modules 修改」并征得同意，不得静默 install/改依赖/动 link。",
    "commit message 单行规范：feat(R-<别名>): <标题>，只含标题一行、不加正文。标题含中文时用 -F 写消息文件，勿经 bash 中文参数。",
    "基准分支固定规则：仓内有 dev-zjb 用 dev-zjb，否则用 dev，不从 master。",
    "AgentTeam 只合到本地固定分支 + 删 worktree，绝不 commit/push 远程；远程提交合并是 xiaoqian deploy 阶段由人完成。",
]


def _post(path: str, payload: dict) -> object:
    url = BASE_URL + path
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw.strip() else None


def _put(path: str, payload: dict) -> object:
    url = BASE_URL + path
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw.strip() else None


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--product", default=DEFAULT_PRODUCT)
    p.add_argument("--skip-seed", action="store_true", help="只建库，不预填充静态规矩")
    a = p.parse_args()

    banks = ["li-expertise", "multica-project", a.product]
    try:
        src_banks = [b for b in banks if b]
        created = 0
        for b in src_banks:
            try:
                _put(f"{API_PREFIX}/{urllib.parse.quote(b)}", {})
                created += 1
            except urllib.error.HTTPError as e:
                # 409 已存在可视为幂等成功
                if e.code == 409:
                    created += 1
                else:
                    print(f"[bank:{b}] HTTP {e.code}")
        print(f"banks ensured: {created}/{len(src_banks)}")

        if not a.skip_seed:
            seeded = 0
            for rule in STATIC_RULES:
                try:
                    _post(
                        f"{API_PREFIX}/{urllib.parse.quote(mv)}/memories",
                        {"items": [{"content": rule, "context": "ensure-banks 静态规矩"}]},
                    )
                    seeded += 1
                except (urllib.error.URLError, urllib.error.HTTPError) as e:
                    print(f"[seed:{mv}] 失败：{e}")
            print(f"seeded {seeded}/{len(STATIC_RULES)} static rules into {mv}")
    except (urllib.error.URLError, TimeoutError, OSError):
        print("hindsight unreachable — banks not ensured (fail-soft)")
    return 0


if __name__ == "__main__":
    sys.exit(main())