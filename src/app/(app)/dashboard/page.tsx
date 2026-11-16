import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { CalendarClock, Check, Flame, Gauge, GraduationCap, Hourglass, Repeat, SlidersHorizontal } from "lucide-react";
import { getContext } from "@/server/context";
import { dashboardData, taskFormOptions } from "@/server/queries";
import { habitsForDate } from "@/server/habits";
import { EmptyState } from "@/components/common/ui";
import { TaskBoard } from "@/components/tasks/task-board";
import { RescheduleDayButton } from "@/components/tasks/proposal-dialog";
import { HabitChecklist } from "@/components/habits/habit-checklist";
import { InboxPanel } from "@/components/integrations/inbox-panel";
import { ExamSuggestionBanner, QuickActions, ScoreCard, WeekScoreChart } from "@/components/dashboard/widgets";
import { WhyQuote } from "@/components/dashboard/why-quote";
import { BlockBar } from "@/components/dashboard/block-bar";
import { DashTile, Swatch, TileLink } from "@/components/dashboard/tile";
import { BLOCK_BG, MODE_BLOCK, categoryBlock, eyebrow, focusRing } from "@/components/dashboard/blocks";
import { EVENT_TYPE_META, FINAL_MILESTONE, MODE_META, MOTIVATION } from "@/lib/domain/constants";
import { layoutColumns, normalizeLayout, type DashboardPanelId } from "@/lib/domain/dashboard-layout";
import { diffDays, formatDate, formatDuration, formatMinute, greeting } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

/** Ink-bordered stat pill for the header (white, Geist Mono numbers). */
const statPill = "inline-flex h-9 items-center gap-2 rounded-full border-2 border-ink bg-card px-3 text-[13px] font-semibold text-foreground shadow-brutal-sm";
const pillIcon = "grid size-6 shrink-0 place-items-center rounded-full border-2 border-ink text-[#111111] [&_svg]:size-3.5";
const num = "font-mono font-medium tabular-nums";

