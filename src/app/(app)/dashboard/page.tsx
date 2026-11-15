import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ArrowUpRight, CalendarClock, Flame, GraduationCap, Hourglass, Repeat, SlidersHorizontal } from "lucide-react";
import { getContext } from "@/server/context";
import { dashboardData, taskFormOptions } from "@/server/queries";
import { habitsForDate } from "@/server/habits";
import { Bar, CategoryDot, EmptyState, Panel } from "@/components/common/ui";
import { TaskBoard } from "@/components/tasks/task-board";
import { RescheduleDayButton } from "@/components/tasks/proposal-dialog";
import { HabitChecklist } from "@/components/habits/habit-checklist";
import { InboxPanel } from "@/components/integrations/inbox-panel";
import { ExamSuggestionBanner, QuickActions, ScoreCard, WeekScoreChart } from "@/components/dashboard/widgets";
import { WhyQuote } from "@/components/dashboard/why-quote";
import { EVENT_TYPE_META, FINAL_MILESTONE, MODE_META, MOTIVATION } from "@/lib/domain/constants";
import { layoutColumns, normalizeLayout, type DashboardPanelId } from "@/lib/domain/dashboard-layout";
import { diffDays, formatDate, formatDuration, formatMinute, greeting } from "@/lib/time";

export const metadata = { title: "Dashboard" };

