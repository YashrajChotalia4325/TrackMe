"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DayPicker, Field, NativeSelect, TimeInput } from "@/components/common/form";
import { createTask, updateTask } from "@/server/actions/tasks";
import { useAction } from "@/components/common/use-action";
import { KIND_META } from "@/lib/domain/constants";
import { dayOfWeek, isISODate } from "@/lib/time";
import type { TaskFormOptions, TaskView } from "@/server/queries";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./category-style";

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  categoryId: z.string().min(1, "Choose a category"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  kind: z.enum(["FIXED", "HIGH_PRIORITY", "RECURRING", "FLEXIBLE", "OPTIONAL"]),
  date: z.string().refine(isISODate, "Pick a date"),
  startMinute: z.number().nullable(),
  durationMin: z.number({ message: "Enter minutes" }).int().min(5, "At least 5 minutes").max(720),
  deadline: z.string().optional(),
  canSkip: z.boolean(),
  weeklyTargetId: z.string().optional(),
  goalId: z.string().optional(),
  notes: z.string().max(5000).optional(),
  repeat: z.boolean(),
  daysOfWeek: z.array(z.number()),
  repeatUntil: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  options: TaskFormOptions;
  task?: TaskView | null;
  defaults?: Partial<{ date: string; startMinute: number | null; categoryKey: string }>;
}

export function TaskFormDialog({ open, onOpenChange, options, task, defaults }: TaskFormDialogProps) {
  const { run, pending } = useAction();
  const [showMore, setShowMore] = useState(false);
  const defaultCat = options.categories.find((c) => c.key === (defaults?.categoryKey ?? "PERSONAL")) ?? options.categories[0];

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: blank(),
  });

  function blank(): FormValues {
    const date = task?.date ?? defaults?.date ?? options.today;
    return {
      title: task?.title ?? "",
      description: task?.description ?? "",
      categoryId: task?.categoryId ?? defaultCat?.id ?? "",
      priority: task?.priority ?? "MEDIUM",
      kind: task?.kind ?? "FLEXIBLE",
      date,
      startMinute: task ? task.startMinute : (defaults?.startMinute ?? null),
      durationMin: task?.durationMin ?? 60,
      deadline: task?.deadline ?? "",
      canSkip: task?.canSkip ?? false,
      weeklyTargetId: task?.weeklyTargetId ?? "",
      goalId: task?.goalId ?? "",
      notes: task?.notes ?? "",
      repeat: false,
      daysOfWeek: [dayOfWeek(date)],
      repeatUntil: "",
    };
  }

  useEffect(() => {
    if (open) {
      form.reset(blank());
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowMore(Boolean(task?.deadline || task?.weeklyTargetId || task?.goalId || task?.notes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const categoryId = form.watch("categoryId");
  const repeat = form.watch("repeat");
  const targets = options.targets.filter((t) => t.categoryId === categoryId);
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((v) => {
    const payload = {
      title: v.title,
      description: v.description || undefined,
      categoryId: v.categoryId,
      priority: v.priority,
      kind: v.kind,
      date: v.date,
      startMinute: v.startMinute,
      durationMin: v.durationMin,
      deadline: v.deadline || null,
      canSkip: v.canSkip,
      weeklyTargetId: v.weeklyTargetId || null,
      goalId: v.goalId || null,
      notes: v.notes || undefined,
      recurrence: !task && v.repeat && v.daysOfWeek.length ? { daysOfWeek: v.daysOfWeek, endDate: v.repeatUntil || null } : null,
    };
    run(() => (task ? updateTask(task.id, payload) : createTask(payload)), { onSuccess: () => onOpenChange(false) });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>{task ? "Changes are recorded in your schedule history." : "Only the title is required — everything else has sensible defaults."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field label="Title" htmlFor="t-title" error={errors.title?.message}>
            <Input id="t-title" autoFocus placeholder="e.g. Revise Operating Systems unit 3" {...form.register("title")} aria-invalid={!!errors.title} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="t-cat" error={errors.categoryId?.message}>
              <NativeSelect id="t-cat" {...form.register("categoryId")}>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Priority" htmlFor="t-pri">
              <NativeSelect id="t-pri" {...form.register("priority")}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Date" htmlFor="t-date" error={errors.date?.message}>
              <Input id="t-date" type="date" {...form.register("date")} className="dark:[color-scheme:dark]" />
            </Field>
            <Field label="Start time" htmlFor="t-start" hint="Leave empty for any time">
              <Controller control={form.control} name="startMinute" render={({ field }) => <TimeInput id="t-start" value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field label="Duration (min)" htmlFor="t-dur" error={errors.durationMin?.message} className="col-span-2 sm:col-span-1">
              <Input id="t-dur" type="number" min={5} max={720} step={5} {...form.register("durationMin", { valueAsNumber: true })} />
            </Field>
          </div>
          <Field label="Scheduling type" htmlFor="t-kind" hint={KIND_META[form.watch("kind")].hint}>
            <NativeSelect id="t-kind" {...form.register("kind")}>
              {Object.entries(KIND_META).map(([k, m]) => (
                <option key={k} value={k}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </Field>

          {!task && (
            <div className="grid gap-3 rounded-[8px] border-2 border-ink bg-muted p-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold">
                  Repeat weekly
                  <span className="block text-xs font-normal text-muted-foreground">Creates a recurring task — future copies are generated automatically.</span>
                </span>
                <Controller control={form.control} name="repeat" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Repeat weekly" />} />
              </label>
              {repeat && (
                <>
                  <Controller control={form.control} name="daysOfWeek" render={({ field }) => <DayPicker value={field.value} onChange={field.onChange} label="Repeat on" />} />
                  <Field label="Until (optional)" htmlFor="t-until">
                    <Input id="t-until" type="date" {...form.register("repeatUntil")} className="dark:[color-scheme:dark]" />
                  </Field>
                </>
              )}
            </div>
          )}

          <button type="button" onClick={() => setShowMore((v) => !v)} className={cn("justify-self-start rounded-[4px] text-xs font-semibold text-foreground underline decoration-2 underline-offset-4 hover:decoration-[3px]", FOCUS_RING)} aria-expanded={showMore}>
            {showMore ? "Hide details" : "More details (deadline, target, goal, notes)"}
          </button>
          {showMore && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Deadline" htmlFor="t-deadline">
                  <Input id="t-deadline" type="date" {...form.register("deadline")} className="dark:[color-scheme:dark]" />
                </Field>
                <Field label="Weekly target" htmlFor="t-target" hint={targets.length ? undefined : "No targets in this category"}>
                  <NativeSelect id="t-target" {...form.register("weeklyTargetId")} disabled={!targets.length}>
                    <option value="">None</option>
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Contributes to goal" htmlFor="t-goal">
                <NativeSelect id="t-goal" {...form.register("goalId")}>
                  <option value="">None</option>
                  {options.goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Description" htmlFor="t-desc">
                <Textarea id="t-desc" rows={2} {...form.register("description")} />
              </Field>
              <Field label="Notes" htmlFor="t-notes">
                <Textarea id="t-notes" rows={2} {...form.register("notes")} />
              </Field>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Can be skipped without penalty</span>
                <Controller control={form.control} name="canSkip" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Can be skipped" />} />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : task ? "Save changes" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
