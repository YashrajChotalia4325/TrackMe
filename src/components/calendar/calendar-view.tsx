"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAction } from "@/components/common/use-action";
import { moveTask } from "@/server/actions/tasks";
import { EventFormDialog, type EventView } from "./event-form-dialog";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { MoveDialog } from "@/components/tasks/task-item";
import { DAY_LABELS, dayOfWeek, formatDuration, formatMinute } from "@/lib/time";
import { EVENT_TYPE_META } from "@/lib/domain/constants";
import type { TaskFormOptions, TaskView } from "@/server/queries";
import { cn } from "@/lib/utils";
import { FOCUS_RING, ON_BLOCK, categoryBlock } from "@/components/tasks/category-style";

const EXAM_TYPES = new Set(["EXAM", "INTERNAL_EXAM", "PRACTICAL_EXAM", "VIVA"]);

export interface MonthCell {
  date: string;
  inMonth: boolean;
  events: EventView[];
  taskCount: number;
  doneCount: number;
  inExam: boolean;
  score: number | null;
}

export function MonthGrid({ cells, today }: { cells: MonthCell[]; today: string }) {
  const [editing, setEditing] = useState<EventView | null>(null);
  const [creatingOn, setCreatingOn] = useState<string | null>(null);
  return (
    <>
      <div className="overflow-hidden rounded-[10px] border-2 border-ink bg-card shadow-brutal">
        <div className="grid grid-cols-7 border-b-2 border-ink bg-muted">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold tracking-[0.08em] text-foreground uppercase">
              {DAY_LABELS[d]}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c) => (
            <div
              key={c.date}
              className={cn(
                "group relative min-h-24 border-r border-b border-foreground/20 p-1.5 sm:min-h-28 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0",
                !c.inMonth && "bg-muted text-muted-foreground",
                c.inExam && "bg-block-sun/25",
              )}
            >
              <div className="flex items-center justify-between">
                <Link
                  href={`/my-day?date=${c.date}`}
                  className={cn(
                    "grid size-7 place-items-center rounded-full border-2 border-transparent font-mono text-xs font-medium tabular-nums hover:border-ink hover:bg-muted",
                    FOCUS_RING,
                    c.date === today && cn("border-ink bg-block-lime font-semibold hover:bg-block-lime", ON_BLOCK),
                  )}
                  aria-label={`Open ${c.date}${c.date === today ? " (today)" : ""}`}
                  aria-current={c.date === today ? "date" : undefined}
                >
                  {Number(c.date.slice(8))}
                </Link>
                <button type="button" onClick={() => setCreatingOn(c.date)} className={cn("grid size-6 place-items-center rounded-[6px] border-2 border-ink bg-card text-sm leading-none font-bold text-foreground opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-block-lime hover:text-ink focus-visible:opacity-100", FOCUS_RING)} aria-label={`Add event on ${c.date}`}>
                  +
                </button>
              </div>
              <div className="mt-1 space-y-0.5">
                {c.events.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEditing(e)}
                    className={cn(
                      "block w-full truncate rounded-[6px] border-2 border-ink px-1.5 py-px text-left text-[11px] leading-4 font-semibold",
                      FOCUS_RING,
                      EXAM_TYPES.has(e.type) ? cn("bg-block-sun", ON_BLOCK) : e.type === "HOLIDAY" ? cn("bg-block-lime", ON_BLOCK) : "bg-muted text-foreground",
                    )}
                  >
                    {!e.allDay && e.startMinute != null && <span className="mr-1 font-mono font-medium tabular-nums opacity-80">{formatMinute(e.startMinute).replace(":00", "")}</span>}
                    {e.title}
                  </button>
                ))}
                {c.events.length > 3 && <p className="px-1 text-[10px] font-semibold text-muted-foreground">+{c.events.length - 3} more</p>}
              </div>
              {c.taskCount > 0 && (
                <p className="absolute right-1.5 bottom-1 font-mono text-[10px] font-medium text-muted-foreground tabular-nums">
                  {c.doneCount}/{c.taskCount} tasks
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
      <EventFormDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} today={today} event={editing} />
      <EventFormDialog open={!!creatingOn} onOpenChange={(v) => !v && setCreatingOn(null)} today={today} defaultDate={creatingOn ?? today} />
    </>
  );
}