const linkClass = "flex items-center gap-1 rounded-md text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

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

  const panels: Record<DashboardPanelId, () => ReactNode> = {
    score: () => (
      <Panel key="score" title="Today's score" description={`${todayDone} of ${d.todayTasks.length} tasks complete`}>
        <ScoreCard score={d.score?.score ?? null} breakdown={d.score?.breakdown ?? []} yesterday={d.yesterdayScore} weekAvg={d.weekAvg} />
      </Panel>
    ),

    tasks: () => (
      <Panel key="tasks" title="Today's tasks" description="Grouped by part of day" action={<RescheduleDayButton size="sm" />}>
        <TaskBoard tasks={d.todayTasks} options={options} date={ctx.today} compact emptyHint="Plan your week from the Weekly Planner, or add a task for today." />
      </Panel>
    ),

    habits: () => (
      <Panel
        key="habits"
        title="Habits"
        description={habits.length > 0 ? `${habits.filter((h) => h.done).length} of ${habits.length} done today` : undefined}
        action={
          <Link href="/personal#habits" className={linkClass}>
            Manage <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        }
      >
        {habits.length === 0 ? (
          <EmptyState icon={Repeat} title="No habits for today" description="Add a few small habits in Personal. They're a nudge, never a scorecard." />
        ) : (
          <HabitChecklist habits={habits} date={ctx.today} />
        )}
      </Panel>
    ),

    // Async server component: renders its own Panel, or nothing when there is nothing to show.
    // Suspense (no visual wrapper) so it streams in without holding back the rest of the dashboard.
    inbox: () => (
      <Suspense key="inbox" fallback={null}>
        <InboxPanel />
      </Suspense>
    ),

    quickActions: () => (
      <Panel key="quickActions" title="Quick actions">
        <QuickActions options={options} today={ctx.today} gymMinutes={ctx.settings.gymDurationMin} />
      </Panel>
    ),

    week: () => (
      <Panel
        key="week"
        title="This week"
        description={`${d.week.completed} completed · ${d.week.pending} pending`}
        action={
          <Link href="/planner" className={linkClass}>
            Planner <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        }
      >
        <div className="space-y-5">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Completion</span>
              <span className="tabular text-sm font-semibold">{weekPct}%</span>
            </div>
            <Bar value={weekPct} max={100} label="Weekly completion" />
          </div>
          <WeekScoreChart days={d.week.days} today={ctx.today} />
          <div className="space-y-2.5">
            <p className="text-xs font-medium text-muted-foreground">Weekly targets</p>
            {d.targets.filter((t) => t.target > 0).length === 0 && <p className="text-xs text-muted-foreground">No targets active in this mode.</p>}
            {d.targets
              .filter((t) => t.target > 0)
              .slice(0, 6)
              .map((t) => (
                <div key={t.id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span>{t.label}</span>
                    <span className="tabular text-muted-foreground">
                      {t.unit === "MINUTES" ? `${formatDuration(t.done)} / ${formatDuration(t.target)}` : `${t.done} / ${t.target}`}
                    </span>
                  </div>
                  <Bar value={t.done} max={t.target} color={t.done >= t.target ? "var(--success)" : undefined} label={t.label} />
                </div>
              ))}
          </div>
          {d.week.categories.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {d.week.categories.map((c) => (
                <span key={c.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CategoryDot color={c.color} /> {c.name}{" "}
                  <span className="tabular text-foreground">
                    {c.done}/{c.total}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </Panel>
    ),

    upcoming: () => (
      <Panel
        key="upcoming"
        title="Upcoming"
        action={
          <Link href="/calendar" className={linkClass}>
            Calendar <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        }
      >
        {nextExam && (
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-muted/50 p-3">
            <GraduationCap className="size-5 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{nextExam.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(nextExam.startDate, "dm")} – {formatDate(nextExam.endDate, "dm")}
              </p>
            </div>
            <p className="tabular text-right text-sm font-semibold">{nextExam.daysUntil > 0 ? `${nextExam.daysUntil}d` : "Now"}</p>
          </div>
        )}
        {d.events.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No events in the next 30 days" description="Add exams, deadlines and interviews so the scheduler can plan around them." />
        ) : (
          <ul className="space-y-2">
            {d.events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <span className="grid w-11 shrink-0 place-items-center rounded-lg bg-muted py-1 text-center leading-tight">
                  <span className="text-[10px] text-muted-foreground uppercase">{formatDate(e.date, "weekday").split(" ")[0]}</span>
                  <span className="tabular text-sm font-semibold">{Number(e.date.slice(8))}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {EVENT_TYPE_META[e.type]?.label ?? e.type}
                    {e.startMinute != null && !e.allDay && ` · ${formatMinute(e.startMinute)}`}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{e.daysUntil === 0 ? "Today" : `${e.daysUntil}d`}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ),

    goals: () => (
      <Panel
        key="goals"
        title="Long-term goals"
        description="Progress is calculated from completed milestones"
        action={
          <Link href="/goals" className={linkClass}>
            All goals <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        }
      >
        {d.goals.length === 0 ? (
          <EmptyState title="No goals yet" description="Add long-term goals and milestones to track progress toward December 2027." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {d.goals.slice(0, 8).map((g) => (
              <Link key={g.id} href={`/goals#${g.id}`} className="group rounded-xl border border-border p-4 transition-colors hover:border-foreground/20 hover:bg-muted/30">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CategoryDot color={g.color} /> {g.milestones > 0 ? `${g.done}/${g.milestones} milestones` : "No milestones"}
                </div>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm font-medium">{g.title}</p>
                <div className="mt-3 flex items-center gap-3">
                  <Bar value={g.progress} max={100} color={g.color} label={`${g.title} progress`} />
                  <span className="tabular text-xs font-medium">{g.progress}%</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    ),
  };

  const render = (ids: DashboardPanelId[]) => ids.map((id) => panels[id]());
  const hasMain = cols.main.length > 0;
  const hasSide = cols.side.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{formatDate(ctx.today, "long")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {greeting(ctx.nowMinute)}, {ctx.name}.
          </h1>
          {personalWhy ? <WhyQuote text={personalWhy} /> : <p className="mt-1 text-sm text-muted-foreground">{motivation}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <Hourglass className="size-4 text-primary" aria-hidden />
            <span className="tabular font-semibold">{daysLeft}</span>
            <span className="text-muted-foreground">days to 31 Dec 2027</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <Flame className="size-4 text-warning" aria-hidden />
            <span className="tabular font-semibold">{d.streak}</span>
            <span className="text-muted-foreground">day streak</span>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <span className="text-muted-foreground">Mode · </span>
            <span className={`font-medium ${MODE_META[ctx.mode].tone}`}>{MODE_META[ctx.mode].label}</span>
          </div>
          <Link
            href="/settings?tab=personalize"
            aria-label="Customize dashboard"
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Customize
          </Link>
        </div>
      </div>

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
            <Link href="/settings?tab=personalize" className="text-sm font-medium underline-offset-4 hover:underline">
              Customize dashboard
            </Link>
          }
        />
      )}
    </div>
  );
}
