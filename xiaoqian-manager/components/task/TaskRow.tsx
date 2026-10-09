"use client";

import dynamic from "next/dynamic";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Stage, Task } from "@/lib/domain/schema";
import TaskMeta from "./TaskMeta";
import TaskTabs from "./TaskTabs";

const TaskFlow = dynamic(() => import("@/components/flow/TaskFlow"), {
  ssr: false,
  loading: () => (
    <div className="h-[180px] w-full animate-pulse rounded-lg bg-muted/50" />
  ),
});

function StatusBadge({ status }: { status: string }) {
  if (!status) return null;
  const variant =
    status === "处理中"
      ? "default"
      : status === "待处理"
        ? "secondary"
        : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export default function TaskRow({
  task,
  onOpenStage,
  onStartPipeline,
}: {
  task: Task;
  onOpenStage: (stage: Stage) => void;
  onStartPipeline: (taskId: string) => void;
}) {
  const doneCount = task.stages.filter((s) => s.status === "done").length;

  return (
    <AccordionItem
      value={task.id}
      className="rounded-xl border bg-card shadow-sm"
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline">
        <div className="flex flex-1 items-center gap-3 text-left">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{task.title}</span>
              <StatusBadge status={task.twStatus} />
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {task.module}
              {task.assignee ? ` · ${task.assignee}` : ""}
              {task.customerName ? ` · ${task.customerName}` : ""}
            </div>
          </div>
          <div className="hidden w-40 shrink-0 items-center gap-2 sm:flex">
            <Progress value={doneCount * 25} className="h-1.5" />
            <span className="w-8 shrink-0 text-xs tabular-nums text-muted-foreground">
              {doneCount}/4
            </span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <TaskMeta task={task} />
        <div className="mt-3 rounded-lg border bg-muted/20 p-2">
          <div className="overflow-x-auto">
            <div className="min-w-[1040px]">
              <TaskFlow
                stages={task.stages}
                onOpen={onOpenStage}
                onStartPipeline={() => onStartPipeline(task.id)}
              />
            </div>
          </div>
          <p className="mt-1 px-2 text-xs text-muted-foreground">
            点击节点可更新阶段状态；计划节点点 ▶ 可一键开始流水线（计划+写代码）
          </p>
        </div>
        <div className="mt-3">
          <TaskTabs task={task} />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
