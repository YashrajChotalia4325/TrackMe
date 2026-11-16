"use client";

import { useState } from "react";
import { CalendarDays, Check, Moon, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DayPicker, Field, NativeSelect, TimeInput } from "@/components/common/form";
import { EmptyState } from "@/components/common/ui";
import { useAction } from "@/components/common/use-action";
import { createDayTemplate, createSuggestedTemplates, deleteDayTemplate, setDayOverride, updateDayTemplate } from "@/server/actions/rhythm";
import { awakeWindowError, findWeekdayClash, formatDays } from "@/lib/domain/rhythm";
import { DAY_LABELS_LONG, formatDate, formatDuration, formatMinute } from "@/lib/time";
import { cn } from "@/lib/utils";
import { chip, focusRing, inset, num, rowIconBtn, subCard, templateFill } from "@/components/config/bold";

export interface TemplateView {
  id: string;
  name: string;
  color: string;
  daysOfWeek: number[];
  wakeMinute: number;
  sleepMinute: number;
  focusLimitMin: number;
  taskLimit: number;
  restDay: boolean;
}

export interface OverrideView {
  date: string;
  templateId: string;
  templateName: string;
  color: string;
}

export interface RhythmDefaultsView {
  wakeMinute: number;
  sleepMinute: number;
  dailyFocusLimitMin: number;
  dailyTaskLimit: number;
}

const SWATCHES: { value: string; name: string }[] = [
  { value: "#FACC15", name: "Yellow" },
  { value: "#60A5FA", name: "Blue" },
  { value: "#2DD4BF", name: "Teal" },
  { value: "#22C55E", name: "Green" },
  { value: "#A78BFA", name: "Violet" },
  { value: "#F472B6", name: "Pink" },
  { value: "#FB923C", name: "Orange" },
  { value: "#94A3B8", name: "Slate" },
];

// ───────── Template list ─────────