export default async function DashboardPage() {
  const ctx = await getContext();
  const layout = normalizeLayout(ctx.settings.dashboardLayout);
  const cols = layoutColumns(layout);
  const visible = new Set<DashboardPanelId>([...cols.main, ...cols.side, ...cols.full]);

  const [d, options, habits] = await Promise.all([
    dashboardData(ctx),
    taskFormOptions(ctx),
    // A secondary panel must never take the whole dashboard down.
    visible.has("habits")
      ? habitsForDate(ctx, ctx.today).catch((e: unknown) => {
          console.error("[dashboard] habits failed to load", e instanceof Error ? e.name : typeof e);
          return [];
        })
      : Promise.resolve([]),
  ]);
  const daysLeft = diffDays(FINAL_MILESTONE, ctx.today);
  const motivation = MOTIVATION[Number(ctx.today.replaceAll("-", "")) % MOTIVATION.length];
  const personalWhy = ctx.settings.personalWhy?.trim() || null;
  const weekPct = d.week.total ? Math.round((d.week.completed / d.week.total) * 100) : 0;
  const todayDone = d.todayTasks.filter((t) => t.status === "COMPLETED").length;
  const nextExam = d.examPeriods[0];
  const activeTargets = d.targets.filter((t) => t.target > 0);

  const panels: Record<DashboardPanelId, () => ReactNode> = {
    score: () => (
      <DashTile key="score" id="dash-score" tone="lime" title="Today's score" description={`${todayDone} of ${d.todayTasks.length} tasks complete`}>
        <ScoreCard score={d.score?.score ?? null} breakdown={d.score?.breakdown ?? []} yesterday={d.yesterdayScore} weekAvg={d.weekAvg} />
      </DashTile>
    ),

    tasks: () => (
      <DashTile key="tasks" id="dash-tasks" title="Today's tasks" description="Grouped by part of day" action={<RescheduleDayButton size="sm" />}>
        <TaskBoard tasks={d.todayTasks} options={options} date={ctx.today} compact emptyHint="Plan your week from the Weekly Planner, or add a task for today." />
      </DashTile>
    ),

    habits: () => (
      <DashTile
        key="habits"
        id="dash-habits"
        title="Habits"
        description={habits.length > 0 ? `${habits.filter((h) => h.done).length} of ${habits.length} done today` : undefined}
        action={<TileLink href="/personal#habits">Manage</TileLink>}
      >
        {habits.length === 0 ? (
          <EmptyState icon={Repeat} title="No habits for today" description="Add a few small habits in Personal. They're a nudge, never a scorecard." />
        ) : (
          <HabitChecklist habits={habits} date={ctx.today} />
        )}
      </DashTile>
    ),

    // Async server component: renders its own Panel, or nothing when there is nothing to show.
    // Suspense (no visual wrapper) so it streams in without holding back the rest of the dashboard.
    inbox: () => (
      <Suspense key="inbox" fallback={null}>
        <InboxPanel />
      </Suspense>
    ),

    quickActions: () => (
      <DashTile key="quickActions" id="dash-quick-actions" title="Quick actions">
        <QuickActions options={options} today={ctx.today} gymMinutes={ctx.settings.gymDurationMin} />
      </DashTile>
    ),

    week: () => (
      <DashTile
        key="week"
        id="dash-week"
        title="This week"
        description={
          <>
            <span className={num}>{d.week.completed}</span> completed · <span className={num}>{d.week.pending}</span> pending
          </>
        }
        action={<TileLink href="/planner">Planner</TileLink>}
      >
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <span className={cn(eyebrow, "text-muted-foreground")}>Completion</span>
              <span className="font-display text-[32px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                {weekPct}
                <span className="text-lg text-muted-foreground">%</span>
              </span>
            </div>
            <BlockBar value={weekPct} max={100} size="lg" striped label="Weekly completion" />
          </div>

          <div>
            <p className={cn(eyebrow, "mb-2 text-muted-foreground")}>Daily score</p>
            <WeekScoreChart days={d.week.days} today={ctx.today} />
          </div>

          <div className="space-y-3">
            <p className={cn(eyebrow, "text-muted-foreground")}>Weekly targets</p>
            {activeTargets.length === 0 && <p className="text-[13px] text-muted-foreground">No targets active in this mode.</p>}
            {activeTargets.slice(0, 6).map((t) => {
              const met = t.done >= t.target;
              return (
                <div key={t.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2 font-semibold">
                      <Swatch className={BLOCK_BG[categoryBlock(t.categoryKey)]} />
                      <span className="truncate">{t.label}</span>
                      {met && (
                        <span className="grid size-4 shrink-0 place-items-center rounded-[4px] border-2 border-ink bg-block-lime text-[#111111]" title="Target met">
                          <Check className="size-2.5" strokeWidth={4} aria-hidden />
                          <span className="sr-only">Target met</span>
                        </span>
                      )}
                    </span>
                    <span className={cn(num, "shrink-0 text-xs text-muted-foreground")}>
                      {t.unit === "MINUTES" ? `${formatDuration(t.done)} / ${formatDuration(t.target)}` : `${t.done} / ${t.target}`}
                    </span>
                  </div>
                  <BlockBar value={t.done} max={t.target} size="sm" fillClassName={BLOCK_BG[categoryBlock(t.categoryKey)]} label={t.label} />
                </div>
              );
            })}
          </div>

          {d.week.categories.length > 0 && (
            <ul className="flex flex-wrap gap-2 border-t-2 border-ink pt-4" aria-label="Tasks done by category this week">
              {d.week.categories.map((c) => (
                <li key={c.key} className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-card px-2.5 py-1 text-xs font-semibold">
                  <Swatch className={BLOCK_BG[categoryBlock(c.key)]} />
                  {c.name}
                  <span className={cn(num, "text-muted-foreground")}>
                    {c.done}/{c.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DashTile>
    ),

    upcoming: () => (
      <DashTile key="upcoming" id="dash-upcoming" title="Upcoming" action={<TileLink href="/calendar">Calendar</TileLink>}>
        {nextExam && (
          <div className="mb-4 flex items-center gap-3 rounded-[10px] border-2 border-ink bg-muted p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[8px] border-2 border-ink bg-block-sky text-[#111111]" aria-hidden>
              <GraduationCap className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn(eyebrow, "text-muted-foreground")}>Next exams</p>
              <p className="truncate text-sm font-semibold">{nextExam.name}</p>
              <p className={cn(num, "text-xs text-muted-foreground")}>
                {formatDate(nextExam.startDate, "dm")} – {formatDate(nextExam.endDate, "dm")}
              </p>
            </div>
            <p className="shrink-0 text-right font-display text-2xl leading-none font-extrabold tracking-[-0.03em] tabular-nums">
              {nextExam.daysUntil > 0 ? (
                <>
                  {nextExam.daysUntil}
                  <span className="text-sm text-muted-foreground">d</span>
                </>
              ) : (
                "Now"
              )}
            </p>
          </div>
        )}
        {d.events.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No events in the next 30 days" description="Add exams, deadlines and interviews so the scheduler can plan around them." />
        ) : (
          <ul className="space-y-3">
            {d.events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                {/* Calendar block: ink header strip with the weekday, big date below. */}
                <span className="flex w-12 shrink-0 flex-col overflow-hidden rounded-[8px] border-2 border-ink bg-card text-center shadow-brutal-sm" aria-hidden>
                  <span className="bg-ink py-0.5 text-[11px] leading-tight font-semibold tracking-[0.08em] text-background uppercase">{formatDate(e.date, "weekday").split(" ")[0]}</span>
                  <span className="py-1 font-display text-lg leading-none font-extrabold tabular-nums">{Number(e.date.slice(8))}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <span className="sr-only">{formatDate(e.date, "weekday")} · </span>
                    {EVENT_TYPE_META[e.type]?.label ?? e.type}
                    {e.startMinute != null && !e.allDay && <span className={num}> · {formatMinute(e.startMinute)}</span>}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full border-2 border-ink px-2 py-0.5 text-[11px] font-semibold",
                    e.daysUntil === 0 ? "bg-block-sun text-[#111111]" : cn("bg-card", num),
                  )}
                >
                  {e.daysUntil === 0 ? "Today" : `${e.daysUntil}d`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashTile>
    ),

    goals: () => (
      <DashTile key="goals" id="dash-goals" title="Long-term goals" description="Progress is calculated from completed milestones" action={<TileLink href="/goals">All goals</TileLink>}>
        {d.goals.length === 0 ? (
          <EmptyState title="No goals yet" description="Add long-term goals and milestones to track progress toward December 2027." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {d.goals.slice(0, 8).map((g) => {
              const block = BLOCK_BG[categoryBlock(g.categoryKey)];
              return (
                <Link
                  key={g.id}
                  href={`/goals#${g.id}`}
                  className={cn("press group flex min-w-0 flex-col rounded-[10px] border-2 border-ink bg-card p-4 shadow-brutal-sm hover:bg-muted/60", focusRing)}
                >
                  <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Swatch className={block} />
                    {g.milestones > 0 ? (
                      <span>
                        <span className={num}>
                          {g.done}/{g.milestones}
                        </span>{" "}
                        milestones
                      </span>
                    ) : (
                      "No milestones"
                    )}
                  </span>
                  <span className="mt-2 line-clamp-2 min-h-10 text-[15px] leading-snug font-semibold">{g.title}</span>
                  <span className="mt-4 font-display text-[28px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                    {g.progress}
                    <span className="text-sm text-muted-foreground">%</span>
                  </span>
                  <BlockBar value={g.progress} max={100} fillClassName={block} label={`${g.title} progress`} className="mt-2" />
                </Link>
              );
            })}
          </div>
        )}
      </DashTile>
    ),
  };

  const render = (ids: DashboardPanelId[]) => ids.map((id) => panels[id]());
  const hasMain = cols.main.length > 0;
  const hasSide = cols.side.length > 0;
  const modeBlock = MODE_BLOCK[ctx.mode];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className={cn(eyebrow, "text-muted-foreground")}>{formatDate(ctx.today, "long")}</p>
          <h1 className="mt-2 font-display text-[36px] leading-[1.02] font-extrabold tracking-[-0.03em] text-balance sm:text-[40px]">
            {greeting(ctx.nowMinute)}, {ctx.name}.
          </h1>
          {personalWhy ? <WhyQuote text={personalWhy} /> : <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">{motivation}</p>}
        </div>
        <ul className="flex flex-wrap items-center gap-2.5 lg:justify-end" aria-label="At a glance">
          <li className={statPill}>
            <span className={cn(pillIcon, "bg-block-sky")} aria-hidden>
              <Hourglass />
            </span>
            <span className={cn(num, "text-sm")}>{daysLeft}</span>
            <span className="font-medium text-muted-foreground">days to 31 Dec 2027</span>
          </li>
          <li className={statPill}>
            <span className={cn(pillIcon, "bg-block-orange")} aria-hidden>
              <Flame />
            </span>
            <span className={cn(num, "text-sm")}>{d.streak}</span>
            <span className="font-medium text-muted-foreground">day streak</span>
          </li>
          <li className={statPill}>
            <span className={cn(pillIcon, BLOCK_BG[modeBlock])} aria-hidden>
              <Gauge />
            </span>
            <span className="font-medium text-muted-foreground">Mode</span>
            <span>{MODE_META[ctx.mode].label}</span>
          </li>
          <li>
            <Link
              href="/settings?tab=personalize"
              aria-label="Customize dashboard"
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-transparent px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-ink hover:bg-card hover:text-foreground",
                focusRing,
              )}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              Customize
            </Link>
          </li>
        </ul>
      </header>

      {d.examSuggestion && <ExamSuggestionBanner name={d.examSuggestion.name} daysUntil={d.examSuggestion.daysUntil} />}

      {hasMain && hasSide ? (
        <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <div className="min-w-0 space-y-6">{render(cols.main)}</div>
          <div className="min-w-0 space-y-6">{render(cols.side)}</div>
        </div>
      ) : hasMain ? (
        <div className="space-y-6">{render(cols.main)}</div>
      ) : hasSide ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">{render(cols.side)}</div>
      ) : null}

      {render(cols.full)}

      {!hasMain && !hasSide && cols.full.length === 0 && (
        <EmptyState
          icon={SlidersHorizontal}
          title="All dashboard panels are hidden"
          description="Your data is all still here. Turn panels back on whenever you like."
          action={
            <Link
              href="/settings?tab=personalize"
              className={cn("press inline-flex items-center rounded-[8px] border-2 border-ink bg-block-lime px-3 py-1.5 text-sm font-semibold text-[#111111] shadow-brutal-md", focusRing, "focus-visible:outline-ring")}
            >
              Customize dashboard
            </Link>
          }
        />
      )}
    </div>
  );
}
