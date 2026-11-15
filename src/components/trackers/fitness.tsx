"use client";

import { useState } from "react";
import { Dumbbell, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { deleteGym, logHealth } from "@/server/actions/trackers";
import { GymLogDialog } from "./gym-log-dialog";
import { formatDate, formatDuration } from "@/lib/time";
import { chip, divide, num, reveal, rowIconBtn } from "@/components/config/bold";
import { cn } from "@/lib/utils";

const TYPE_BLOCK: Record<string, string> = { STRENGTH: "bg-block-lime", CARDIO: "bg-block-sky", WALK: "bg-block-teal", SPORT: "bg-block-orange", MOBILITY: "bg-block-violet", OTHER: "bg-block-stone" };

export function LogWorkoutButton({ today, minutes }: { today: string; minutes: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Dumbbell className="size-4" /> Log workout
      </Button>
      <GymLogDialog open={open} onOpenChange={setOpen} today={today} defaultMinutes={minutes} />
    </>
  );
}

export function HealthForm({ today, initial }: { today: string; initial: { weightKg: number | null; sleepHours: number | null; waterMl: number | null; steps: number | null; walked: boolean } | null }) {
  const { run, pending } = useAction();
  const [date, setDate] = useState(today);
  const [v, setV] = useState({
    weightKg: initial?.weightKg?.toString() ?? "",
    sleepHours: initial?.sleepHours?.toString() ?? "",
    waterMl: initial?.waterMl?.toString() ?? "",
    steps: initial?.steps?.toString() ?? "",
    walked: initial?.walked ?? false,
  });
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => logHealth({ date, weightKg: num(v.weightKg), sleepHours: num(v.sleepHours), waterMl: num(v.waterMl), steps: num(v.steps), walked: v.walked }));
      }}
    >
      <Field label="Date" htmlFor="h-date">
        <Input id="h-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="dark:[color-scheme:dark]" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight (kg)" htmlFor="h-w">
          <Input id="h-w" inputMode="decimal" value={v.weightKg} onChange={(e) => setV({ ...v, weightKg: e.target.value })} placeholder="—" />
        </Field>
        <Field label="Sleep (hours)" htmlFor="h-s">
          <Input id="h-s" inputMode="decimal" value={v.sleepHours} onChange={(e) => setV({ ...v, sleepHours: e.target.value })} placeholder="—" />
        </Field>
        <Field label="Water (ml)" htmlFor="h-water">
          <Input id="h-water" inputMode="numeric" value={v.waterMl} onChange={(e) => setV({ ...v, waterMl: e.target.value })} placeholder="—" />
        </Field>
        <Field label="Steps" htmlFor="h-steps">
          <Input id="h-steps" inputMode="numeric" value={v.steps} onChange={(e) => setV({ ...v, steps: e.target.value })} placeholder="—" />
        </Field>
      </div>
      <label className="flex items-center justify-between rounded-[10px] border-2 border-border bg-muted px-3 py-2.5 text-sm font-semibold">
        Went for a walk
        <Switch checked={v.walked} onCheckedChange={(x) => setV({ ...v, walked: x })} aria-label="Went for a walk" />
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        Save health log
      </Button>
    </form>
  );
}

export function WorkoutList({ items }: { items: { id: string; date: string; type: string; durationMin: number; focus: string | null; exercises: string | null }[] }) {
  const { run, pending } = useAction();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No workouts logged yet.</p>;
  return (
    <ul className={divide}>
      {items.map((w) => (
        <li key={w.id} className="group flex items-start gap-3 py-2.5 text-sm">
          <span className="w-20 shrink-0 pt-0.5 text-xs text-muted-foreground">{formatDate(w.date, "weekday")}</span>
          <span className="min-w-0 flex-1">
            <span className={cn(chip, TYPE_BLOCK[w.type] ?? "bg-block-stone", "mr-1.5 capitalize")}>{w.type.toLowerCase()}</span>
            {w.focus && <span className="text-muted-foreground"> · {w.focus}</span>}
            {w.exercises && <span className="block truncate text-xs whitespace-pre-line text-muted-foreground">{w.exercises.split("\n").slice(0, 2).join(" · ")}</span>}
          </span>
          <span className={cn(num, "shrink-0 pt-0.5 text-xs")}>{formatDuration(w.durationMin)}</span>
          <button type="button" disabled={pending} onClick={() => run(() => deleteGym(w.id))} className={cn(rowIconBtn, reveal)} aria-label={`Delete ${w.type.toLowerCase()} workout`}>
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