export interface WeekColumn {
  date: string;
  tasks: TaskView[];
  fixed: { start: number; end: number; label: string }[];
  events: EventView[];
}

const HOUR_PX = 48;

/** Out-of-hours (before wake / after sleep): muted surface with fine diagonal hatching. */
const SLEEP_HATCH = "bg-muted bg-[repeating-linear-gradient(135deg,transparent_0_7px,var(--muted-foreground)_7px_8px)] opacity-50";

/** Time grid with drag-and-drop rescheduling (snaps to 15 minutes). */
export function WeekTimeGrid({ columns, today, wake, sleep, options, nowMinute }: { columns: WeekColumn[]; today: string; wake: number; sleep: number; options: TaskFormOptions; nowMinute: number }) {
  const { run } = useAction();
  const startHour = Math.max(0, Math.floor(wake / 60) - 1);
  const endHour = Math.min(24, Math.ceil(sleep / 60) + 1);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const [drag, setDrag] = useState<{ id: string; offset: number } | null>(null);
  const [ghost, setGhost] = useState<{ date: string; minute: number } | null>(null);
  const [editing, setEditing] = useState<TaskView | null>(null);
  const [moving, setMoving] = useState<TaskView | null>(null);
  const [creating, setCreating] = useState<{ date: string; minute: number } | null>(null);
  const allTasks = columns.flatMap((c) => c.tasks);
  const dragTask = drag ? allTasks.find((t) => t.id === drag.id) : null;

  const minuteAt = (e: React.DragEvent | React.MouseEvent, el: HTMLElement) => {
    const y = e.clientY - el.getBoundingClientRect().top;
    return Math.max(0, Math.min(24 * 60 - 15, Math.round(((y / HOUR_PX) * 60 + startHour * 60) / 15) * 15));
  };
  const top = (m: number) => ((m - startHour * 60) / 60) * HOUR_PX;

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:pr-1 sm:pl-0">
        <div className="min-w-[860px] overflow-hidden rounded-[10px] border-2 border-ink bg-card shadow-brutal">
          <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b-2 border-ink bg-muted">
            <div />
            {columns.map((c) => (
              <div key={c.date} className={cn("border-l border-foreground/20 px-2 py-2 text-center text-xs", c.date === today && cn("bg-block-sky", ON_BLOCK))} aria-current={c.date === today ? "date" : undefined}>
                <span className="font-display text-sm font-extrabold tracking-[-0.01em]">{DAY_LABELS[dayOfWeek(c.date)]}</span>{" "}
                <span className={cn("font-mono font-medium tabular-nums", c.date === today ? ON_BLOCK : "text-muted-foreground")}>{Number(c.date.slice(8))}</span>
              </div>
            ))}
          </div>
          <div className="grid max-h-[70vh] grid-cols-[52px_repeat(7,1fr)] overflow-y-auto">
            <div className="relative" style={{ height: hours.length * HOUR_PX }}>
              {hours.map((h) => (
                <div key={h} className="absolute right-2 -translate-y-1/2 font-mono text-[10px] font-medium text-muted-foreground tabular-nums" style={{ top: (h - startHour) * HOUR_PX }}>
                  {h === 0 ? "" : formatMinute(h * 60).replace(":00", "")}
                </div>
              ))}
            </div>
            {columns.map((c) => (
              <div
                key={c.date}
                className="relative border-l border-foreground/20"
                style={{ height: hours.length * HOUR_PX }}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  setGhost({ date: c.date, minute: Math.max(0, minuteAt(e, e.currentTarget) - drag.offset) });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!drag || !dragTask) return;
                  const minute = Math.max(0, minuteAt(e, e.currentTarget) - drag.offset);
                  setDrag(null);
                  setGhost(null);
                  if (minute + dragTask.durationMin > 24 * 60) return toast.error("That would run past midnight.");
                  run(() => moveTask({ id: dragTask.id, date: c.date, startMinute: minute }), {
                    success: false,
                    onSuccess: (d) => (d.conflicts.length ? toast.warning(`Moved — overlaps ${d.conflicts.join(", ")}`) : toast.success(`Moved to ${DAY_LABELS[dayOfWeek(c.date)]} ${formatMinute(minute)}`)),
                  });
                }}
                onDoubleClick={(e) => setCreating({ date: c.date, minute: minuteAt(e, e.currentTarget) })}
              >
                {hours.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-foreground/15" style={{ top: (h - startHour) * HOUR_PX }} />
                ))}
                {/* Sleep shading */}
                <div className={cn("absolute inset-x-0 top-0", SLEEP_HATCH)} style={{ height: Math.max(0, top(wake)) }} aria-hidden />
                <div className={cn("absolute inset-x-0", SLEEP_HATCH)} style={{ top: top(sleep), bottom: 0 }} aria-hidden />
                {c.date === today && nowMinute >= startHour * 60 && nowMinute <= endHour * 60 && (
                  <div className="absolute inset-x-0 z-20 h-0.5 -translate-y-1/2 bg-foreground" style={{ top: top(nowMinute) }} aria-hidden>
                    <span className="absolute -top-[5px] -left-[5px] size-3 rounded-full border-2 border-ink bg-block-lime" />
                  </div>
                )}
                {c.fixed.map((f, i) => (
                  <div key={i} className="absolute inset-x-1 overflow-hidden rounded-[6px] border-2 border-dashed border-foreground/40 bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" style={{ top: top(f.start), height: Math.max(14, ((f.end - f.start) / 60) * HOUR_PX - 2) }}>
                    {f.label}
                  </div>
                ))}
                {c.tasks
                  .filter((t) => t.startMinute != null && t.status !== "SKIPPED")
                  .map((t) => {
                    const done = t.status === "COMPLETED";
                    return (
                      <div
                        key={t.id}
                        draggable={!done}
                        onDragStart={(e) => {
                          const offset = Math.round(((e.clientY - e.currentTarget.getBoundingClientRect().top) / HOUR_PX) * 60 / 15) * 15;
                          setDrag({ id: t.id, offset });
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setGhost(null);
                        }}
                        onClick={() => setEditing(t)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setEditing(t);
                          if (e.key === "m") setMoving(t);
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`${t.title}, ${formatMinute(t.startMinute)} for ${formatDuration(t.durationMin)}. Press Enter to edit, M to move.`}
                        className={cn(
                          "absolute inset-x-1 z-10 cursor-grab overflow-hidden rounded-[6px] border-2 border-ink px-1.5 py-0.5 text-[11px] leading-tight shadow-brutal-sm active:cursor-grabbing",
                          FOCUS_RING,
                          categoryBlock(t.categoryKey, t.color),
                          ON_BLOCK,
                          done && "opacity-60 shadow-none",
                          drag?.id === t.id && "opacity-30",
                        )}
                        style={{ top: top(t.startMinute!), height: Math.max(16, (t.durationMin / 60) * HOUR_PX - 2) }}
                      >
                        <p className={cn("truncate font-semibold", done && "line-through decoration-2")}>{t.title}</p>
                        {t.durationMin >= 45 && <p className="truncate font-mono font-medium tabular-nums opacity-80">{formatMinute(t.startMinute)}</p>}
                      </div>
                    );
                  })}
                {ghost && ghost.date === c.date && dragTask && (
                  <div className={cn("pointer-events-none absolute inset-x-1 z-30 rounded-[6px] border-2 border-dashed border-ink bg-block-lime/60 px-1.5 font-mono text-[10px] font-medium tabular-nums", ON_BLOCK)} style={{ top: top(ghost.minute), height: (dragTask.durationMin / 60) * HOUR_PX }}>
                    {formatMinute(ghost.minute)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Drag tasks to reschedule (snaps to 15 min). Double-click an empty slot to add a task. Keyboard: focus a task, press M to move or Enter to edit.</p>
      <TaskFormDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} options={options} task={editing} />
      <TaskFormDialog open={!!creating} onOpenChange={(v) => !v && setCreating(null)} options={options} defaults={{ date: creating?.date, startMinute: creating?.minute ?? null }} />
      {moving && <MoveDialog open onOpenChange={(v) => !v && setMoving(null)} task={moving} />}
    </>
  );
}

export function EventTypeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-3.5 rounded-[4px] border-2 border-ink bg-block-sun" aria-hidden /> Exams
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3.5 rounded-[4px] border-2 border-ink bg-block-lime" aria-hidden /> Holidays
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3.5 rounded-[4px] border-2 border-ink bg-block-sun/25" aria-hidden /> Exam period
      </span>
      <span className="hidden text-muted-foreground sm:inline">{Object.keys(EVENT_TYPE_META).length} event types supported</span>
    </div>
  );
}
