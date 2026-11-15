"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Check, Flame, MoreHorizontal, Pencil, Plus, Repeat, Trash2, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DayPicker, Field } from "@/components/common/form";
import { EmptyState } from "@/components/common/ui";
import { useAction } from "@/components/common/use-action";
import { archiveHabit, createHabit, deleteHabit, reorderHabit, restoreHabit, toggleHabit, updateHabit } from "@/server/actions/habits";
import { ALL_DAYS, DEFAULT_HABIT_COLOR, DEFAULT_HABIT_ICON, FLAME_AT, HABIT_COLORS, HABIT_ICONS, MAX_ACTIVE_HABITS, describeDays, isHabitColor, isHabitIcon, type HabitOverview } from "@/lib/domain/habits";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { divide, focusRing, num, subCard } from "@/components/config/bold";
import { HabitBadge, HabitIcon } from "./habit-icon";

type Editing = { mode: "new" } | { mode: "edit"; habit: HabitOverview } | null;

/** Full habit management for the Personal page. */
export function HabitsManager({ habits, today }: { habits: HabitOverview[]; today: string }) {
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<HabitOverview | null>(null);
  const active = habits.filter((h) => h.active);
  const archived = habits.filter((h) => !h.active);
  const atCap = active.length >= MAX_ACTIVE_HABITS;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Quick daily check-ins with streaks. They&apos;re encouragement — they never touch your daily score.</p>
        <Button size="sm" onClick={() => setEditing({ mode: "new" })} disabled={atCap} aria-describedby={atCap ? "habit-cap-note" : undefined}>
          <Plus className="size-4" /> New habit
        </Button>
      </div>
      {atCap && (
        <p id="habit-cap-note" className="text-xs text-muted-foreground">
          You have {MAX_ACTIVE_HABITS} active habits — archive one to make room for another. A few kept well beats many half-kept.
        </p>
      )}

      {active.length === 0 ? (
        <EmptyState icon={Repeat} title="No habits yet" description="Start with one or two small things you'd like to do most days — drink water, read 10 pages, stretch." />
      ) : (
        <ul className={divide}>
          {active.map((h, i) => (
            <HabitRow key={h.id} habit={h} today={today} first={i === 0} last={i === active.length - 1} onEdit={() => setEditing({ mode: "edit", habit: h })} onDelete={() => setDeleting(h)} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <details className={cn(subCard, "group")}>
          <summary className={cn("cursor-pointer list-none rounded-[8px] px-4 py-2.5 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase select-none hover:text-foreground [&::-webkit-details-marker]:hidden", focusRing)}>
            Archived <span className={num}>({archived.length})</span>{" "}
            <span className="ml-1 inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden>
              ›
            </span>
          </summary>
          <ul className={cn(divide, "border-t-2 border-foreground/10 px-4 pb-2")}>
            {archived.map((h) => (
              <ArchivedRow key={h.id} habit={h} onDelete={() => setDeleting(h)} />
            ))}
          </ul>
        </details>
      )}

      <HabitDialog editing={editing} onClose={() => setEditing(null)} />
      <DeleteHabitDialog habit={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function HabitRow({ habit: h, today, first, last, onEdit, onDelete }: { habit: HabitOverview; today: string; first: boolean; last: boolean; onEdit: () => void; onDelete: () => void }) {
  const { run, pending } = useAction();
  const pct = h.rate.rate == null ? null : Math.round(h.rate.rate * 100);
  const gridDone = h.grid.filter((d) => d.expected && d.done).length;
  const gridBonus = h.grid.filter((d) => !d.expected && d.done).length;
  const gridExpected = h.grid.filter((d) => d.expected).length;

  return (
    <li className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:gap-5">
      <div className="flex min-w-0 items-center gap-3 lg:w-64 lg:shrink-0">
        {h.expectedToday ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={h.doneToday}
            aria-label={`${h.name} done today`}
            disabled={pending}
            onClick={() => run(() => toggleHabit(h.id, today, !h.doneToday), { success: false })}
            className={cn("press rounded-lg shadow-brutal-sm disabled:opacity-70", focusRing)}
            title={h.doneToday ? "Done today — click to undo" : "Tick for today"}
          >
            <HabitBadge icon={h.icon} color={h.color} filled={h.doneToday} />
          </button>
        ) : (
          <HabitBadge icon={h.icon} color={h.color} />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{h.name}</p>
          <p className="text-xs text-muted-foreground">{describeDays(h.daysOfWeek)}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-3">
        <div role="img" aria-label={`Last 30 days: ${gridDone} of ${gridExpected} expected days done${gridBonus > 0 ? `, plus ${gridBonus} extra` : ""}`} className="grid w-fit grid-cols-[repeat(15,auto)] gap-1 sm:flex sm:gap-[3px]">
          {h.grid.map((d) => (
            <span
              key={d.date}
              title={`${formatDate(d.date, "weekday")}${d.expected ? (d.done ? " · done" : d.date === today ? " · not yet" : " · not ticked") : d.done ? " · done (bonus)" : d.beforeStart ? " · before this habit started" : " · rest day"}`}
              className={cn(
                "size-3 rounded-[2px] border border-border sm:size-3.5",
                d.done ? (d.expected ? "bg-block-lime" : "bg-block-lime/50") : d.expected ? "bg-background" : "border-border/30 bg-muted",
                d.date === today && "outline-2 outline-offset-1 outline-foreground",
              )}
            />
          ))}
        </div>

        <dl className="flex items-center gap-2 text-xs">
          <div className={cn("flex items-center gap-1 rounded-md border-2 px-1.5 py-0.5", h.streak >= FLAME_AT ? "border-border bg-block-orange text-ink" : "border-transparent")} title="Current streak (expected days)">
            <dt className="sr-only">Current streak</dt>
            <Flame className={cn("size-3.5", h.streak < FLAME_AT && "text-muted-foreground")} aria-hidden />
            <dd className={num}>{h.streak}</dd>
          </div>
          <div className="flex items-center gap-1 px-1" title="Best streak">
            <dt className="sr-only">Best streak</dt>
            <Trophy className="size-3.5 text-muted-foreground" aria-hidden />
            <dd className={num}>{h.best}</dd>
          </div>
          <div className="flex items-center gap-1 px-1" title={`Last ${h.rate.expected} expected days`}>
            <dt className="sr-only">Completion</dt>
            <dd className={cn(num, "text-muted-foreground")}>{pct == null ? "New" : `${pct}%`}</dd>
          </div>
        </dl>
      </div>

      <div className="flex items-center gap-0.5 self-end lg:self-auto">
        <Button variant="ghost" size="icon-sm" aria-label={`Move ${h.name} up`} disabled={pending || first} onClick={() => run(() => reorderHabit(h.id, "up"))}>
          <ArrowUp className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Move ${h.name} down`} disabled={pending || last} onClick={() => run(() => reorderHabit(h.id, "down"))}>
          <ArrowDown className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${h.name}`} onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${h.name}`} />}>
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => run(() => archiveHabit(h.id))}>
              <Archive className="size-4" /> Archive
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4" /> Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function ArchivedRow({ habit: h, onDelete }: { habit: HabitOverview; onDelete: () => void }) {
  const { run, pending } = useAction();
  return (
    <li className="flex items-center gap-3 py-2">
      <HabitBadge icon={h.icon} color={h.color} className="opacity-60" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-muted-foreground">{h.name}</p>
        <p className="text-xs text-muted-foreground">
          Best streak <span className={num}>{h.best}</span>
        </p>
      </div>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => restoreHabit(h.id))}>
        <ArchiveRestore className="size-4" /> Restore
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${h.name}`} onClick={onDelete} className="hover:bg-block-pink hover:text-ink">
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

function HabitDialog({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { run, pending } = useAction();
  const open = editing !== null;
  const habit = editing?.mode === "edit" ? editing.habit : null;
  // Values outside the allowed lists (e.g. older data) fall back to defaults so saving never fails silently.
  const init = () => ({
    name: habit?.name ?? "",
    icon: habit && isHabitIcon(habit.icon) ? habit.icon : DEFAULT_HABIT_ICON,
    color: habit && isHabitColor(habit.color) ? habit.color : DEFAULT_HABIT_COLOR,
    daysOfWeek: habit?.daysOfWeek.length ? [...habit.daysOfWeek] : [...ALL_DAYS],
  });
  const [v, setV] = useState(init);
  const [seen, setSeen] = useState<Editing>(null);
  if (editing !== seen) {
    setSeen(editing);
    if (editing) setV(init());
  }
  const name = v.name.trim();
  const valid = name.length > 0 && name.length <= 60 && v.daysOfWeek.length > 0;

  function save() {
    const payload = { ...v, name };
    run(() => (habit ? updateHabit(habit.id, payload) : createHabit(payload)), { onSuccess: onClose });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{habit ? "Edit habit" : "New habit"}</DialogTitle>
          <DialogDescription>Keep it small enough to do on a tired day.</DialogDescription>
        </DialogHeader>
        <form
          id="habit-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save();
          }}
        >
          <Field label="Name" htmlFor="habit-name" hint={`${name.length}/60`}>
            <div className="flex items-center gap-2">
              <HabitBadge icon={v.icon} color={v.color} filled />
              <Input id="habit-name" value={v.name} maxLength={60} autoFocus placeholder="e.g. Drink 2L water" onChange={(e) => setV({ ...v, name: e.target.value })} />
            </div>
          </Field>

          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Icon</legend>
            <div role="radiogroup" aria-label="Icon" className="grid grid-cols-7 gap-1.5">
              {HABIT_ICONS.map((icon) => {
                const on = v.icon === icon;
                return (
                  <button
                    key={icon}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={iconLabel(icon)}
                    title={iconLabel(icon)}
                    onClick={() => setV({ ...v, icon })}
                    className={cn("grid h-9 place-items-center rounded-md border-2 transition-colors", focusRing, on ? "border-border bg-primary text-primary-foreground shadow-brutal-sm" : "border-border/30 text-muted-foreground hover:border-border hover:text-foreground")}
                  >
                    <HabitIcon name={icon} />
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Colour</legend>
            <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
              {HABIT_COLORS.map((c) => {
                const on = v.color === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={c.label}
                    title={c.label}
                    onClick={() => setV({ ...v, color: c.value })}
                    className={cn("grid size-8 place-items-center rounded-md border-2 border-border text-ink transition-transform", focusRing, on ? "shadow-brutal-sm" : "hover:-translate-y-px")}
                    style={{ background: c.value }}
                  >
                    {on && <Check className="size-4" strokeWidth={3} aria-hidden />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Days · {describeDays(v.daysOfWeek)}
            </p>
            <DayPicker label="Days this habit is expected" value={v.daysOfWeek} onChange={(daysOfWeek) => setV({ ...v, daysOfWeek })} />
            {v.daysOfWeek.length === 0 && (
              <p className="text-xs text-destructive" role="alert">
                Pick at least one day.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Streaks only count these days — rest days never break them.</p>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="habit-form" disabled={pending || !valid}>
            {habit ? "Save" : "Add habit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteHabitDialog({ habit: target, onClose }: { habit: HabitOverview | null; onClose: () => void }) {
  const { run, pending } = useAction();
  // Keep showing the last habit while the dialog animates closed (avoids an empty title flash).
  const [habit, setHabit] = useState<HabitOverview | null>(target);
  if (target && target !== habit) setHabit(target);
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{habit?.name}”?</DialogTitle>
          <DialogDescription>
            This permanently removes the habit and all of its check-ins. It can&apos;t be undone.
            {habit?.active ? " If you just want it out of your day, archive it instead — its history is kept." : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {habit?.active && (
            <Button variant="secondary" disabled={pending} onClick={() => habit && run(() => archiveHabit(habit.id), { onSuccess: onClose })}>
              Archive instead
            </Button>
          )}
          <Button variant="destructive" disabled={pending || !target} onClick={() => habit && run(() => deleteHabit(habit.id), { onSuccess: onClose })}>
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function iconLabel(name: string): string {
  return name.replace(/\d+$/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
}
