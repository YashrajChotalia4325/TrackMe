"use client";

import { useState } from "react";
import { Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DayPicker, Field, NativeSelect, TimeInput } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { createWeeklyTarget, updateProfile, updateSettings, updateWeights } from "@/server/actions/settings";
import { stopRecurring } from "@/server/actions/tasks";
import { undoVersion } from "@/server/actions/schedule";
import { CATEGORY_META, SCORED_CATEGORIES, type CategoryKeyT, type ModeT } from "@/lib/domain/constants";
import { DAY_LABELS, formatDuration, formatMinute } from "@/lib/time";
import { cn } from "@/lib/utils";

type Profile = Record<"displayName" | "location" | "education" | "college" | "graduationTarget" | "currentRole" | "company" | "currentFocus" | "mbaObjective" | "mbaAdmissionTarget" | "creativeAmbition" | "creativeObjective" | "sideProject" | "image", string>;

const PROFILE_FIELDS: [keyof Profile, string][] = [
  ["displayName", "Name"],
  ["location", "Location"],
  ["education", "Education"],
  ["college", "College"],
  ["graduationTarget", "Expected graduation (YYYY-MM)"],
  ["currentRole", "Current role"],
  ["company", "Company"],
  ["currentFocus", "Current focus"],
  ["mbaObjective", "MBA objective"],
  ["mbaAdmissionTarget", "MBA admission target"],
  ["creativeAmbition", "Creative ambition"],
  ["creativeObjective", "Current creative objective"],
  ["sideProject", "Side project"],
  ["image", "Profile picture URL (optional)"],
];

