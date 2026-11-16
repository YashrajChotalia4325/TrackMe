import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getContext } from "@/server/context";
import { taskFormOptions, weekData } from "@/server/queries";
import { weeklyTargetProgress } from "@/server/targets";
import { Bar, PageHeader, Panel } from "@/components/common/ui";
import { PlannerBoard } from "@/components/planner/planner-board";
import { PlanWeekButton, RescheduleDayButton } from "@/components/tasks/proposal-dialog";
import { Button } from "@/components/ui/button";
import { addDays, dayOfWeek, formatDate, formatDuration, isISODate, weekStart } from "@/lib/time";
import { MODE_META } from "@/lib/domain/constants";
import { SEGMENT } from "@/components/tasks/category-style";

export const metadata = { title: "Weekly Planner" };

export default async function PlannerPage({ searchParams }: PageProps<"/planner">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const ws = typeof sp.week === "string" && isISODate(sp.week) ? weekStart(sp.week) : ctx.weekStart;
  const isCurrent = ws === ctx.weekStart;
  const isPast = addDays(ws, 6) < ctx.today;

  const [days, targets, options] = await Promise.all([weekData(ctx, ws), weeklyTargetProgress(ctx, ws), taskFormOptions(ctx)]);
  const active = targets.filter((t) => t.target > 0);
  const overall = active.length ? Math.round((active.reduce((s, t) => s + Math.min(1, t.done / t.target), 0) / active.length) * 100) : 0;
  const isWeekend = [0, 6].includes(dayOfWeek(ctx.today));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${MODE_META[ctx.mode].label} mode`}
        title="Weekly Planner"
        description={`${formatDate(ws, "dm")} – ${formatDate(addDays(ws, 6))}. Drag tasks between days, or use “Move” on any card.`}
        actions={
          <>
            <div className={SEGMENT}>
              <Button variant="ghost" size="icon" aria-label="Previous week" nativeButton={false} render={<Link href={`/planner?week=${addDays(ws, -7)}`} />}>
                <ChevronLeft className="size-4" />
              </Button>
              {!isCurrent && (
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/planner" />}>
                  This week
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label="Next week" nativeButton={false} render={<Link href={`/planner?week=${addDays(ws, 7)}`} />}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
            {isCurrent && <RescheduleDayButton variant="outline" />}
            {!isPast && <PlanWeekButton weekStart={ws} label={isCurrent ? "Plan rest of week" : "Plan this week"} variant={isCurrent && !isWeekend ? "default" : "outline"} />}
            {isCurrent && <PlanWeekButton label="Plan next week" variant={isWeekend ? "default" : "outline"} />}
          </>
        }
      />

      <Panel title="Weekly targets" description={`${overall}% of targets met so far · measured from actual time logged`}>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active targets in {MODE_META[ctx.mode].label.toLowerCase()} mode. Configure them in Settings.</p>
        ) : (
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((t) => (
              <div key={t.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{t.label}</span>
                  <span className="shrink-0 font-mono text-xs font-medium text-muted-foreground tabular-nums">
                    <span className="text-foreground">{t.unit === "MINUTES" ? formatDuration(t.done) : t.done}</span> / {t.unit === "MINUTES" ? formatDuration(t.target) : `${t.target} sessions`}
                  </span>
                </div>
                <Bar value={t.done} max={t.target} color={t.done >= t.target ? "var(--block-lime)" : undefined} label={t.label} />
                {t.scheduled > 0 && <p className="mt-1 font-mono text-[11px] font-medium text-muted-foreground tabular-nums">+{t.unit === "MINUTES" ? formatDuration(t.scheduled) : t.scheduled} scheduled{t.optional ? " · optional" : ""}</p>}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <PlannerBoard days={days} today={ctx.today} options={options} />
    </div>
  );
}
