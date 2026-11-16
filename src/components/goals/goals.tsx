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
import { CategoryChip, CategorySwatch, FOCUS_RING, ON_BLOCK, ON_BLOCK_HOVER, REVEAL_ON_HOVER, categoryBlockVar } from "@/components/tasks/category-style";

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
    <article id={goal.id} className="animate-rise scroll-mt-20 rounded-[10px] border-2 border-ink bg-card p-5 shadow-brutal">
      <div className="flex items-start gap-3">
        <CategorySwatch color={goal.color} className="mt-1 size-4" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h3 className="font-display text-lg leading-tight font-extrabold tracking-[-0.01em]">{goal.title}</h3>
            <span className={cn("rounded-[6px] border-2 border-ink px-1.5 text-[10px] leading-4 font-semibold tracking-[0.04em] uppercase", goal.status === "ACHIEVED" ? cn("bg-block-lime", ON_BLOCK) : goal.status === "IN_PROGRESS" ? "bg-card text-foreground" : "bg-muted text-muted-foreground")}>{STATUS_LABEL[goal.status]}</span>
            {goal.priority === "CRITICAL" || goal.priority === "HIGH" ? <span className="text-[11px] font-semibold text-warning">{goal.priority.charAt(0) + goal.priority.slice(1).toLowerCase()} priority</span> : null}
          </div>
          {goal.description && <p className="mt-1 text-sm text-muted-foreground">{goal.description}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            {goal.categoryName ? <CategoryChip color={goal.color} name={goal.categoryName} /> : <span className="font-semibold text-foreground">General</span>}
            <span className="font-mono font-medium tabular-nums">
              {formatDate(goal.startDate, "dm")} → {formatDate(goal.targetDate)}
            </span>
            <span aria-hidden>·</span>
            <span className={cn("font-semibold", daysLeft < 0 ? "text-destructive" : "text-foreground")}>{daysLeft >= 0 ? <><span className="font-mono tabular-nums">{daysLeft}</span> days left</> : "past target date"}</span>
            {goal.relatedTasks > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>
                  <span className="font-mono font-medium tabular-nums">
                    {goal.relatedDone}/{goal.relatedTasks}
                  </span>{" "}
                  related tasks done
                </span>
              </>
            )}
          </p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className={cn("grid size-8 shrink-0 place-items-center rounded-[8px] border-2 border-ink bg-card text-foreground shadow-brutal-sm press hover:bg-muted", FOCUS_RING)} aria-label={`Edit ${goal.title}`}>
          <Pencil className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Bar value={goal.progress} max={100} color={categoryBlockVar(null, goal.color)} label={`${goal.title} progress`} className="h-3.5 bg-muted" />
        <span className="w-12 text-right font-display text-xl leading-none font-extrabold tracking-[-0.02em] tabular-nums">{goal.progress}%</span>
      </div>
      <p className="mt-1.5 eyebrow text-muted-foreground">{goal.progressMode === "MILESTONES" ? "Calculated from completed milestones" : "Updated manually"}</p>

      {goal.milestones.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {goal.milestones.map((m) => (
            <li key={m.id} className="group flex items-center gap-1.5">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => toggleMilestone(m.id), { success: false })}
                className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-[8px] border-2 border-ink px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed", m.doneAt ? "bg-muted" : "bg-card", FOCUS_RING)}
                aria-pressed={!!m.doneAt}
              >
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-[5px] border-2 border-ink", m.doneAt ? cn("bg-block-lime", ON_BLOCK) : "bg-card")} aria-hidden>
                  {m.doneAt && <Check className="size-3.5" strokeWidth={3.5} />}
                </span>
                <span className={cn("truncate font-medium", m.doneAt && "text-muted-foreground line-through decoration-2")}>{m.title}</span>
                {m.targetDate && <span className={cn("ml-auto shrink-0 font-mono text-[11px] font-medium tabular-nums", !m.doneAt && m.targetDate < today ? "font-semibold text-warning" : "text-muted-foreground")}>{formatDate(m.targetDate, "dm")}</span>}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => deleteMilestone(m.id))}
                className={cn("grid size-8 shrink-0 place-items-center rounded-[8px] border-2 border-transparent text-foreground transition hover:border-ink hover:bg-block-danger", ON_BLOCK_HOVER, REVEAL_ON_HOVER, FOCUS_RING)}
                aria-label={`Delete milestone ${m.title}`}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addMilestone(goal.id, ms.title, ms.date || null), { onSuccess: () => setMs({ title: "", date: "" }) });
        }}
      >
        <Input value={ms.title} onChange={(e) => setMs({ ...ms, title: e.target.value })} placeholder="Add milestone" aria-label={`New milestone for ${goal.title}`} className="h-8" />
        <Input type="date" value={ms.date} onChange={(e) => setMs({ ...ms, date: e.target.value })} aria-label="Milestone target date" className="h-8 w-40 font-mono tabular-nums dark:[color-scheme:dark]" />
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