export function ProfileForm({ initial }: { initial: Profile }) {
  const { run, pending } = useAction();
  const [v, setV] = useState(initial);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateProfile(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "image" ? x : x || undefined]))));
      }}
    >
      {PROFILE_FIELDS.map(([k, label]) => (
        <Field key={k} label={label} htmlFor={`pf-${k}`} className={k === "image" ? "sm:col-span-2" : undefined}>
          <Input id={`pf-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} type={k === "image" ? "url" : "text"} placeholder={k === "image" ? "https://…" : undefined} />
        </Field>
      ))}
      <Button type="submit" disabled={pending || !v.displayName.trim()} className="justify-self-start sm:col-span-2">
        Save profile
      </Button>
    </form>
  );
}

export interface ScheduleSettings {
  timezone: string;
  wakeMinute: number;
  sleepMinute: number;
  dailyFocusLimitMin: number;
  dailyTaskLimit: number;
  breakMinutes: number;
  minRestBetweenMin: number;
  preferEarlierHours: boolean;
  planningStart: string;
  planningEnd: string;
  catTargetDate: string;
  gymDays: number[];
  gymPreferredStart: number | null;
  gymDurationMin: number;
  aiDailyMin: number;
  aiWeeklyMin: number;
  aiMonthlyMin: number;
  sleepTargetHours: number;
  waterTargetMl: number;
}

export function ScheduleForm({ initial }: { initial: ScheduleSettings }) {
  const { run, pending } = useAction();
  const [v, setV] = useState(initial);
  const sleepHours = (24 * 60 - (v.sleepMinute - v.wakeMinute)) / 60;
  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateSettings(v));
      }}
    >
      <section className="grid gap-3 sm:grid-cols-3">
        <h3 className="text-sm font-semibold sm:col-span-3">Sleep & availability</h3>
        <Field label="Wake-up" htmlFor="s-wake"><TimeInput id="s-wake" value={v.wakeMinute} onChange={(m) => m != null && setV({ ...v, wakeMinute: m })} /></Field>
        <Field label="Bedtime" htmlFor="s-sleep" hint={`${sleepHours}h protected sleep`}><TimeInput id="s-sleep" value={v.sleepMinute} onChange={(m) => m != null && setV({ ...v, sleepMinute: m })} /></Field>
        <Field label="Sleep target (h)" htmlFor="s-st"><Input id="s-st" type="number" min={4} max={12} step={0.5} value={v.sleepTargetHours} onChange={(e) => setV({ ...v, sleepTargetHours: Number(e.target.value) })} /></Field>
        <Field label="Max focus work / day (h)" htmlFor="s-focus" hint="Excludes lectures & work hours"><Input id="s-focus" type="number" min={0.5} step={0.5} value={v.dailyFocusLimitMin / 60} onChange={(e) => setV({ ...v, dailyFocusLimitMin: Math.round(Number(e.target.value) * 60) })} /></Field>
        <Field label="Max tasks / day" htmlFor="s-tasks"><Input id="s-tasks" type="number" min={1} max={30} value={v.dailyTaskLimit} onChange={(e) => setV({ ...v, dailyTaskLimit: Number(e.target.value) })} /></Field>
        <Field label="Rest between tasks (min)" htmlFor="s-rest"><Input id="s-rest" type="number" min={0} max={60} value={v.minRestBetweenMin} onChange={(e) => setV({ ...v, minRestBetweenMin: Number(e.target.value), breakMinutes: Number(e.target.value) })} /></Field>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm sm:col-span-3">
          <span>
            Learn from my history
            <span className="block text-xs text-muted-foreground">If late-night tasks are often missed, new sessions are placed earlier.</span>
          </span>
          <Switch checked={v.preferEarlierHours} onCheckedChange={(x) => setV({ ...v, preferEarlierHours: x })} aria-label="Learn from history" />
        </label>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <h3 className="text-sm font-semibold sm:col-span-3">Fitness</h3>
        <Field label="Gym days" className="sm:col-span-3"><DayPicker value={v.gymDays} onChange={(d) => setV({ ...v, gymDays: d })} label="Gym days" /></Field>
        <Field label="Preferred gym time" htmlFor="s-gym"><TimeInput id="s-gym" value={v.gymPreferredStart} onChange={(m) => setV({ ...v, gymPreferredStart: m })} /></Field>
        <Field label="Gym session (min)" htmlFor="s-gymd"><Input id="s-gymd" type="number" min={15} step={5} value={v.gymDurationMin} onChange={(e) => setV({ ...v, gymDurationMin: Number(e.target.value) })} /></Field>
        <Field label="Water target (ml)" htmlFor="s-water"><Input id="s-water" type="number" min={0} step={250} value={v.waterTargetMl} onChange={(e) => setV({ ...v, waterTargetMl: Number(e.target.value) })} /></Field>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <h3 className="text-sm font-semibold sm:col-span-3">AI learning targets</h3>
        <Field label="Daily (min)" htmlFor="s-aid"><Input id="s-aid" type="number" min={0} step={5} value={v.aiDailyMin} onChange={(e) => setV({ ...v, aiDailyMin: Number(e.target.value) })} /></Field>
        <Field label="Weekly (h)" htmlFor="s-aiw"><Input id="s-aiw" type="number" min={0} step={0.5} value={v.aiWeeklyMin / 60} onChange={(e) => setV({ ...v, aiWeeklyMin: Math.round(Number(e.target.value) * 60) })} /></Field>
        <Field label="Monthly (h)" htmlFor="s-aim"><Input id="s-aim" type="number" min={0} step={1} value={v.aiMonthlyMin / 60} onChange={(e) => setV({ ...v, aiMonthlyMin: Math.round(Number(e.target.value) * 60) })} /></Field>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <h3 className="text-sm font-semibold sm:col-span-3">Planning</h3>
        <Field label="Time zone" htmlFor="s-tz">
          <NativeSelect id="s-tz" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>
            {["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"].map((z) => <option key={z} value={z}>{z}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Planning horizon start" htmlFor="s-ps"><Input id="s-ps" type="date" value={v.planningStart} onChange={(e) => setV({ ...v, planningStart: e.target.value })} className="dark:[color-scheme:dark]" /></Field>
        <Field label="Planning horizon end" htmlFor="s-pe"><Input id="s-pe" type="date" value={v.planningEnd} onChange={(e) => setV({ ...v, planningEnd: e.target.value })} className="dark:[color-scheme:dark]" /></Field>
        <Field label="CAT target date" htmlFor="s-cat"><Input id="s-cat" type="date" value={v.catTargetDate} onChange={(e) => setV({ ...v, catTargetDate: e.target.value })} className="dark:[color-scheme:dark]" /></Field>
      </section>
      <Button type="submit" disabled={pending} className="justify-self-start">
        Save settings
      </Button>
    </form>
  );
}

export function WeightsForm({ weights }: { weights: Record<ModeT, Partial<Record<CategoryKeyT, number>>> }) {
  const { run, pending } = useAction();
  const [mode, setMode] = useState<ModeT>("NORMAL");
  const [all, setAll] = useState(weights);
  const w = all[mode];
  const total = SCORED_CATEGORIES.reduce((s, k) => s + (w[k] ?? 0), 0);
  return (
    <div className="space-y-4">
      <div className="flex w-fit rounded-lg border border-border p-0.5" role="tablist" aria-label="Mode">
        {(["NORMAL", "EXAM", "RECOVERY"] as ModeT[]).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("rounded-md px-3 py-1 text-sm", mode === m ? "bg-muted font-medium" : "text-muted-foreground")}>
            {m === "EXAM" ? "Examination" : m.charAt(0) + m.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SCORED_CATEGORIES.map((k) => (
          <Field key={k} label={CATEGORY_META[k].name} htmlFor={`w-${mode}-${k}`}>
            <Input id={`w-${mode}-${k}`} type="number" min={0} max={100} value={w[k] ?? 0} onChange={(e) => setAll({ ...all, [mode]: { ...w, [k]: Number(e.target.value) } })} />
          </Field>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={pending || total !== 100} onClick={() => run(() => updateWeights({ mode, weights: w }))}>
          Save {mode.toLowerCase()} weights
        </Button>
        <span className={cn("tabular text-sm", total === 100 ? "text-success" : "text-warning")}>Total: {total}/100</span>
      </div>
      <p className="text-xs text-muted-foreground">Changes apply from today. Past daily scores keep the weights they were calculated with. Categories without tasks on a given day have their weight redistributed.</p>
    </div>
  );
}

export function NewTargetForm({ categories }: { categories: { id: string; name: string }[] }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({ label: "", categoryId: categories[0]?.id ?? "", unit: "MINUTES", normal: 2, blockMin: 45 });
  return (
    <form
      className="grid gap-3 rounded-xl border border-dashed border-border p-3 sm:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createWeeklyTarget({ label: v.label, categoryId: v.categoryId, unit: v.unit, normalTarget: v.unit === "MINUTES" ? Math.round(v.normal * 60) : v.normal, blockMin: v.blockMin }), { onSuccess: () => setV({ ...v, label: "" }) });
      }}
    >
      <Field label="New target" htmlFor="nt-label" className="sm:col-span-2"><Input id="nt-label" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} placeholder="e.g. Public speaking practice" /></Field>
      <Field label="Category" htmlFor="nt-cat">
        <NativeSelect id="nt-cat" value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Unit" htmlFor="nt-unit">
        <NativeSelect id="nt-unit" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })}>
          <option value="MINUTES">Hours / week</option>
          <option value="SESSIONS">Sessions / week</option>
        </NativeSelect>
      </Field>
      <Field label="Per week" htmlFor="nt-n"><Input id="nt-n" type="number" min={0.5} step={0.5} value={v.normal} onChange={(e) => setV({ ...v, normal: Number(e.target.value) })} /></Field>
      <Button type="submit" variant="secondary" disabled={pending || !v.label.trim()} className="self-end">
        <Plus className="size-4" /> Add
      </Button>
    </form>
  );
}

export function NotificationPrefs({ prefs }: { prefs: Record<string, boolean> }) {
  const { run, pending } = useAction();
  const labels: [string, string][] = [
    ["deadlines", "Upcoming deadlines"],
    ["exams", "Examinations"],
    ["pendingImportant", "Pending important tasks"],
    ["weeklyReview", "Weekly review reminder"],
    ["monthlyReview", "Monthly review reminder"],
    ["milestones", "Upcoming milestones"],
    ["weeklyTargets", "Weekly targets falling behind"],
  ];
  return (
    <ul className="divide-y divide-border">
      {labels.map(([k, l]) => (
        <li key={k} className="flex items-center justify-between py-2.5 text-sm">
          {l}
          <Switch checked={prefs[k] !== false} disabled={pending} onCheckedChange={(x) => run(() => updateSettings({ notificationPrefs: { [k]: x } }), { success: false })} aria-label={l} />
        </li>
      ))}
      <li className="pt-3 text-xs text-muted-foreground">Each reminder is sent at most once per item per day — no spam. Push notifications are planned for a later phase.</li>
    </ul>
  );
}

export function RecurringList({ items }: { items: { id: string; title: string; daysOfWeek: number[]; preferredStart: number | null; durationMin: number; active: boolean; category: string }[] }) {
  const { run, pending } = useAction();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No recurring tasks. Create one by ticking “Repeat weekly” when adding a task.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((r) => (
        <li key={r.id} className={cn("flex items-center gap-3 py-2.5 text-sm", !r.active && "opacity-50")}>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{r.title}</span>
            <span className="block text-xs text-muted-foreground">
              {r.category} · {r.daysOfWeek.map((d) => DAY_LABELS[d]).join(", ")} · {r.preferredStart != null ? formatMinute(r.preferredStart) : "any time"} · {formatDuration(r.durationMin)}
            </span>
          </span>
          {r.active ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => stopRecurring(r.id))}>
              Stop
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Stopped</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function UndoVersionButton({ id }: { id: string }) {
  const { run, pending } = useAction();
  return (
    <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => undoVersion(id))}>
      <Undo2 className="size-3" /> Undo
    </Button>
  );
}
