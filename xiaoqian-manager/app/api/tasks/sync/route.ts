import { NextResponse } from "next/server";
import type { Task } from "@/lib/domain/schema";
import { mergeTasks } from "@/lib/server/store";
import {
  fetchDetail,
  fetchList,
  fetchRecord,
  TwLoginError,
} from "@/lib/server/teamwork/client";
import { hasCredentials } from "@/lib/server/teamwork/credentials";
import { rowToTask } from "@/lib/server/teamwork/mapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!hasCredentials()) {
      return NextResponse.json(
        { error: "未找到协作平台凭证 auth.txt" },
        { status: 400 }
      );
    }
    let body: { user?: string; statuses?: string[]; module?: string } = {};
    try {
      body = await req.json();
    } catch {
      // 空 body 走默认筛选
    }
    const statuses = body.statuses?.length ? body.statuses : ["1", "2"];
    const user = body.user ?? "张九波";
    const moduleName = body.module ?? "";

    const rows = await fetchList({ statuses, user, module: moduleName, pageSize: 50 });

    const tasks: Task[] = [];
    let failed = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      try {
        if (!id) throw new Error("该行没有 id 字段");
        const [detail, traj] = await Promise.all([
          fetchDetail(id),
          fetchRecord(String(row.demand_id ?? "")),
        ]);
        tasks.push(rowToTask(row, detail, traj));
      } catch (e) {
        failed++;
        errors.push(`${id}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    const merged = await mergeTasks(tasks);
    return NextResponse.json({
      synced: tasks.length,
      created: merged.created,
      updated: merged.updated,
      failed,
      errors,
    });
  } catch (e) {
    if (e instanceof TwLoginError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
