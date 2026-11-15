"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { saveMonthlyReview, saveWeeklyReview } from "@/server/actions/goals";

export function WeeklyReflectionForm({ weekStart, reflection, improvements }: { weekStart: string; reflection: string | null; improvements: string | null }) {
  const { run, pending } = useAction();
  const [r, setR] = useState(reflection ?? "");
  const [i, setI] = useState(improvements ?? "");
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveWeeklyReview({ weekStart, reflection: r || undefined, improvements: i || undefined }));
      }}
    >
      <Field label="Your reflection" htmlFor="wr-r">
        <Textarea id="wr-r" rows={4} value={r} onChange={(e) => setR(e.target.value)} placeholder="How did the week feel? What are you proud of?" />
      </Field>
      <Field label="What will you improve next week?" htmlFor="wr-i">
        <Textarea id="wr-i" rows={3} value={i} onChange={(e) => setI(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending} className="justify-self-start">
        Save weekly review
      </Button>
    </form>
  );
}

export function MonthlyReflectionForm({ month, initial }: { month: string; initial: { reflection: string | null; challenges: string | null; lessons: string | null; priorities: string | null } }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({ reflection: initial.reflection ?? "", challenges: initial.challenges ?? "", lessons: initial.lessons ?? "", priorities: initial.priorities ?? "" });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveMonthlyReview({ month, reflection: v.reflection || undefined, challenges: v.challenges || undefined, lessons: v.lessons || undefined, priorities: v.priorities || undefined }));
      }}
    >
      {(
        [
          ["reflection", "Personal reflection"],
          ["challenges", "Challenges"],
          ["lessons", "Lessons learned"],
          ["priorities", "Next month's priorities"],
        ] as const
      ).map(([k, label]) => (
        <Field key={k} label={label} htmlFor={`mr-${k}`}>
          <Textarea id={`mr-${k}`} rows={3} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
        </Field>
      ))}
      <Button type="submit" disabled={pending} className="justify-self-start sm:col-span-2">
        Save monthly review
      </Button>
    </form>
  );
}
