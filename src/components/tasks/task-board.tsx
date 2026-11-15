"use client";

import { useState } from "react";
import { ListTodo, Moon, Plus, Sun, Sunrise, Sunset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/ui";
import { TaskItem } from "./task-item";
import { TaskFormDialog } from "./task-form-dialog";
import { dayPart, formatDuration, type DayPart } from "@/lib/time";
import type { TaskFormOptions, TaskView } from "@/server/queries";

const PARTS: { key: DayPart; icon: typeof Sun }[] = [
  { key: "Morning", icon: Sunrise },
  { key: "Afternoon", icon: Sun },
  { key: "Evening", icon: Sunset },
  { key: "Night", icon: Moon },
];

/** Tasks grouped into Morning / Afternoon / Evening / Night, with full CRUD. */
export function TaskBoard({ tasks, options, date, compact = false, emptyHint }: { tasks: TaskView[]; options: TaskFormOptions; date: string; compact?: boolean; emptyHint?: string }) {
  const [editing, setEditing] = useState<TaskView | null>(null);
  const [creating, setCreating] = useState<null | { startMinute: number | null }>(null);
  const unscheduled = tasks.filter((t) => t.startMinute == null);
  const scheduled = tasks.filter((t) => t.startMinute != null);

  return (
    <div className="space-y-5">
      {tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Nothing planned yet"
          description={emptyHint ?? "Add a task, or generate a plan from your weekly targets."}
          action={
            <Button size="sm" onClick={() => setCreating({ startMinute: null })}>
              <Plus className="size-4" /> Add task
            </Button>
          }
        />
      ) : (
        <>
          {PARTS.map(({ key, icon: Icon }) => {
            const list = scheduled.filter((t) => dayPart(t.startMinute) === key);
            if (list.length === 0) return null;
            const mins = list.filter((t) => t.status !== "SKIPPED").reduce((s, t) => s + t.durationMin, 0);
            return (
              <div key={key}>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-foreground uppercase">
                  <Icon className="size-3.5" aria-hidden /> {key}
                  <span className="font-mono font-medium tracking-normal text-muted-foreground normal-case tabular-nums">· {formatDuration(mins)}</span>
                  <span className="h-0.5 flex-1 rounded-full bg-foreground/15" aria-hidden />
                </div>
                <div className="space-y-2">
                  {list.map((t) => (
                    <TaskItem key={t.id} task={t} onEdit={setEditing} compact={compact} />
                  ))}
                </div>
              </div>
            );
          })}
          {unscheduled.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-foreground uppercase">
                Any time
                <span className="h-0.5 flex-1 rounded-full bg-foreground/15" aria-hidden />
              </div>
              <div className="space-y-2">
                {unscheduled.map((t) => (
                  <TaskItem key={t.id} task={t} onEdit={setEditing} compact={compact} />
                ))}
              </div>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setCreating({ startMinute: null })}>
            <Plus className="size-4" /> Add task
          </Button>
        </>
      )}
      <TaskFormDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} options={options} task={editing} />
      <TaskFormDialog open={!!creating} onOpenChange={(v) => !v && setCreating(null)} options={options} defaults={{ date, startMinute: creating?.startMinute ?? null }} />
    </div>
  );
}

export function AddTaskButton({ options, date, label = "Add task", variant = "default", categoryKey, size = "default" }: { options: TaskFormOptions; date?: string; label?: string; variant?: "default" | "outline" | "secondary" | "ghost"; categoryKey?: string; size?: "default" | "sm" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {label}
      </Button>
      <TaskFormDialog open={open} onOpenChange={setOpen} options={options} defaults={{ date: date ?? options.today, categoryKey }} />
    </>
  );
}
