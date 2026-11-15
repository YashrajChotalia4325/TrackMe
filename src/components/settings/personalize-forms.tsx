"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CalendarCheck2, LayoutDashboard, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { WhyQuote } from "@/components/dashboard/why-quote";
import { resetDashboardLayout, updateDashboardLayout, updatePersonalWhy, updateStartPage } from "@/server/actions/personalize";
import { isDefaultLayout, moveItem, normalizeLayout, PANEL_BY_ID, PERSONAL_WHY_MAX, type DashboardLayout, type DashboardPanelId, type StartPage } from "@/lib/domain/dashboard-layout";
import { cn } from "@/lib/utils";

const tidy = (v: string) => v.replace(/\s+/g, " ").trim();

// ── Your why ──

export function PersonalWhyForm({ initial, preview }: { initial: string; preview: { date: string; greeting: string; fallback: string } }) {
  const { run, pending } = useAction();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(tidy(initial));
  const id = useId();
  const clean = tidy(text);
  const over = clean.length > PERSONAL_WHY_MAX;
  const dirty = clean !== saved;

  function save(value: string) {
    run(() => updatePersonalWhy(value), {
      onSuccess: () => {
        setSaved(tidy(value));
        setText(tidy(value));
      },
    });
  }

  return (
    <form
      className="grid gap-5 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!over) save(text);
      }}
    >
      <div className="grid content-start gap-3">
        <Field
          label="What are you working toward?"
          htmlFor={`${id}-why`}
          error={over ? `Keep it to ${PERSONAL_WHY_MAX} characters` : undefined}
          hint="Short and personal works best. Leave it empty to see a rotating quote instead."
        >
          <Textarea
            id={`${id}-why`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={PERSONAL_WHY_MAX + 40}
            placeholder="Graduate strong, land a great job and start earning by December 2027."
            aria-describedby={`${id}-count`}
            aria-invalid={over}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending || over || !dirty}>
            Save
          </Button>
          {saved && (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => save("")}>
              Clear
            </Button>
          )}
          <span id={`${id}-count`} className={cn("tabular ml-auto text-xs", over ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
            {clean.length} / {PERSONAL_WHY_MAX}
          </span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Preview on your dashboard</p>
        <div className="rounded-xl border border-border bg-background/40 p-4" aria-label="Dashboard header preview" role="group">
          <p className="text-xs text-muted-foreground">{preview.date}</p>
          <p className="mt-1 text-xl font-semibold tracking-tight">{preview.greeting}</p>
          {clean ? <WhyQuote text={clean} /> : <p className="mt-1 text-sm text-muted-foreground">{preview.fallback}</p>}
        </div>
      </div>
    </form>
  );
}

// ── Dashboard layout ──

const COLUMN_LABEL = { main: "Left column", side: "Right column", full: "Full width" } as const;