export function TemplatesManager({ templates, overrides, defaults }: { templates: TemplateView[]; overrides: OverrideView[]; defaults: RhythmDefaultsView }) {
  const { run, pending } = useAction();
  // The last selected template is kept while its dialog animates closed, so the
  // title and fields don't flash to an empty "new" state.
  const [editing, setEditing] = useState<TemplateView | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState<TemplateView | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No day templates yet"
        description="Every day uses your default schedule. Templates let college days, internship days and weekends each have their own wake-up, sleep and workload."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button disabled={pending} onClick={() => run(() => createSuggestedTemplates())}>
              <Sparkles className="size-4" aria-hidden /> Create suggested templates
            </Button>
            <NewTemplateButton templates={templates} defaults={defaults} variant="outline" />
          </div>
        }
      />
    );
  }

  const overrideCount = (id: string) => overrides.filter((o) => o.templateId === id).length;

  return (
    <>
      <ul className="grid gap-2 sm:grid-cols-2">
        {templates.map((t) => (
          <li key={t.id} className={cn(subCard, "flex items-start gap-3 p-3")}>
            <span className="mt-0.5 size-4 shrink-0 rounded-[4px] border-2 border-border" style={{ background: templateFill(t.color) }} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold">{t.name}</p>
                {t.restDay && (
                  <span className={cn(chip, "bg-block-teal")}>
                    <Moon className="size-3" aria-hidden /> Rest day
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatDays(t.daysOfWeek)}</p>
              <p className={cn(num, "mt-1 text-xs text-muted-foreground")}>
                {formatMinute(t.wakeMinute)} – {formatMinute(t.sleepMinute)} · {formatDuration(t.focusLimitMin)} focus · up to {t.taskLimit} task{t.taskLimit === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" className={cn(rowIconBtn, "hover:bg-block-sky")} aria-label={`Edit ${t.name}`} onClick={() => {
                  setEditing(t);
                  setEditOpen(true);
                }}>
                <Pencil className="size-3.5" aria-hidden />
              </button>
              <button type="button" className={rowIconBtn} aria-label={`Delete ${t.name}`} onClick={() => {
                  setDeleting(t);
                  setDeleteOpen(true);
                }}>
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <TemplateDialog open={editOpen && editing != null} onOpenChange={setEditOpen} template={editing} templates={templates} defaults={defaults} />

      <Dialog open={deleteOpen && deleting != null} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              Its days go back to your default schedule. Your tasks are not changed.
              {deleting && overrideCount(deleting.id) > 0 &&
                ` ${overrideCount(deleting.id)} upcoming date${overrideCount(deleting.id) === 1 ? "" : "s"} set to use this template will go back to normal too.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => deleting && run(() => deleteDayTemplate(deleting.id), { onSuccess: () => setDeleteOpen(false) })}>
              Delete template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NewTemplateButton({ templates, defaults, variant = "default" }: { templates: TemplateView[]; defaults: RhythmDefaultsView; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> New template
      </Button>
      <TemplateDialog open={open} onOpenChange={setOpen} template={null} templates={templates} defaults={defaults} />
    </>
  );
}

// ───────── Create / edit dialog ─────────

function TemplateDialog({
  open,
  onOpenChange,
  template,
  templates,
  defaults,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: TemplateView | null;
  templates: TemplateView[];
  defaults: RhythmDefaultsView;
}) {
  const { run, pending } = useAction();
  const init = () => ({
    name: template?.name ?? "",
    color: template?.color ?? SWATCHES[0].value,
    daysOfWeek: template?.daysOfWeek ?? [],
    wakeMinute: template?.wakeMinute ?? defaults.wakeMinute,
    sleepMinute: template?.sleepMinute ?? defaults.sleepMinute,
    focusLimitMin: template?.focusLimitMin ?? defaults.dailyFocusLimitMin,
    taskLimit: template?.taskLimit ?? defaults.dailyTaskLimit,
    restDay: template?.restDay ?? false,
  });
  const [v, setV] = useState(init);
  const [wasOpen, setWasOpen] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (open !== wasOpen || (open && (template?.id ?? null) !== lastId)) {
    setWasOpen(open);
    setLastId(template?.id ?? null);
    if (open) setV(init());
  }

  const clash = findWeekdayClash(templates, v.daysOfWeek, template?.id);
  const awake = awakeWindowError(v.wakeMinute, v.sleepMinute);
  const save = () =>
    run(() => (template ? updateDayTemplate(template.id, v) : createDayTemplate(v)), {
      onSuccess: () => onOpenChange(false),
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? "Edit day template" : "New day template"}</DialogTitle>
          <DialogDescription>A kind of day with its own hours and workload. Each weekday can belong to one template; any date can use a different one.</DialogDescription>
        </DialogHeader>
        <form
          id="rhythm-template-form"
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field label="Name" htmlFor="tpl-name" className="sm:col-span-2">
            <Input id="tpl-name" value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. College day, Internship day, Exam day" />
          </Field>
          <Field label="Colour" className="sm:col-span-2">
            <div role="radiogroup" aria-label="Template colour" className="flex flex-wrap gap-2">
              {SWATCHES.map(({ value: c, name }) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={v.color.toLowerCase() === c.toLowerCase()}
                  aria-label={name}
                  onClick={() => setV({ ...v, color: c })}
                  title={name}
                  className={cn(
                    "on-block grid size-8 place-items-center rounded-md border-2 border-border transition-[transform,box-shadow] motion-reduce:transition-none",
                    focusRing,
                    v.color.toLowerCase() === c.toLowerCase() ? "shadow-brutal-sm motion-safe:-translate-x-px motion-safe:-translate-y-px" : "",
                  )}
                  style={{ background: templateFill(c) }}
                >
                  {v.color.toLowerCase() === c.toLowerCase() && <Check className="size-4" strokeWidth={3} aria-hidden />}
                </button>
              ))}
            </div>
          </Field>
          <Field
            label="Default days"
            className="sm:col-span-2"
            error={clash ? `${DAY_LABELS_LONG[clash.day]} already uses “${clash.templateName}”.` : undefined}
            hint="Leave empty for a template you only use on specific dates (e.g. Exam day)."
          >
            <DayPicker value={v.daysOfWeek} onChange={(d) => setV({ ...v, daysOfWeek: d })} label="Default days for this template" />
          </Field>
          <Field label="Wake up" htmlFor="tpl-wake">
            <TimeInput id="tpl-wake" value={v.wakeMinute} onChange={(m) => m != null && setV({ ...v, wakeMinute: m })} />
          </Field>
          <Field label="Sleep" htmlFor="tpl-sleep" error={awake ?? undefined}>
            <TimeInput id="tpl-sleep" value={v.sleepMinute} onChange={(m) => m != null && setV({ ...v, sleepMinute: m })} />
          </Field>
          <Field label="Focus limit (hours)" htmlFor="tpl-focus" hint={formatDuration(v.focusLimitMin)}>
            <Input
              id="tpl-focus"
              type="number"
              inputMode="decimal"
              min={0.5}
              max={16}
              step={0.5}
              value={v.focusLimitMin / 60}
              onChange={(e) => setV({ ...v, focusLimitMin: Math.round((Number(e.target.value) || 0) * 60) })}
            />
          </Field>
          <Field label="Task limit" htmlFor="tpl-tasks">
            <Input id="tpl-tasks" type="number" inputMode="numeric" min={1} max={30} value={v.taskLimit} onChange={(e) => setV({ ...v, taskLimit: Math.round(Number(e.target.value) || 0) })} />
          </Field>
          <div className={cn(inset, "flex items-start justify-between gap-3 p-3 sm:col-span-2")}>
            <div>
              <label htmlFor="tpl-rest" className="text-sm font-semibold">
                Rest day
              </label>
              <p className="text-xs text-muted-foreground">Only essentials are planned: fixed commitments, high-priority work and anything due within 2 days.</p>
            </div>
            <Switch id="tpl-rest" checked={v.restDay} onCheckedChange={(c) => setV({ ...v, restDay: c })} />
          </div>
        </form>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="rhythm-template-form" disabled={pending || !v.name.trim() || !!clash || !!awake}>
            {template ? "Save template" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────── Date overrides ─────────

export function OverrideControl({ templates, overrides, today }: { templates: TemplateView[]; overrides: OverrideView[]; today: string }) {
  const { run, pending } = useAction();
  const [date, setDate] = useState(today);
  const [picked, setPicked] = useState(templates[0]?.id ?? "");
  // If the picked template was deleted (or none was picked yet), fall back to the first one.
  const templateId = templates.some((t) => t.id === picked) ? picked : (templates[0]?.id ?? "");

  if (templates.length === 0) return null;

  return (
    <div className="space-y-3">
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setDayOverride({ date, templateId: templateId || null }));
        }}
      >
        <Field label="Date" htmlFor="ovr-date">
          <Input id="ovr-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="dark:[color-scheme:dark]" />
        </Field>
        <Field label="Use template" htmlFor="ovr-tpl">
          <NativeSelect id="ovr-tpl" value={templateId} onChange={(e) => setPicked(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Button type="submit" variant="secondary" disabled={pending || !date || !templateId}>
          Apply to date
        </Button>
      </form>
      {overrides.length === 0 ? (
        <p className="text-xs text-muted-foreground">No upcoming dates with a different template.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Upcoming date overrides">
          {overrides.map((o) => (
            <li key={o.date} className="inline-flex items-center gap-2 rounded-md border-2 border-border bg-card py-1 pr-1 pl-2 text-xs">
              <span className="size-3 rounded-[3px] border-2 border-border" style={{ background: templateFill(o.color) }} aria-hidden />
              <span className="font-semibold">{formatDate(o.date, "weekday")}</span>
              <span className="text-muted-foreground">{o.templateName}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={pending}
                aria-label={`Use the usual rhythm on ${formatDate(o.date, "weekday")}`}
                onClick={() => run(() => setDayOverride({ date: o.date, templateId: null }))}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
