"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, NativeSelect, TimeInput } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import {
  createEvent,
  createTimetableSlot,
  createWorkBlock,
  deleteEvent,
  deleteExamPeriod,
  deleteTimetableSlot,
  deleteWorkBlock,
  importTimetableCsv,
  upsertExamPeriod,
} from "@/server/actions/calendar";
import { updateWeeklyTarget } from "@/server/actions/settings";
import { DAY_LABELS, DAY_LABELS_LONG, formatDate, formatDuration, formatMinute } from "@/lib/time";
import { toast } from "sonner";

const DAYS_MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

// ───────── Timetable ─────────

export interface SlotView {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  title: string;
  location: string | null;
}

export function TimetableEditor({ slots }: { slots: SlotView[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [day, setDay] = useState(1);
  const [start, setStart] = useState<number | null>(9 * 60);
  const [end, setEnd] = useState<number | null>(10 * 60);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [kind, setKind] = useState("LECTURE");
  const fileRef = useRef<HTMLInputElement>(null);

  const add = () =>
    run(() => createTimetableSlot({ dayOfWeek: day, startMinute: start ?? 0, endMinute: end ?? 0, title, kind, location: location || undefined }), {
      onSuccess: () => {
        setTitle("");
        setStart(end);
        setEnd(end != null ? end + 60 : null);
        router.refresh();
      },
    });

  const onFile = async (f: File) => {
    const text = await f.text();
    run(() => importTimetableCsv(text, false), {
      onSuccess: (d) => {
        if (d.errors.length) toast.warning(`${d.errors.length} row(s) skipped`, { description: d.errors.slice(0, 3).join(" · ") });
        router.refresh();
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-6">
        <Field label="Day" htmlFor="tt-day" className="sm:col-span-1">
          <NativeSelect id="tt-day" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS_MON_FIRST.map((d) => (
              <option key={d} value={d}>
                {DAY_LABELS[d]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Start" htmlFor="tt-start">
          <TimeInput id="tt-start" value={start} onChange={setStart} />
        </Field>
        <Field label="End" htmlFor="tt-end">
          <TimeInput id="tt-end" value={end} onChange={setEnd} />
        </Field>
        <Field label="Subject" htmlFor="tt-subj" className="sm:col-span-2">
          <Input id="tt-subj" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Machine Learning" />
        </Field>
        <Field label="Type" htmlFor="tt-kind">
          <NativeSelect id="tt-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="LECTURE">Lecture</option>
            <option value="PRACTICAL">Practical</option>
            <option value="TUTORIAL">Tutorial</option>
            <option value="OTHER">Other</option>
          </NativeSelect>
        </Field>
        <Field label="Location (optional)" htmlFor="tt-loc" className="sm:col-span-3">
          <Input id="tt-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room / lab" />
        </Field>
        <div className="flex items-end gap-2 sm:col-span-3">
          <Button onClick={add} disabled={pending || !title.trim()} className="flex-1 sm:flex-none">
            <Plus className="size-4" /> Add slot
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={pending}>
            <Upload className="size-4" /> Import CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-6">
          CSV columns: <code className="rounded bg-muted px-1">day,start,end,subject,location,type</code> — e.g. <code className="rounded bg-muted px-1">Mon,09:00,10:00,Machine Learning,Room 204,LECTURE</code>. From Excel: File → Save As → CSV.
        </p>
      </div>
      <WeekList
        items={slots.map((s) => ({ id: s.id, day: s.dayOfWeek, start: s.startMinute, end: s.endMinute, label: s.title, sub: s.location }))}
        empty="No lectures yet. Add your timetable so TrackMe never schedules over college."
        onDelete={(id) => run(() => deleteTimetableSlot(id), { onSuccess: () => router.refresh() })}
      />
    </div>
  );
}

function WeekList({ items, empty, onDelete }: { items: { id: string; day: number; start: number; end: number; label: string; sub?: string | null }[]; empty: string; onDelete: (id: string) => void }) {
  if (items.length === 0) return <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {DAYS_MON_FIRST.filter((d) => items.some((i) => i.day === d)).map((d) => (
        <div key={d} className="rounded-xl border border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{DAY_LABELS_LONG[d]}</p>
          <ul className="space-y-1">
            {items
              .filter((i) => i.day === d)
              .sort((a, b) => a.start - b.start)
              .map((i) => (
                <li key={i.id} className="group flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="tabular text-xs text-muted-foreground">
                      {formatMinute(i.start)}–{formatMinute(i.end)}
                    </span>{" "}
                    <span className="font-medium">{i.label}</span>
                    {i.sub && <span className="text-xs text-muted-foreground"> · {i.sub}</span>}
                  </span>
                  <button type="button" onClick={() => onDelete(i.id)} aria-label={`Remove ${i.label} on ${DAY_LABELS_LONG[d]}`} className="rounded p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ───────── Work ─────────

export function WorkEditor({ blocks }: { blocks: { id: string; dayOfWeek: number; startMinute: number; endMinute: number; label: string }[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [label, setLabel] = useState("Internship");

  const add = () =>
    run(
      async () => {
        for (const d of days) {
          const r = await createWorkBlock({ dayOfWeek: d, startMinute: start ?? 0, endMinute: end ?? 0, label, remote: false });
          if (!r.ok) return r;
        }
        return { ok: true as const, data: undefined, message: "Work hours added" };
      },
      { onSuccess: () => router.refresh() },
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border p-3">
        <Field label="Days">
          <div className="flex flex-wrap gap-1.5">
            {DAYS_MON_FIRST.map((d) => {
              const on = days.includes(d);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])} className={`h-8 min-w-11 rounded-lg border px-2 text-xs font-medium ${on ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>
                  {DAY_LABELS[d]}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Start" htmlFor="w-start">
            <TimeInput id="w-start" value={start} onChange={setStart} />
          </Field>
          <Field label="End" htmlFor="w-end">
            <TimeInput id="w-end" value={end} onChange={setEnd} />
          </Field>
          <Field label="Label" htmlFor="w-label" className="col-span-2">
            <Input id="w-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
        </div>
        <Button onClick={add} disabled={pending || start == null || end == null || days.length === 0} className="justify-self-start">
          <Plus className="size-4" /> Add work hours
        </Button>
      </div>
      <WeekList
        items={blocks.map((b) => ({ id: b.id, day: b.dayOfWeek, start: b.startMinute, end: b.endMinute, label: b.label }))}
        empty="No fixed work hours. Add them if your internship has set hours — TrackMe will plan around them."
        onDelete={(id) => run(() => deleteWorkBlock(id), { onSuccess: () => router.refresh() })}
      />
    </div>
  );
}

// ───────── Weekly targets ─────────

export interface TargetView {
  id: string;
  key: string;
  label: string;
  unit: "MINUTES" | "SESSIONS";
  normalTarget: number;
  examTarget: number;
  recoveryTarget: number;
  blockMin: number;
  preferredStart: number | null;
  autoPlan: boolean;
  active: boolean;
}

export function TargetRow({ target, compact = false }: { target: TargetView; compact?: boolean }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [t, setT] = useState(target);
  const isMin = t.unit === "MINUTES";
  const toDisplay = (n: number) => (isMin ? Math.round((n / 60) * 10) / 10 : n);
  const fromDisplay = (n: number) => (isMin ? Math.round(n * 60) : Math.round(n));
  const save = () => run(() => updateWeeklyTarget(t), { onSuccess: () => router.refresh() });

  return (
    <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={`${t.label} — normal (${isMin ? "hours/week" : "sessions/week"})`} htmlFor={`${t.id}-n`} className="col-span-2">
          <Input id={`${t.id}-n`} type="number" min={0} step={isMin ? 0.5 : 1} value={toDisplay(t.normalTarget)} onChange={(e) => setT({ ...t, normalTarget: fromDisplay(Number(e.target.value)) })} />
        </Field>
        {!compact && (
          <>
            <Field label="Exam mode" htmlFor={`${t.id}-e`}>
              <Input id={`${t.id}-e`} type="number" min={0} step={isMin ? 0.5 : 1} value={toDisplay(t.examTarget)} onChange={(e) => setT({ ...t, examTarget: fromDisplay(Number(e.target.value)) })} />
            </Field>
            <Field label="Block length (min)" htmlFor={`${t.id}-b`}>
              <Input id={`${t.id}-b`} type="number" min={10} step={5} value={t.blockMin} onChange={(e) => setT({ ...t, blockMin: Number(e.target.value) })} />
            </Field>
          </>
        )}
        {compact && (
          <Field label="Block length (min)" htmlFor={`${t.id}-b`} className="col-span-2">
            <Input id={`${t.id}-b`} type="number" min={10} step={5} value={t.blockMin} onChange={(e) => setT({ ...t, blockMin: Number(e.target.value) })} />
          </Field>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={t.autoPlan} onCheckedChange={(v) => setT({ ...t, autoPlan: v })} aria-label={`Auto-plan ${t.label}`} /> Auto-plan
        </label>
        <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
          Save
        </Button>
      </div>
      {!compact && <p className="text-xs text-muted-foreground sm:col-span-2">Normal: {isMin ? formatDuration(t.normalTarget) : `${t.normalTarget} sessions`} per week · Exam: {isMin ? formatDuration(t.examTarget) : `${t.examTarget} sessions`}</p>}
    </div>
  );
}

// ───────── Exams ─────────

export function ExamEditor({
  periods,
  exams,
}: {
  periods: { id: string; name: string; startDate: string; endDate: string; leadDays: number }[];
  exams: { id: string; title: string; date: string; startMinute: number | null }[];
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [pName, setPName] = useState("Examinations");
  const [pStart, setPStart] = useState("");
  const [pEnd, setPEnd] = useState("");
  const [eTitle, setETitle] = useState("");
  const [eDate, setEDate] = useState("");
  const [eStart, setEStart] = useState<number | null>(10 * 60);
  const [eEnd, setEEnd] = useState<number | null>(13 * 60);
  const [eType, setEType] = useState("EXAM");

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">Examination periods</p>
        {periods.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{p.name}</span>
              <span className="text-muted-foreground">
                {" "}
                · {formatDate(p.startDate, "dm")} – {formatDate(p.endDate)}
              </span>
            </span>
            <button type="button" onClick={() => run(() => deleteExamPeriod(p.id), { onSuccess: () => router.refresh() })} aria-label={`Remove ${p.name}`} className="rounded p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-4">
          <Field label="Name" htmlFor="ep-name" className="sm:col-span-2">
            <Input id="ep-name" value={pName} onChange={(e) => setPName(e.target.value)} />
          </Field>
          <Field label="Start" htmlFor="ep-start">
            <Input id="ep-start" type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} className="dark:[color-scheme:dark]" />
          </Field>
          <Field label="End" htmlFor="ep-end">
            <Input id="ep-end" type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} className="dark:[color-scheme:dark]" />
          </Field>
          <Button
            variant="secondary"
            className="justify-self-start sm:col-span-4"
            disabled={pending || !pStart || !pEnd}
            onClick={() => run(() => upsertExamPeriod(null, { name: pName, startDate: pStart, endDate: pEnd, leadDays: 10 }), { onSuccess: () => router.refresh() })}
          >
            <Plus className="size-4" /> Add exam period
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Individual papers, practicals & vivas</p>
        <p className="text-xs text-muted-foreground">Add them when your timetable is released. They become fixed commitments the scheduler never moves.</p>
        {exams.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{e.title}</span>
              <span className="text-muted-foreground">
                {" "}
                · {formatDate(e.date, "weekday")}
                {e.startMinute != null && `, ${formatMinute(e.startMinute)}`}
              </span>
            </span>
            <button type="button" onClick={() => run(() => deleteEvent(e.id), { onSuccess: () => router.refresh() })} aria-label={`Remove ${e.title}`} className="rounded p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-6">
          <Field label="Subject / title" htmlFor="ex-title" className="sm:col-span-2">
            <Input id="ex-title" value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="e.g. Cloud Computing" />
          </Field>
          <Field label="Type" htmlFor="ex-type">
            <NativeSelect id="ex-type" value={eType} onChange={(e) => setEType(e.target.value)}>
              <option value="EXAM">University exam</option>
              <option value="INTERNAL_EXAM">Internal exam</option>
              <option value="PRACTICAL_EXAM">Practical</option>
              <option value="VIVA">Viva</option>
            </NativeSelect>
          </Field>
          <Field label="Date" htmlFor="ex-date">
            <Input id="ex-date" type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} className="dark:[color-scheme:dark]" />
          </Field>
          <Field label="Start" htmlFor="ex-start">
            <TimeInput id="ex-start" value={eStart} onChange={setEStart} />
          </Field>
          <Field label="End" htmlFor="ex-end">
            <TimeInput id="ex-end" value={eEnd} onChange={setEEnd} />
          </Field>
          <Button
            variant="secondary"
            className="justify-self-start sm:col-span-6"
            disabled={pending || !eTitle.trim() || !eDate}
            onClick={() =>
              run(() => createEvent({ title: eTitle, type: eType, date: eDate, startMinute: eStart, endMinute: eEnd, allDay: false }), {
                onSuccess: () => {
                  setETitle("");
                  router.refresh();
                },
              })
            }
          >
            <Plus className="size-4" /> Add exam
          </Button>
        </div>
      </div>
    </div>
  );
}
