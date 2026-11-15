"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { deleteMba, logMba } from "@/server/actions/trackers";
import { formatDate, formatDuration } from "@/lib/time";
import { divide, num, reveal, rowIconBtn } from "@/components/config/bold";
import { cn } from "@/lib/utils";

export const MBA_TYPE_LABEL: Record<string, string> = {
  BUSINESS_READING: "Business / economics reading",
  GENERAL_AWARENESS: "General awareness",
  COMMUNICATION: "Communication practice",
  LEADERSHIP: "Leadership / profile activity",
  ACHIEVEMENT_DOC: "Achievement documentation",
  CAT_PRACTICE: "CAT practice",
  EXAM_RESEARCH: "Entrance exam research",
  SCHOOL_RESEARCH: "B-school research",
  INTERVIEW_PREP: "Interview preparation",
  OTHER: "Other",
};

const SECTION_TYPES: Record<string, string[]> = {
  PROFILE: ["BUSINESS_READING", "GENERAL_AWARENESS", "COMMUNICATION", "LEADERSHIP", "ACHIEVEMENT_DOC", "OTHER"],
  CAT: ["CAT_PRACTICE", "OTHER"],
  ENTRANCE: ["EXAM_RESEARCH", "OTHER"],
  RESEARCH: ["SCHOOL_RESEARCH", "OTHER"],
  INTERVIEW: ["INTERVIEW_PREP", "COMMUNICATION", "OTHER"],
};

export function MbaLogForm({ today, section }: { today: string; section: string }) {
  const { run, pending } = useAction();
  const types = SECTION_TYPES[section];
  const [v, setV] = useState({ date: today, type: types[0], title: "", durationMin: 30, notes: "" });
  return (
    <form
      className="grid gap-3 sm:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => logMba({ ...v, section, notes: v.notes || undefined }), { onSuccess: () => setV({ ...v, title: "", notes: "" }) });
      }}
    >
      <Field label="Activity" htmlFor={`m-type-${section}`} className="sm:col-span-2">
        <NativeSelect id={`m-type-${section}`} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
          {types.map((t) => <option key={t} value={t}>{MBA_TYPE_LABEL[t]}</option>)}
        </NativeSelect>
      </Field>
      <Field label="What (title)" htmlFor={`m-title-${section}`} className="sm:col-span-2">
        <Input id={`m-title-${section}`} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. The Economist — India briefing" />
      </Field>
      <Field label="Minutes" htmlFor={`m-min-${section}`}>
        <Input id={`m-min-${section}`} type="number" min={0} value={v.durationMin} onChange={(e) => setV({ ...v, durationMin: Number(e.target.value) })} />
      </Field>
      <Field label="Date" htmlFor={`m-date-${section}`}>
        <Input id={`m-date-${section}`} type="date" max={today} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="dark:[color-scheme:dark]" />
      </Field>
      <Field label="Notes / takeaways" htmlFor={`m-notes-${section}`} className="sm:col-span-5">
        <Input id={`m-notes-${section}`} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </Field>
      <Button type="submit" disabled={pending || !v.title.trim()} className="self-end">
        Log
      </Button>
    </form>
  );
}

export function MbaList({ items }: { items: { id: string; date: string; type: string; title: string; durationMin: number; notes: string | null }[] }) {
  const { run, pending } = useAction();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing logged in this section yet.</p>;
  return (
    <ul className={divide}>
      {items.map((a) => (
        <li key={a.id} className="group flex items-start gap-3 py-2.5 text-sm">
          <span className={cn(num, "w-14 shrink-0 pt-0.5 text-xs text-muted-foreground")}>{formatDate(a.date, "dm")}</span>
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{a.title}</span>
            <span className="block text-xs text-muted-foreground">
              {MBA_TYPE_LABEL[a.type]}
              {a.notes && ` · ${a.notes}`}
            </span>
          </span>
          {a.durationMin > 0 && <span className={cn(num, "shrink-0 pt-0.5 text-xs text-muted-foreground")}>{formatDuration(a.durationMin)}</span>}
          <button type="button" disabled={pending} onClick={() => run(() => deleteMba(a.id))} className={cn(rowIconBtn, reveal)} aria-label={`Delete ${a.title}`}>
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
