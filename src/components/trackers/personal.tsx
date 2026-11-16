"use client";

import { useState } from "react";
import { Annoyed, Frown, Laugh, Meh, Smile, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { addJournal, deleteJournal, deleteReading, deleteSideProject, logSideProject, upsertReading } from "@/server/actions/trackers";
import { formatDate, formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";
import { chip, divide, eyebrow, focusRing, num, reveal, rowIconBtn, subCard } from "@/components/config/bold";

/** Mood 1–5, each with an icon and a block colour (no emoji). */
const MOODS: { icon: LucideIcon; label: string; block: string }[] = [
  { icon: Frown, label: "Rough", block: "bg-block-stone" },
  { icon: Annoyed, label: "Meh", block: "bg-block-sky" },
  { icon: Meh, label: "Okay", block: "bg-block-sun" },
  { icon: Smile, label: "Good", block: "bg-block-teal" },
  { icon: Laugh, label: "Great", block: "bg-block-lime" },
];

export function JournalForm({ today }: { today: string }) {
  const { run, pending } = useAction();
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addJournal({ date: today, mood, body, tags: [] }), {
          onSuccess: () => {
            setBody("");
            setMood(null);
          },
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Mood">
        <span className={cn(eyebrow, "mr-1.5")}>Mood</span>
        {MOODS.map((m, i) => {
          const on = mood === i + 1;
          const Icon = m.icon;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`Mood ${i + 1} of 5: ${m.label}`}
              title={m.label}
              onClick={() => setMood(on ? null : i + 1)}
              className={cn("grid size-9 place-items-center rounded-md border-2 transition-colors", focusRing, on ? cn("border-border text-ink shadow-brutal-sm", m.block) : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground")}
            >
              <Icon className="size-[18px]" aria-hidden />
            </button>
          );
        })}
      </div>
      <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What's on your mind? What went well today?" aria-label="Journal entry" />
      <Button type="submit" disabled={pending || !body.trim()}>
        Save entry
      </Button>
    </form>
  );
}

function MoodChip({ mood }: { mood: number }) {
  const m = MOODS[mood - 1];
  const Icon = m.icon;
  return (
    <span className={cn(chip, m.block)} title={`Mood ${mood} of 5`}>
      <Icon className="size-3" aria-hidden /> {m.label}
    </span>
  );
}

export function JournalList({ items }: { items: { id: string; date: string; mood: number | null; body: string }[] }) {
  const { run, pending } = useAction();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No entries yet.</p>;
  return (
    <ul className="space-y-3">
      {items.map((j) => (
        <li key={j.id} className={cn(subCard, "group p-3")}>
          <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            {j.mood && MOODS[j.mood - 1] && <MoodChip mood={j.mood} />}
            <span className="font-medium">{formatDate(j.date, "long")}</span>
            <button type="button" disabled={pending} onClick={() => run(() => deleteJournal(j.id))} className={cn(rowIconBtn, reveal, "-my-1 ml-auto")} aria-label={`Delete entry from ${formatDate(j.date, "long")}`}>
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <p className="text-sm whitespace-pre-line">{j.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function ReadingTracker({ items }: { items: { id: string; title: string; author: string | null; status: string; kind: string; notes: string | null }[] }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({ title: "", author: "", status: "READING" });
  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => upsertReading(null, { title: v.title, author: v.author || undefined, status: v.status, kind: "BOOK" }), { onSuccess: () => setV({ ...v, title: "", author: "" }) });
        }}
      >
        <Field label="Title" htmlFor="r-title"><Input id="r-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
        <Field label="Author" htmlFor="r-author"><Input id="r-author" value={v.author} onChange={(e) => setV({ ...v, author: e.target.value })} /></Field>
        <Field label="Status" htmlFor="r-status">
          <NativeSelect id="r-status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>
            <option value="TO_READ">To read</option>
            <option value="READING">Reading</option>
            <option value="DONE">Finished</option>
          </NativeSelect>
        </Field>
        <Button type="submit" disabled={pending || !v.title.trim()} className="self-end">Add</Button>
      </form>
      <ul className={divide}>
        {items.length === 0 && <li className="py-3 text-sm text-muted-foreground">Your reading list is empty.</li>}
        {items.map((r) => (
          <li key={r.id} className="group flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className={cn("font-semibold", r.status === "DONE" && "text-muted-foreground line-through decoration-2")}>{r.title}</span>
              {r.author && <span className="text-muted-foreground"> · {r.author}</span>}
            </span>
            <NativeSelect aria-label={`Status of ${r.title}`} value={r.status} disabled={pending} onChange={(e) => run(() => upsertReading(r.id, { title: r.title, author: r.author ?? undefined, kind: r.kind, status: e.target.value, notes: r.notes ?? undefined }))} className="h-8 w-28 text-xs">
              <option value="TO_READ">To read</option>
              <option value="READING">Reading</option>
              <option value="DONE">Finished</option>
            </NativeSelect>
            <button type="button" disabled={pending} onClick={() => run(() => deleteReading(r.id))} className={cn(rowIconBtn, reveal)} aria-label={`Remove ${r.title}`}><Trash2 className="size-3.5" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SideProjectLog({ today, items }: { today: string; items: { id: string; date: string; durationMin: number; notes: string | null }[] }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({ date: today, durationMin: 60, notes: "" });
  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 sm:grid-cols-[auto_auto_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => logSideProject({ ...v, notes: v.notes || undefined }), { onSuccess: () => setV({ ...v, notes: "" }) });
        }}
      >
        <Field label="Date" htmlFor="sp-date"><Input id="sp-date" type="date" max={today} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="dark:[color-scheme:dark]" /></Field>
        <Field label="Minutes" htmlFor="sp-min"><Input id="sp-min" type="number" min={1} className="w-24" value={v.durationMin} onChange={(e) => setV({ ...v, durationMin: Number(e.target.value) })} /></Field>
        <Field label="What did you work on?" htmlFor="sp-notes"><Input id="sp-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        <Button type="submit" disabled={pending} className="self-end">Log</Button>
      </form>
      <ul className={divide}>
        {items.map((s) => (
          <li key={s.id} className="group flex items-center gap-3 py-2 text-sm">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">{formatDate(s.date, "weekday")}</span>
            <span className="min-w-0 flex-1 truncate">{s.notes ?? "Side project"}</span>
            <span className={cn(num, "shrink-0 text-xs")}>{formatDuration(s.durationMin)}</span>
            <button type="button" disabled={pending} onClick={() => run(() => deleteSideProject(s.id))} className={cn(rowIconBtn, reveal)} aria-label={`Delete side project entry from ${formatDate(s.date, "weekday")}`}><Trash2 className="size-3.5" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
