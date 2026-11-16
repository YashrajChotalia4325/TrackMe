"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, CalendarPlus, Dumbbell, NotebookPen, Play, Plus, TrendingDown, TrendingUp, X } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { CircularProgress } from "@/components/ui/circular-progress";
import { Button } from "@/components/ui/button";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { RescheduleDayButton } from "@/components/tasks/proposal-dialog";
import { EventFormDialog } from "@/components/calendar/event-form-dialog";
import { GymLogDialog } from "@/components/trackers/gym-log-dialog";
import { useAction } from "@/components/common/use-action";
import { BlockBar } from "@/components/dashboard/block-bar";
import { BLOCK_BG, BLOCK_HEX, categoryBlock, focusRing, eyebrow } from "@/components/dashboard/blocks";
import { startLearning } from "@/server/actions/learning";
import { dismissExamSuggestion, setMode } from "@/server/actions/settings";
import { CATEGORY_META, gradeFor, type CategoryKeyT } from "@/lib/domain/constants";
import { DAY_LABELS, dayOfWeek, formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TaskFormOptions } from "@/server/queries";

/** White chip that sits on a colour block (literal ink so it holds in both themes). */
const onBlockChip = "inline-flex items-center gap-1.5 rounded-full border-2 border-[#111111] bg-white px-2.5 py-1 text-xs font-semibold text-[#111111]";

/**
 * Body of the "Today's score" tile. Rendered inside the lime score block on the dashboard,
 * so all text and inner edges use literal ink.
 */
