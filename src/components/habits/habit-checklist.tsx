"use client";

import { useOptimistic } from "react";
import Link from "next/link";
import { Check, Flame, Repeat } from "lucide-react";
import type { HabitView } from "@/server/habits";
import { toggleHabit } from "@/server/actions/habits";
import { useAction } from "@/components/common/use-action";
import { EmptyState } from "@/components/common/ui";
import { Button } from "@/components/ui/button";
import { FLAME_AT } from "@/lib/domain/habits";
import { cn } from "@/lib/utils";
import { HabitIcon } from "./habit-icon";

type Patch = { id: string; done: boolean };

/*
 * Habit colours are stored as the picker's hex values. On the tick list they are shown as the
 * matching Bold Blocks fill (flat, ink text), so every done habit sits in the design palette.
 * Unknown values fall back to the stored colour.
 */
const HABIT_BLOCK: Record<string, string> = {
  "#22C55E": "bg-block-lime",
  "#14B8A6": "bg-block-teal",
  "#3B82F6": "bg-block-sky",
  "#A855F7": "bg-block-violet",
  "#EC4899": "bg-block-pink",
  "#EF4444": "bg-block-danger",
  "#F97316": "bg-block-orange",
  "#EAB308": "bg-block-sun",
  "#94A3B8": "bg-block-stone",
};

/** Quick tick list for a given date. Habits never affect the daily score. */
export function HabitChecklist({ habits, date }: { habits: HabitView[]; date: string }) {
  const { run } = useAction();
  const [items, setOptimistic] = useOptimistic(habits, (state: HabitView[], p: Patch) =>
    state.map((h) => (h.id === p.id && h.done !== p.done ? { ...h, done: p.done, streak: Math.max(0, h.streak + (p.done ? 1 : -1)) } : h)),
  );

  if (habits.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title="No habits for this day"
        description="Small daily check-ins — water, reading, a walk. Encouragement, never a score."
        action={
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/personal#habits" />}>
            Set up habits
          </Button>
        }
        className="py-6"
      />
    );
  }

  const doneCount = items.filter((h) => h.done).length;

  function toggle(h: HabitView) {
    const next = !h.done;
    run(
      async () => {
        setOptimistic({ id: h.id, done: next });
        return toggleHabit(h.id, date, next);
      },
      { success: false },
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase" aria-live="polite">
        {doneCount === items.length ? "All done — nice." : `${doneCount} of ${items.length} done`}
      </p>
      <ul className="-mx-2 space-y-1" aria-label="Habits">
        {items.map((h) => {
          const block = HABIT_BLOCK[h.color.toUpperCase()];
          return (
            <li key={h.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={h.done}
                aria-label={`${h.name}${h.streak > 0 ? `, ${h.streak} day streak` : ""}`}
                onClick={() => toggle(h)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-[8px] px-2 py-2 text-left transition-colors outline-hidden hover:bg-muted motion-reduce:transition-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn("grid size-9 shrink-0 place-items-center rounded-[8px] border-2 border-ink", h.done ? cn("text-[#111111]", block) : "bg-card text-foreground")}
                  style={h.done && !block ? { background: h.color } : undefined}
                >
                  <HabitIcon name={h.icon} />
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-[15px] font-semibold", h.done && "text-muted-foreground line-through decoration-2")}>{h.name}</span>
                {h.streak > 0 && (
                  <span
                    className={cn(
                      "flex items-center gap-0.5 rounded-full border-2 px-1.5 py-px font-mono text-[11px] font-medium tabular-nums",
                      h.streak >= FLAME_AT ? "border-ink bg-block-orange text-[#111111]" : "border-transparent text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {h.streak >= FLAME_AT && <Flame className="size-3.5" />}
                    {h.streak}
                  </span>
                )}
                <span
                  aria-hidden
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-[8px] border-2 border-ink motion-safe:transition-[transform,box-shadow,background-color] motion-safe:duration-150",
                    h.done
                      ? "translate-x-[2px] translate-y-[2px] bg-block-lime text-[#111111] shadow-none"
                      : "bg-card text-transparent shadow-brutal-sm group-hover:text-foreground/30",
                  )}
                >
                  <Check className="size-6" strokeWidth={3.5} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
