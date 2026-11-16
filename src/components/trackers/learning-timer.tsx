"use client";

import { useState } from "react";
import { Pause, Play, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { deleteLearning, discardLearning, logLearning, pauseLearning, resumeLearning, startLearning, stopLearning } from "@/server/actions/learning";
import { elapsedSeconds, formatClock, useNow, type ActiveTimer } from "@/components/shell/learning-timer-pill";
import { formatDate, formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";
import { chip, divide, num, reveal, rowIconBtn } from "@/components/config/bold";

/** Chunky timer controls. */
const BIG = "h-12 gap-2 px-6 text-base font-semibold [&_svg:not([class*='size-'])]:size-5";

export function LearningTimer({ timer, linkedTaskTitle }: { timer: ActiveTimer | null; linkedTaskTitle: string | null }) {
  const now = useNow();
  const { run, pending } = useAction();
  const [topic, setTopic] = useState(timer?.topic ?? "");
  const [notes, setNotes] = useState("");
  const secs = timer ? elapsedSeconds(timer, now) : 0;
  const running = timer?.status === "RUNNING";

  const state = !timer ? "Ready" : running ? "Running" : "Paused";

  return (
    <div className="flex flex-col items-center gap-5 py-1 text-center">
      <div
        className={cn(
          "w-full rounded-[10px] border-[3px] border-border px-4 py-6 shadow-brutal-lg transition-colors sm:py-8",
          running ? "bg-block-lime text-ink" : timer ? "bg-block-sun text-ink" : "bg-muted text-foreground",
        )}
      >
        <p className="inline-flex items-center gap-1.5 rounded-md border-2 border-current px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
          {running && <span className="size-2 rounded-full bg-current motion-safe:animate-pulse" aria-hidden />}
          {state}
        </p>
        <div role="timer" aria-label={`${state}, elapsed ${formatClock(secs)}`} className="mt-3 font-mono text-6xl leading-none font-semibold tracking-tight tabular-nums sm:text-7xl">
          {formatClock(secs)}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {!timer ? "Ready when you are. Only active time is counted." : running ? "Learning… paused time is excluded automatically." : "Paused."}
        {linkedTaskTitle && <span className="mt-1 block text-xs font-medium text-foreground">Linked to “{linkedTaskTitle}”</span>}
      </p>
      <div className="grid w-full max-w-md gap-3 text-left">
        <Field label="Topic (optional)" htmlFor="lt-topic">
          <Input id="lt-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Whatever you choose to learn" />
        </Field>
        {timer && (
          <Field label="Notes (optional)" htmlFor="lt-notes">
            <Textarea id="lt-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you learn?" />
          </Field>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {!timer && (
          <Button size="lg" className={BIG} disabled={pending} onClick={() => run(() => startLearning({ topic }))}>
            <Play className="size-4" aria-hidden /> Start
          </Button>
        )}
        {timer && running && (
          <Button size="lg" variant="outline" className={cn(BIG, "bg-block-sun text-ink hover:bg-block-sun")} disabled={pending} onClick={() => run(() => pauseLearning(timer.id), { success: false })}>
            <Pause className="size-4" aria-hidden /> Pause
          </Button>
        )}
        {timer && !running && (
          <Button size="lg" className={BIG} disabled={pending} onClick={() => run(() => resumeLearning(timer.id), { success: false })}>
            <Play className="size-4" aria-hidden /> Resume
          </Button>
        )}
        {timer && (
          <>
            <Button size="lg" variant="outline" className={BIG} disabled={pending} onClick={() => run(() => stopLearning(timer.id, { topic, notes }), { onSuccess: () => setNotes("") })}>
              <Square className="size-4" aria-hidden /> Stop & log
            </Button>
            <Button size="lg" variant="ghost" className="h-12 w-12 px-0" disabled={pending} onClick={() => run(() => discardLearning(timer.id))} aria-label="Discard timer" title="Discard timer">
              <X className="size-4" aria-hidden />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function ManualLearningForm({ today }: { today: string }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({ date: today, minutes: 60, topic: "", notes: "" });
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => logLearning({ date: v.date, durationMin: v.minutes, topic: v.topic || undefined, notes: v.notes || undefined }), { onSuccess: () => setV({ ...v, topic: "", notes: "" }) });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="ml-date">
          <Input id="ml-date" type="date" max={today} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="dark:[color-scheme:dark]" />
        </Field>
        <Field label="Minutes" htmlFor="ml-min">
          <Input id="ml-min" type="number" min={1} max={720} value={v.minutes} onChange={(e) => setV({ ...v, minutes: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Topic (optional)" htmlFor="ml-topic">
        <Input id="ml-topic" value={v.topic} onChange={(e) => setV({ ...v, topic: e.target.value })} />
      </Field>
      <Field label="Notes (optional)" htmlFor="ml-notes">
        <Input id="ml-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </Field>
      <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
        Log session
      </Button>
    </form>
  );
}

export function SessionList({ sessions }: { sessions: { id: string; date: string; durationMin: number; topic: string | null; notes: string | null; manual: boolean }[] }) {
  const { run, pending } = useAction();
  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">No sessions yet. Start the timer when you sit down to learn.</p>;
  return (
    <ul className={divide}>
      {sessions.map((s) => (
        <li key={s.id} className="group flex items-center gap-3 py-2.5 text-sm">
          <span className={cn(num, "w-16 shrink-0")}>{formatDuration(s.durationMin)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{s.topic || <span className="text-muted-foreground">No topic</span>}</span>
            {s.notes && <span className="block truncate text-xs text-muted-foreground">{s.notes}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            {formatDate(s.date, "weekday")}
            {s.manual && <span className={cn(chip, "bg-block-stone text-[10px] tracking-[0.06em] uppercase")}>manual</span>}
          </span>
          <button type="button" disabled={pending} onClick={() => run(() => deleteLearning(s.id))} className={cn(rowIconBtn, reveal)} aria-label="Delete session">
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
