"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, GripVertical, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAction } from "@/components/common/use-action";
import { moveTask, setTaskStatus } from "@/server/actions/tasks";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { MoveDialog } from "@/components/tasks/task-item";
import { DAY_LABELS, dayOfWeek, formatDuration, formatMinute } from "@/lib/time";
import type { TaskFormOptions, TaskView } from "@/server/queries";
import { cn } from "@/lib/utils";
import { CategorySwatch, FOCUS_RING, ON_BLOCK, ON_BLOCK_HOVER, REVEAL_ON_HOVER } from "@/components/tasks/category-style";

export interface PlannerDay {
  date: string;
  tasks: TaskView[];
  fixed: { start: number; end: number; label: string }[];
  events: { id: string; title: string; type: string; startMinute: number | null; endMinute: number | null; allDay: boolean }[];
  score: number | null;
  availableMin: number;
  plannedMin: number;
}

/**
 * Monday → Sunday board. Tasks can be dragged between days (time is kept);
 * keyboard / screen-reader users use the "Move" button on each card.
 */
export function PlannerBoard({ days, today, options }: { days: PlannerDay[]; today: string; options: TaskFormOptions }) {
  const { run } = useAction();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [moving, setMoving] = useState<TaskView | null>(null);
  const [editing, setEditing] = useState<TaskView | null>(null);

  const drop = (date: string) => {
    const task = days.flatMap((d) => d.tasks).find((t) => t.id === dragId);
    setDragId(null);
    setOver(null);
    if (!task || task.date === date) return;
    run(() => moveTask({ id: task.id, date, startMinute: task.startMinute }), {
      success: false,
      onSuccess: (d) => (d.conflicts.length ? toast.warning(`Moved — overlaps ${d.conflicts.join(", ")}`) : toast.success(`Moved to ${DAY_LABELS[dayOfWeek(date)]}`)),
    });
  };

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[980px] grid-cols-7 gap-3 pr-1 pb-1">
          {days.map((d) => {
            const isToday = d.date === today;
            const past = d.date < today;
            const done = d.tasks.filter((t) => t.status === "COMPLETED").length;
            const active = d.tasks.filter((t) => t.status !== "RESCHEDULED");
            return (
              <section
                key={d.date}
                aria-label={`${DAY_LABELS[dayOfWeek(d.date)]} ${d.date}`}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  setOver(d.date);
                }}
                onDragLeave={() => setOver((o) => (o === d.date ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(d.date);
                }}
                className={cn(
                  "flex min-h-[420px] flex-col overflow-hidden rounded-[10px] border-2 shadow-brutal transition-colors",
                  over === d.date ? "border-dashed border-block-lime bg-block-lime/15 outline-2 outline-offset-2 outline-foreground" : "border-ink bg-card",
                )}
              >
                <header className={cn("border-b-2 border-ink px-3 py-2.5", isToday ? cn("bg-block-sky", ON_BLOCK) : past ? "bg-muted" : "bg-card")}>
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/my-day?date=${d.date}`} className={cn("rounded-[4px] font-display text-base leading-none font-extrabold tracking-[-0.02em] underline-offset-4 hover:underline", FOCUS_RING)}>
                      {DAY_LABELS[dayOfWeek(d.date)]} <span className={cn("font-mono text-sm font-medium tracking-normal tabular-nums", isToday ? ON_BLOCK : "text-muted-foreground")}>{Number(d.date.slice(8))}</span>
                      {isToday && <span className="sr-only"> (today)</span>}
                    </Link>
                    {d.score != null && (
                      <span
                        className={cn(
                          "rounded-[6px] border-2 border-ink px-1.5 font-mono text-[11px] leading-4 font-medium tabular-nums",
                          d.score >= 70 ? cn("bg-block-lime", ON_BLOCK) : d.score >= 50 ? cn("bg-block-sun", ON_BLOCK) : "bg-card text-foreground",
                        )}
                      >
                        <span className="sr-only">Score </span>
                        {Math.round(d.score)}
                      </span>
                    )}
                  </div>
                  <p className={cn("mt-1 font-mono text-[11px] font-medium tabular-nums", isToday ? ON_BLOCK : "text-muted-foreground")}>
                    {done}/{active.length} done · {formatDuration(d.availableMin)} free
                  </p>
                </header>

                <div className="flex flex-1 flex-col p-2.5">
                  {(d.events.length > 0 || d.fixed.length > 0) && (
                    <div className="space-y-1">
                      {d.events.map((e) => (
                        <div key={e.id} className="flex items-center gap-1.5 rounded-[6px] border-2 border-ink bg-muted px-2 py-1 text-[11px]">
                          <Lock className="size-3 shrink-0" aria-hidden />
                          <span className="truncate font-semibold">{e.title}</span>
                        </div>
                      ))}
                      {d.fixed
                        .filter((f) => !d.events.some((e) => e.title === f.label))
                        .map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5 rounded-[6px] border-2 border-dashed border-ink/60 px-2 py-1 text-[11px] text-muted-foreground">
                            <Lock className="size-3 shrink-0" aria-hidden />
                            <span className="shrink-0 font-mono font-medium tabular-nums">{formatMinute(f.start).replace(":00", "")}</span>
                            <span className="truncate">{f.label}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  <ul className="mt-2 flex-1 space-y-2">
                    {d.tasks.map((t) => {
                      const done = t.status === "COMPLETED";
                      const skipped = t.status === "SKIPPED";
                      return (
                        <li
                          key={t.id}
                          draggable={!done}
                          onDragStart={(e) => {
                            setDragId(t.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setOver(null);
                          }}
                          className={cn(
                            "group rounded-[8px] border-2 border-ink bg-card p-2 text-xs shadow-brutal-sm transition",
                            !done && "cursor-grab active:cursor-grabbing",
                            dragId === t.id && "opacity-40",
                            (done || skipped) && "bg-muted shadow-none",
                            t.status === "MISSED" && "border-destructive",
                          )}
                        >
                          <div className="flex items-start gap-1.5">
                            <button
                              type="button"
                              aria-label={done ? `Mark ${t.title} incomplete` : `Mark ${t.title} complete`}
                              aria-pressed={done}
                              onClick={() => run(() => setTaskStatus({ id: t.id, status: done ? "PENDING" : "COMPLETED" }), { success: false })}
                              className={cn("grid size-4 shrink-0 place-items-center rounded-[4px] border-2 border-ink transition-colors", FOCUS_RING, done ? cn("bg-block-lime", ON_BLOCK) : "bg-card hover:bg-block-lime/40")}
                            >
                              {done && <Check className="size-3" strokeWidth={4} aria-hidden />}
                            </button>
                            <button type="button" onClick={() => setEditing(t)} className={cn("min-w-0 flex-1 rounded-[4px] text-left leading-snug font-semibold", FOCUS_RING, (done || skipped) && "text-muted-foreground line-through decoration-2")}>
                              {t.title}
                            </button>
                            {!done && <GripVertical className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="grid w-4 shrink-0 place-items-center">
                              <CategorySwatch categoryKey={t.categoryKey} color={t.color} />
                            </span>
                            <span className="sr-only">{t.categoryName}, </span>
                            <span className="min-w-0 truncate font-mono font-medium tabular-nums">
                              {t.startMinute != null ? formatMinute(t.startMinute) : "Any"} · {formatDuration(t.durationMin)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setMoving(t)}
                              aria-label={`Move ${t.title}`}
                              className={cn(
                                "ml-auto shrink-0 rounded-[6px] border-2 border-ink bg-card px-1.5 leading-4 font-semibold text-foreground transition hover:bg-block-lime",
                                ON_BLOCK_HOVER,
                                REVEAL_ON_HOVER,
                                FOCUS_RING,
                              )}
                            >
                              Move
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {!past && (
                    <button
                      type="button"
                      onClick={() => setCreating(d.date)}
                      aria-label={`Add task on ${DAY_LABELS[dayOfWeek(d.date)]} ${d.date}`}
                      className={cn(
                        "mt-2 flex items-center justify-center gap-1 rounded-[8px] border-2 border-dashed border-ink/60 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-ink hover:bg-muted hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      <Plus className="size-3.5" aria-hidden /> Add
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <TaskFormDialog open={!!creating} onOpenChange={(v) => !v && setCreating(null)} options={options} defaults={{ date: creating ?? today }} />
      <TaskFormDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} options={options} task={editing} />
      {moving && <MoveDialog open onOpenChange={(v) => !v && setMoving(null)} task={moving} />}
    </>
  );
}
