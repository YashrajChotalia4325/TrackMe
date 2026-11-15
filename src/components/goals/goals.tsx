"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/common/form";
import { Bar } from "@/components/common/ui";
import { useAction } from "@/components/common/use-action";
import { addMilestone, deleteGoal, deleteMilestone, toggleMilestone, upsertGoal } from "@/server/actions/goals";
import { diffDays, formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface GoalView {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  color: string;
  categoryName: string | null;
  startDate: string;
  targetDate: string;
  priority: string;
  status: string;
  progressMode: string;
  manualProgress: number;
  progress: number;
  milestones: { id: string; title: string; targetDate: string | null; doneAt: string | null }[];
  relatedTasks: number;
  relatedDone: number;
}

const STATUS_LABEL: Record<string, string> = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", ACHIEVED: "Achieved", PAUSED: "Paused", DROPPED: "Dropped" };

export function GoalCard({ goal, today, categories }: { goal: GoalView; today: string; categories: { id: string; name: string }[] }) {
  const { run, pending } = useAction();
  const [editing, setEditing] = useState(false);
  const [ms, setMs] = useState({ title: "", date: "" });
  const daysLeft = diffDays(goal.targetDate, today);
  return (
    <article id={goal.id} className="animate-rise scroll-mt-20 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: goal.color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold tracking-tight">{goal.title}</h3>
            <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium", goal.status === "ACHIEVED" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{STATUS_LABEL[goal.status]}</span>
            {goal.priority === "CRITICAL" || goal.priority === "HIGH" ? <span className="text-[10px] font-medium text-warning">{goal.priority.toLowerCase()} priority</span> : null}
          </div>
          {goal.description && <p className="mt-0.5 text-sm text-muted-foreground">{goal.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {goal.categoryName ?? "General"} · {formatDate(goal.startDate, "dm")} → {formatDate(goal.targetDate)} · {daysLeft >= 0 ? `${daysLeft} days left` : "past target date"}
            {goal.relatedTasks > 0 && ` · ${goal.relatedDone}/${goal.relatedTasks} related tasks done`}
          </p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="rounded p-1.5 text-muted-foreground hover:text-foreground" aria-label={`Edit ${goal.title}`}>
          <Pencil className="size-4" />
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Bar value={goal.progress} max={100} color={goal.color} label={`${goal.title} progress`} />
        <span className="tabular w-10 text-right text-sm font-semibold">{goal.progress}%</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{goal.progressMode === "MILESTONES" ? "Calculated from completed milestones" : "Updated manually"}</p>

      <ul className="mt-4 space-y-0.5">
        {goal.milestones.map((m) => (
          <li key={m.id} className="group flex items-center gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => toggleMilestone(m.id), { success: false })} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left text-sm hover:bg-muted/50" aria-pressed={!!m.doneAt}>
              <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", m.doneAt ? "border-success bg-success text-black" : "border-muted-foreground/40")}>{m.doneAt && <Check className="size-2.5" strokeWidth={3} />}</span>
              <span className={cn("truncate", m.doneAt && "text-muted-foreground line-through")}>{m.title}</span>
              {m.targetDate && <span className={cn("ml-auto shrink-0 text-[11px]", !m.doneAt && m.targetDate < today ? "text-warning" : "text-muted-foreground")}>{formatDate(m.targetDate, "dm")}</span>}
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => deleteMilestone(m.id))} className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100" aria-label={`Delete milestone ${m.title}`}>
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addMilestone(goal.id, ms.title, ms.date || null), { onSuccess: () => setMs({ title: "", date: "" }) });
        }}
      >
        <Input value={ms.title} onChange={(e) => setMs({ ...ms, title: e.target.value })} placeholder="Add milestone" aria-label={`New milestone for ${goal.title}`} className="h-8" />
        <Input type="date" value={ms.date} onChange={(e) => setMs({ ...ms, date: e.target.value })} aria-label="Milestone target date" className="h-8 w-40 dark:[color-scheme:dark]" />
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !ms.title.trim()} aria-label="Add milestone">
          <Plus className="size-4" />
        </Button>
      </form>
      <GoalDialog open={editing} onOpenChange={setEditing} goal={goal} categories={categories} today={today} />
    </article>
  );
}

export function GoalDialog({ open, onOpenChange, goal, categories, today }: { open: boolean; onOpenChange: (v: boolean) => void; goal?: GoalView | null; categories: { id: string; name: string }[]; today: string }) {
  const { run, pending } = useAction();
  const init = () => ({
    title: goal?.title ?? "",
    description: goal?.description ?? "",
    categoryId: goal?.categoryId ?? "",
    startDate: goal?.startDate ?? today,
    targetDate: goal?.targetDate ?? "2027-12-31",
    priority: goal?.priority ?? "MEDIUM",
    status: goal?.status ?? "IN_PROGRESS",
    progressMode: goal?.progressMode ?? "MILESTONES",
    manualProgress: goal?.manualProgress ?? 0,
  });
  const [v, setV] = useState(init);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setV(init());
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
          <DialogDescription>Progress is calculated from milestones unless you choose manual updates.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" htmlFor="g-title" className="sm:col-span-2"><Input id="g-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
          <Field label="Description" htmlFor="g-desc" className="sm:col-span-2"><Textarea id="g-desc" rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <Field label="Category" htmlFor="g-cat">
            <NativeSelect id="g-cat" value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}>
              <option value="">General</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Priority" htmlFor="g-pri">
            <NativeSelect id="g-pri" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Start" htmlFor="g-start"><Input id="g-start" type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} className="dark:[color-scheme:dark]" /></Field>
          <Field label="Target" htmlFor="g-target"><Input id="g-target" type="date" value={v.targetDate} onChange={(e) => setV({ ...v, targetDate: e.target.value })} className="dark:[color-scheme:dark]" /></Field>
          <Field label="Status" htmlFor="g-status">
            <NativeSelect id="g-status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>
              {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Progress" htmlFor="g-mode">
            <NativeSelect id="g-mode" value={v.progressMode} onChange={(e) => setV({ ...v, progressMode: e.target.value })}>
              <option value="MILESTONES">From milestones</option>
              <option value="MANUAL">Manual</option>
            </NativeSelect>
          </Field>
          {v.progressMode === "MANUAL" && (
            <Field label={`Manual progress: ${v.manualProgress}%`} htmlFor="g-manual" className="sm:col-span-2">
              <input id="g-manual" type="range" min={0} max={100} step={5} value={v.manualProgress} onChange={(e) => setV({ ...v, manualProgress: Number(e.target.value) })} className="accent-[var(--primary)]" />
            </Field>
          )}
        </div>
        <DialogFooter className="gap-2">
          {goal && (
            <Button variant="destructive" className="sm:mr-auto" disabled={pending} onClick={() => run(() => deleteGoal(goal.id), { onSuccess: () => onOpenChange(false) })}>
              Delete goal
            </Button>
          )}
          <Button disabled={pending || !v.title.trim()} onClick={() => run(() => upsertGoal(goal?.id ?? null, { ...v, description: v.description || undefined, categoryId: v.categoryId || null }), { onSuccess: () => onOpenChange(false) })}>
            Save goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewGoalButton({ categories, today }: { categories: { id: string; name: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New goal
      </Button>
      <GoalDialog open={open} onOpenChange={setOpen} categories={categories} today={today} />
    </>
  );
}