export function ScoreCard({
  score,
  breakdown,
  yesterday,
  weekAvg,
}: {
  score: number | null;
  breakdown: { key: CategoryKeyT; weight: number; credit: number; points: number; done: number; total: number }[];
  yesterday: number | null;
  weekAvg: number | null;
}) {
  const s = score ?? 0;
  const delta = score != null && yesterday != null ? score - yesterday : null;
  return (
    <div className="space-y-5 text-[#111111]">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5 font-display leading-none font-extrabold">
            {score != null ? (
              <span className="text-[56px] tracking-[-0.03em] tabular-nums min-[400px]:text-[64px]">{score}</span>
            ) : (
              <>
                <span aria-hidden className="text-[56px] tracking-[-0.03em] min-[400px]:text-[64px]">
                  —
                </span>
                <span className="sr-only">No score yet</span>
              </>
            )}
            <span className="text-2xl tracking-[-0.02em] text-[#111111]/70 sm:text-[28px]">/100</span>
          </p>
          {score != null && (
            <p className="mt-3">
              <span className="inline-flex items-center rounded-full border-2 border-[#111111] bg-[#111111] px-2.5 py-0.5 text-xs font-semibold text-block-lime">{gradeFor(score)}</span>
            </p>
          )}
        </div>
        <div className="shrink-0 max-[359px]:hidden">
          <CircularProgress value={s} size={104} strokeWidth={16} shape="square" ariaLabel={score != null ? `Today's score ${s} out of 100` : "No score yet today"} className="stroke-white" progressClassName="stroke-[#111111]" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={onBlockChip}>
          vs yesterday
          {delta == null ? (
            <span className="font-mono">—</span>
          ) : (
            <span className={cn("flex items-center gap-0.5 font-mono font-medium tabular-nums", delta >= 0 ? "text-[#2B7A0B]" : "text-[#C42B2B]")}>
              {delta >= 0 ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          )}
        </span>
        <span className={onBlockChip}>
          Week avg <span className="font-mono font-medium tabular-nums">{weekAvg ?? "—"}</span>
          {weekAvg != null && <span className="font-medium text-[#111111]/75">· {gradeFor(weekAvg)}</span>}
        </span>
      </div>

      {breakdown.length === 0 ? (
        <p className="border-t-2 border-[#111111] pt-4 text-[13px] leading-relaxed text-[#111111]/80">
          Your score appears once today has scheduled tasks. Categories without tasks don&apos;t count against you.
        </p>
      ) : (
        <ul className="space-y-2.5 border-t-2 border-[#111111] pt-4">
          {breakdown.map((b) => (
            <li key={b.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-xs">
              <span className="truncate text-[13px] font-semibold">{CATEGORY_META[b.key].name}</span>
              <BlockBar tone="onBlock" value={b.credit * 100} max={100} fillClassName={BLOCK_BG[categoryBlock(b.key)]} label={`${CATEGORY_META[b.key].name} credit`} />
              <span className="w-14 text-right font-mono tabular-nums">
                <span className="font-medium">{Math.round(b.points)}</span>
                <span className="text-[#111111]/65">/{Math.round(b.weight)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WeekScoreChart({ days, today }: { days: { date: string; score: number | null }[]; today: string }) {
  const patternId = `tm-week-stripes-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const data = days.map((d) => ({ day: DAY_LABELS[dayOfWeek(d.date)], score: d.score == null ? 0 : Math.round(d.score), has: d.score != null, isToday: d.date === today, date: d.date }));
  return (
    <div className="h-32" role="img" aria-label={`Daily scores this week: ${data.map((d) => `${d.day} ${d.has ? d.score : "no data"}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }} barCategoryGap="18%">
          <defs>
            <pattern id={patternId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill="var(--muted)" />
              <rect width="2.5" height="7" fill="var(--foreground)" fillOpacity={0.14} />
            </pattern>
          </defs>
          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: "var(--muted-foreground)" }} />
          <Tooltip
            cursor={false}
            contentStyle={{ background: "var(--popover)", border: "2px solid var(--foreground)", borderRadius: 8, boxShadow: "3px 3px 0 var(--foreground)", fontSize: 12, fontWeight: 600 }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            itemStyle={{ color: "var(--foreground)", fontFamily: "var(--font-mono)" }}
            formatter={(v, _n, p) => [(p.payload as { has: boolean }).has ? `${v}/100` : "No tasks", "Score"]}
            labelFormatter={(_, p) => (p?.[0] ? formatDate((p[0].payload as { date: string }).date, "weekday") : "")}
          />
          <Bar dataKey="score" radius={[4, 4, 4, 4]} maxBarSize={34} background={{ fill: `url(#${patternId})`, radius: 4 }}>
            {data.map((d) => (
              <Cell
                key={d.date}
                fill={d.isToday ? BLOCK_HEX.lime : d.has ? BLOCK_HEX.sky : "transparent"}
                stroke="var(--foreground)"
                strokeWidth={d.has && d.score > 0 ? 2 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Chunky block button: flat colour fill, ink border, hard shadow, lift on hover / sink on press. */
const actionBase = cn(
  "press h-auto min-h-[5.5rem] flex-col items-start justify-between gap-3 rounded-[8px] border-2 border-ink p-3 text-left text-sm font-semibold leading-tight whitespace-normal text-[#111111] shadow-brutal",
  "hover:text-[#111111] dark:text-[#111111] dark:hover:text-[#111111] [&_svg:not([class*='size-'])]:size-5",
  focusRing,
  // The button is itself a block (which resets --ink to #111111 in dark mode), so its outline,
  // drawn on the surrounding card, uses the theme ring colour to stay visible in both themes.
  "focus-visible:outline-ring",
);
const actionTone = {
  lime: "bg-block-lime hover:bg-block-lime dark:bg-block-lime dark:hover:bg-block-lime aria-expanded:bg-block-lime",
  sky: "bg-block-sky hover:bg-block-sky dark:bg-block-sky dark:hover:bg-block-sky aria-expanded:bg-block-sky",
  sun: "bg-block-sun hover:bg-block-sun dark:bg-block-sun dark:hover:bg-block-sun aria-expanded:bg-block-sun",
  violet: "bg-block-violet hover:bg-block-violet dark:bg-block-violet dark:hover:bg-block-violet aria-expanded:bg-block-violet",
  orange: "bg-block-orange hover:bg-block-orange dark:bg-block-orange dark:hover:bg-block-orange aria-expanded:bg-block-orange",
  pink: "bg-block-pink hover:bg-block-pink dark:bg-block-pink dark:hover:bg-block-pink aria-expanded:bg-block-pink",
} as const;

export function QuickActions({ options, today, gymMinutes }: { options: TaskFormOptions; today: string; gymMinutes: number }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "task" | "event" | "gym">(null);
  const { run, pending } = useAction();
  const btn = (tone: keyof typeof actionTone) => cn(actionBase, actionTone[tone]);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Button variant="outline" className={btn("lime")} onClick={() => setDialog("task")}>
        <Plus aria-hidden /> <span>Add task</span>
      </Button>
      <RescheduleDayButton variant="outline" className={btn("sky")} />
      <Button variant="outline" className={btn("sun")} onClick={() => setDialog("event")}>
        <CalendarPlus aria-hidden /> <span>Add event</span>
      </Button>
      <Button variant="outline" className={btn("violet")} disabled={pending} onClick={() => run(() => startLearning({}), { onSuccess: () => router.push("/ai") })}>
        <Play aria-hidden /> <span>Start learning timer</span>
      </Button>
      <Button variant="outline" className={btn("orange")} onClick={() => setDialog("gym")}>
        <Dumbbell aria-hidden /> <span>Log gym session</span>
      </Button>
      <Button variant="outline" className={btn("pink")} nativeButton={false} render={<Link href="/reviews" />}>
        <NotebookPen aria-hidden /> <span>Weekly review</span>
      </Button>
      <TaskFormDialog open={dialog === "task"} onOpenChange={(v) => setDialog(v ? "task" : null)} options={options} defaults={{ date: today }} />
      <EventFormDialog open={dialog === "event"} onOpenChange={(v) => setDialog(v ? "event" : null)} today={today} />
      <GymLogDialog open={dialog === "gym"} onOpenChange={(v) => setDialog(v ? "gym" : null)} today={today} defaultMinutes={gymMinutes} />
    </div>
  );
}

export function ExamSuggestionBanner({ name, daysUntil }: { name: string; daysUntil: number }) {
  const { run, pending } = useAction();
  return (
    <div
      role="region"
      aria-label="Exam mode suggestion"
      className="animate-rise flex flex-col gap-4 rounded-[10px] border-2 border-ink bg-block-sun p-4 text-[#111111] shadow-brutal sm:flex-row sm:items-center sm:p-5"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[8px] border-2 border-[#111111] bg-white" aria-hidden>
        <BookOpenCheck className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn(eyebrow, "text-[#111111]/75")}>Exams ahead</p>
        <p className="mt-0.5 font-display text-lg leading-snug font-extrabold tracking-[-0.01em]">
          {name} {daysUntil === 0 ? "start today" : `start in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`}.
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#111111]/80">Examination mode prioritises preparation, trims optional work and keeps fitness. You can switch back any time.</p>
      </div>
      {/* Literal ink shadows inside the sun block, so they hold in the dark theme too. */}
      <div className="flex shrink-0 items-center gap-2 [--shadow-ink:#111111]">
        <Button disabled={pending} onClick={() => run(() => setMode("EXAM"))} className={cn("border-2 border-[#111111] bg-block-lime text-[#111111] shadow-brutal-sm press hover:bg-block-lime", focusRing)}>
          Switch to Exam mode
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => dismissExamSuggestion(), { success: false })}
          aria-label="Dismiss suggestion"
          className={cn("rounded-[8px] border-2 border-transparent text-[#111111] hover:border-[#111111] hover:bg-white hover:text-[#111111] dark:hover:bg-white", focusRing)}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
