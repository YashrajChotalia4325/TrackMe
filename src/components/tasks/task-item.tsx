"use client";

import { useState } from "react";
import { CalendarClock, Check, Clock, MoreHorizontal, NotebookPen, Pencil, Play, SkipForward, Trash2, Undo2, Repeat, Pin } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, TimeInput } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { addTaskNote, deleteTask, moveTask, setTaskStatus } from "@/server/actions/tasks";
import { startLearning } from "@/server/actions/learning";
import { formatDuration, formatMinute, formatDate } from "@/lib/time";
import { KIND_META } from "@/lib/domain/constants";
import type { TaskView } from "@/server/queries";
import { cn } from "@/lib/utils";
import { CategoryChip, DANGER_FILL, FOCUS_RING, ON_BLOCK, REVEAL_ON_HOVER } from "./category-style";

const PRIORITY_TONE: Record<string, string> = {
  CRITICAL: "text-destructive",
  HIGH: "text-warning",
  MEDIUM: "text-muted-foreground",
  LOW: "text-muted-foreground",
};

export function TaskItem({ task, onEdit, compact = false, showDate = false }: { task: TaskView; onEdit?: (t: TaskView) => void; compact?: boolean; showDate?: boolean }) {
  const { run, pending } = useAction();
  const [dialog, setDialog] = useState<null | "skip" | "notes" | "move" | "partial" | "delete">(null);
  const done = task.status === "COMPLETED";
  const skipped = task.status === "SKIPPED";
  const missed = task.status === "MISSED";
  const inactive = done || skipped;

  const toggle = () =>
    run(() => setTaskStatus({ id: task.id, status: done ? "PENDING" : "COMPLETED" }), {
      success: false,
      onSuccess: (d) => {
        if (!done) toast.success(`Completed “${task.title}”`, { description: d.score != null ? `Today's score: ${d.score}/100` : undefined });
      },
    });

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-[8px] border-2 border-ink bg-card px-3 py-2.5 transition-shadow hover:shadow-brutal-sm",
        task.status === "IN_PROGRESS" && "shadow-brutal-sm",
        inactive && "bg-muted",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={pending || skipped}
        aria-label={done ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
        aria-pressed={done}
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-[6px] border-2 border-ink transition-colors disabled:cursor-not-allowed",
          FOCUS_RING,
          done ? cn("bg-block-lime", ON_BLOCK) : "bg-card hover:bg-block-lime/40",
          skipped && "border-dashed opacity-50",
        )}
      >
        {done && <Check className="size-4" strokeWidth={3.5} aria-hidden />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("truncate text-sm font-semibold", inactive && "text-muted-foreground line-through decoration-2 decoration-muted-foreground/60")}>{task.title}</p>
          {task.kind === "FIXED" && <Pin className="size-3.5 text-foreground" role="img" aria-label="Fixed commitment" />}
          {task.recurringTaskId && <Repeat className="size-3.5 text-foreground" role="img" aria-label="Recurring" />}
          {missed && <span className={cn("rounded-[6px] border-2 border-ink px-1.5 text-[10px] leading-4 font-semibold tracking-[0.04em] uppercase", DANGER_FILL, ON_BLOCK)}>Missed</span>}
          {skipped && <span className="rounded-[6px] border-2 border-ink bg-card px-1.5 text-[10px] leading-4 font-semibold text-muted-foreground">Skipped{task.skipApproved ? " · no penalty" : ""}</span>}
          {task.status === "IN_PROGRESS" && <span className={cn("rounded-[6px] border-2 border-ink bg-block-sun px-1.5 text-[10px] leading-4 font-semibold tracking-[0.04em] uppercase", ON_BLOCK)}>In progress</span>}
          {done && task.completionPct > 0 && task.completionPct < 100 && <span className="font-mono text-[11px] font-medium text-muted-foreground tabular-nums">{task.completionPct}%</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <CategoryChip categoryKey={task.categoryKey} color={task.color} name={task.categoryName} />
          {showDate && <span className="font-medium text-foreground">{formatDate(task.date, "weekday")}</span>}
          <span className="flex items-center gap-1 font-mono font-medium tabular-nums">
            <Clock className="size-3" aria-hidden />
            {task.startMinute != null ? formatMinute(task.startMinute) : "Any time"} · {formatDuration(task.durationMin)}
          </span>
          {!compact && <span className={cn("font-semibold", PRIORITY_TONE[task.priority])}>{task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}</span>}
          {!compact && task.kind !== "FLEXIBLE" && <span className="hidden sm:inline">{KIND_META[task.kind].label}</span>}
          {task.deadline && <span className="font-semibold text-warning">Due {formatDate(task.deadline, "dm")}</span>}
        </div>
        {task.notes && !compact && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{task.notes}</p>}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Actions for ${task.title}`}
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-[8px] border-2 border-transparent text-foreground transition hover:border-ink hover:bg-muted data-[popup-open]:border-ink data-[popup-open]:bg-muted data-[popup-open]:opacity-100",
                REVEAL_ON_HOVER,
                FOCUS_RING,
              )}
            />
          }
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {task.categoryKey === "AI" && !inactive && (
            <DropdownMenuItem onClick={() => run(() => startLearning({ taskId: task.id, topic: task.description ?? undefined }))}>
              <Play className="size-4" /> Start learning timer
            </DropdownMenuItem>
          )}
          {!inactive && task.status !== "IN_PROGRESS" && (
            <DropdownMenuItem onClick={() => run(() => setTaskStatus({ id: task.id, status: "IN_PROGRESS" }), { success: false })}>
              <Play className="size-4" /> Start now
            </DropdownMenuItem>
          )}
          {!done && (
            <DropdownMenuItem onClick={() => setDialog("partial")}>
              <Check className="size-4" /> Partially done…
            </DropdownMenuItem>
          )}
          {inactive && (
            <DropdownMenuItem onClick={() => run(() => setTaskStatus({ id: task.id, status: "PENDING" }), { success: "Marked as pending" })}>
              <Undo2 className="size-4" /> Mark incomplete
            </DropdownMenuItem>
          )}
          {onEdit && (
            <DropdownMenuItem onClick={() => onEdit(task)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDialog("move")}>
            <CalendarClock className="size-4" /> Reschedule…
          </DropdownMenuItem>
          {!inactive && (
            <DropdownMenuItem onClick={() => setDialog("skip")}>
              <SkipForward className="size-4" /> Skip…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDialog("notes")}>
            <NotebookPen className="size-4" /> {task.notes ? "Edit notes" : "Add notes"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SkipDialog open={dialog === "skip"} onOpenChange={(v) => setDialog(v ? "skip" : null)} task={task} />
      <NotesDialog open={dialog === "notes"} onOpenChange={(v) => setDialog(v ? "notes" : null)} task={task} />
      <MoveDialog open={dialog === "move"} onOpenChange={(v) => setDialog(v ? "move" : null)} task={task} />
      <PartialDialog open={dialog === "partial"} onOpenChange={(v) => setDialog(v ? "partial" : null)} task={task} />
      <Dialog open={dialog === "delete"} onOpenChange={(v) => setDialog(v ? "delete" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{task.title}”?</DialogTitle>
            <DialogDescription>
              {task.recurringTaskId ? "Only this occurrence is deleted. To stop the series, use Settings → Recurring tasks." : "This can't be undone. The deletion is recorded in your schedule history."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => deleteTask(task.id), { onSuccess: () => setDialog(null) })}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SkipDialog({ open, onOpenChange, task }: { open: boolean; onOpenChange: (v: boolean) => void; task: TaskView }) {
  const [reason, setReason] = useState("");
  const { run, pending } = useAction();
  const approvedByDefault = task.canSkip || task.kind === "OPTIONAL";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skip “{task.title}”</DialogTitle>
          <DialogDescription>
            {approvedByDefault
              ? "This task is skippable — with a reason it won't count against your score."
              : "Add a reason. Approved skips (illness, emergencies, rest) don't count against your score."}
          </DialogDescription>
        </DialogHeader>
        <Field label="Reason" htmlFor="skip-reason">
          <Input id="skip-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Feeling unwell, family commitment" />
        </Field>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={pending} onClick={() => run(() => setTaskStatus({ id: task.id, status: "SKIPPED", skipReason: reason || undefined, skipApproved: false }), { onSuccess: () => onOpenChange(false), success: "Skipped" })}>
            Skip (counts as missed)
          </Button>
          <Button disabled={pending || !reason.trim()} onClick={() => run(() => setTaskStatus({ id: task.id, status: "SKIPPED", skipReason: reason, skipApproved: true }), { onSuccess: () => onOpenChange(false), success: "Skipped — no penalty" })}>
            Skip with approved reason
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotesDialog({ open, onOpenChange, task }: { open: boolean; onOpenChange: (v: boolean) => void; task: TaskView }) {
  const [notes, setNotes] = useState(task.notes ?? "");
  const { run, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notes</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>
        <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Task notes" />
        <DialogFooter>
          <Button disabled={pending} onClick={() => run(() => addTaskNote(task.id, notes), { onSuccess: () => onOpenChange(false) })}>
            Save notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Accessible alternative to drag-and-drop. */
export function MoveDialog({ open, onOpenChange, task }: { open: boolean; onOpenChange: (v: boolean) => void; task: TaskView }) {
  const [date, setDate] = useState(task.date);
  const [start, setStart] = useState<number | null>(task.startMinute);
  const { run, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule “{task.title}”</DialogTitle>
          <DialogDescription>
            {task.kind === "FIXED" ? "This is a fixed commitment — you're moving it manually." : "Pick a new day and time. Overlaps with fixed commitments will be flagged."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="mv-date">
            <Input id="mv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="dark:[color-scheme:dark]" />
          </Field>
          <Field label="Start time" htmlFor="mv-start">
            <TimeInput id="mv-start" value={start} onChange={setStart} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || !date}
            onClick={() =>
              run(() => moveTask({ id: task.id, date, startMinute: start }), {
                onSuccess: (d) => {
                  onOpenChange(false);
                  if (d.conflicts.length) toast.warning(`Overlaps ${d.conflicts.join(", ")}`);
                },
              })
            }
          >
            Move task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartialDialog({ open, onOpenChange, task }: { open: boolean; onOpenChange: (v: boolean) => void; task: TaskView }) {
  const [pct, setPct] = useState(50);
  const [minutes, setMinutes] = useState(Math.round(task.durationMin / 2));
  const { run, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Partial completion</DialogTitle>
          <DialogDescription>Earn partial credit for “{task.title}”.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label={`Completed: ${pct}%`} htmlFor="pct">
            <input id="pct" type="range" min={10} max={90} step={10} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="accent-[var(--primary)]" />
          </Field>
          <Field label="Actual minutes spent" htmlFor="pct-min">
            <Input id="pct-min" type="number" min={0} max={720} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </Field>
        </div>
        <DialogFooter>
          <Button disabled={pending} onClick={() => run(() => setTaskStatus({ id: task.id, status: "COMPLETED", completionPct: pct, actualMin: minutes }), { onSuccess: () => onOpenChange(false), success: `Logged ${pct}% complete` })}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
