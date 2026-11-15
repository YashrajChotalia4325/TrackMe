"use client";

import { useState } from "react";
import { Dumbbell } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { logGym } from "@/server/actions/trackers";

export function GymLogDialog({ open, onOpenChange, today, defaultMinutes = 60 }: { open: boolean; onOpenChange: (v: boolean) => void; today: string; defaultMinutes?: number }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({ date: today, type: "STRENGTH", durationMin: defaultMinutes, focus: "", exercises: "", notes: "" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a workout</DialogTitle>
          <DialogDescription>Any split, any style. Matching gym tasks for that day are marked complete.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="g-date">
              <Input id="g-date" type="date" max={today} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="dark:[color-scheme:dark]" />
            </Field>
            <Field label="Type" htmlFor="g-type">
              <NativeSelect id="g-type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
                <option value="STRENGTH">Strength / gym</option>
                <option value="CARDIO">Cardio</option>
                <option value="WALK">Walk</option>
                <option value="SPORT">Sport</option>
                <option value="MOBILITY">Mobility / yoga</option>
                <option value="OTHER">Other</option>
              </NativeSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (min)" htmlFor="g-min">
              <Input id="g-min" type="number" min={1} value={v.durationMin} onChange={(e) => setV({ ...v, durationMin: Number(e.target.value) })} />
            </Field>
            <Field label="Focus (optional)" htmlFor="g-focus">
              <Input id="g-focus" value={v.focus} onChange={(e) => setV({ ...v, focus: e.target.value })} placeholder="e.g. Push, legs" />
            </Field>
          </div>
          <Field label="Exercises (optional)" htmlFor="g-ex">
            <Textarea id="g-ex" rows={3} value={v.exercises} onChange={(e) => setV({ ...v, exercises: e.target.value })} placeholder={"Bench 3×8 @ 60kg\nRows 3×10"} />
          </Field>
          <Field label="Notes" htmlFor="g-notes">
            <Input id="g-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              run(() => logGym({ ...v, focus: v.focus || undefined, exercises: v.exercises || undefined, notes: v.notes || undefined }), {
                onSuccess: () => onOpenChange(false),
              })
            }
          >
            <Dumbbell className="size-4" /> Log workout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