export function DashboardLayoutForm({ initial }: { initial: DashboardLayout }) {
  const { run, pending } = useAction();
  const [layout, setLayout] = useState<DashboardLayout>(() => normalizeLayout(initial));
  const [saved, setSaved] = useState<DashboardLayout>(() => normalizeLayout(initial));
  const [announcement, setAnnouncement] = useState("");
  const focusTarget = useRef<{ id: DashboardPanelId; dir: "up" | "down" } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  const dirty = JSON.stringify(layout) !== JSON.stringify(saved);
  const isDefault = isDefaultLayout(layout);
  const visibleCount = layout.filter((x) => !x.hidden).length;

  // Keep keyboard focus on the moved row's button (or its sibling when it hits an end).
  useEffect(() => {
    const t = focusTarget.current;
    if (!t) return;
    focusTarget.current = null;
    const own = buttons.current.get(`${t.id}-${t.dir}`);
    const other = buttons.current.get(`${t.id}-${t.dir === "up" ? "down" : "up"}`);
    (own && !own.disabled ? own : other)?.focus();
  }, [layout]);

  function move(index: number, delta: -1 | 1) {
    const next = moveItem(layout, index, delta);
    if (next === layout) return;
    const item = layout[index];
    setLayout(next);
    setAnnouncement(`${PANEL_BY_ID[item.id].label} moved to position ${index + delta + 1} of ${layout.length}.`);
    focusTarget.current = { id: item.id, dir: delta === -1 ? "up" : "down" };
  }

  function toggle(id: DashboardPanelId, show: boolean) {
    setLayout((l) => l.map((x) => (x.id === id ? { ...x, hidden: !show } : x)));
    setAnnouncement(`${PANEL_BY_ID[id].label} ${show ? "shown" : "hidden"}.`);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Order applies within each column: left-column panels stack on the left, right-column panels on the right, and full-width panels sit below. On small screens the left column stacks above the right.
      </p>

      <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border" aria-label="Dashboard panels">
        {layout.map((item, i) => {
          const meta = PANEL_BY_ID[item.id];
          const switchId = `layout-show-${item.id}`;
          return (
            <li key={item.id} className={cn("flex items-center gap-3 px-3 py-3 transition-colors sm:px-4", item.hidden && "bg-muted/20")}>
              <span className="tabular grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-medium text-muted-foreground" aria-hidden>
                {i + 1}
              </span>
              <div className={cn("min-w-0 flex-1", item.hidden && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <label htmlFor={switchId} className="text-sm font-medium">
                    {meta.label}
                  </label>
                  <span className="rounded-md border border-border px-1.5 py-px text-[10px] text-muted-foreground">{COLUMN_LABEL[meta.column]}</span>
                  {item.hidden && <span className="text-[10px] text-muted-foreground uppercase">Hidden</span>}
                </div>
                <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{meta.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  ref={(el) => {
                    if (el) buttons.current.set(`${item.id}-up`, el);
                    else buttons.current.delete(`${item.id}-up`);
                  }}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`Move ${meta.label} up`}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  ref={(el) => {
                    if (el) buttons.current.set(`${item.id}-down`, el);
                    else buttons.current.delete(`${item.id}-down`);
                  }}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === layout.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move ${meta.label} down`}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Switch id={switchId} className="ml-2" checked={!item.hidden} onCheckedChange={(v) => toggle(item.id, v)} aria-label={`Show ${meta.label}`} />
              </div>
            </li>
          );
        })}
      </ol>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {visibleCount === 0 && <p className="text-xs text-muted-foreground">Every panel is hidden, so the dashboard will be empty. That&apos;s allowed; your data stays put.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={pending || !dirty} onClick={() => run(() => updateDashboardLayout(layout), { onSuccess: () => setSaved(layout) })}>
          <LayoutDashboard aria-hidden /> Save layout
        </Button>
        {dirty && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setLayout(saved)}>
            Discard changes
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="sm:ml-auto"
          disabled={pending || (isDefault && isDefaultLayout(saved))}
          onClick={() =>
            run(() => resetDashboardLayout(), {
              onSuccess: () => {
                const d = normalizeLayout(null);
                setLayout(d);
                setSaved(d);
              },
            })
          }
        >
          <RotateCcw aria-hidden /> Reset to default
        </Button>
        {dirty && <span className="w-full text-xs text-muted-foreground">You have unsaved changes.</span>}
      </div>
    </div>
  );
}

// ── Start page ──

const START_OPTIONS: { value: StartPage; label: string; description: string; icon: typeof LayoutDashboard }[] = [
  { value: "/dashboard", label: "Dashboard", description: "Score, tasks, week and goals at a glance.", icon: LayoutDashboard },
  { value: "/my-day", label: "My Day", description: "Today's timeline, focused on what's next.", icon: CalendarCheck2 },
];

export function StartPageForm({ initial }: { initial: StartPage }) {
  const { run, pending } = useAction();
  const [value, setValue] = useState<StartPage>(initial);
  const name = useId();

  function choose(v: StartPage) {
    if (v === value || pending) return;
    const prev = value;
    setValue(v);
    run(async () => {
      // Roll back the optimistic choice if the save fails or the request throws.
      try {
        const r = await updateStartPage(v);
        if (!r.ok) setValue(prev);
        return r;
      } catch (e) {
        setValue(prev);
        throw e;
      }
    });
  }

  return (
    <fieldset className="grid gap-3 sm:grid-cols-2" aria-busy={pending}>
      <legend className="sr-only">Start page</legend>
      {START_OPTIONS.map((o) => {
        const checked = value === o.value;
        const Icon = o.icon;
        return (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              checked ? "border-primary/60 bg-primary/5" : "border-border hover:bg-muted/30",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={checked} onChange={() => choose(o.value)} className="sr-only" />
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{o.description}</span>
            </span>
            <span
              aria-hidden
              className={cn("mt-1 grid size-4 shrink-0 place-items-center rounded-full border", checked ? "border-primary" : "border-muted-foreground/40")}
            >
              {checked && <span className="size-2 rounded-full bg-primary" />}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
