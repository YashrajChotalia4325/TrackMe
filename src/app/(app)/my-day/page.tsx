import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { getContext } from "@/server/context";
import { dayData, taskFormOptions, toTaskView } from "@/server/queries";
import { fixedBlocksFor } from "@/server/schedule-context";
import { weeklyTargetProgress } from "@/server/targets";
import { db } from "@/server/db";
import { PageHeader, Panel } from "@/components/common/ui";
import { TaskBoard, AddTaskButton } from "@/components/tasks/task-board";
import { RescheduleDayButton } from "@/components/tasks/proposal-dialog";
import { FreeTimePanel, MissedList, RecoveryToggle } from "@/components/my-day/widgets";
import { Button } from "@/components/ui/button";
import { addDays, formatDate, formatDuration, formatMinute, isISODate, weekStart } from "@/lib/time";
import { EVENT_TYPE_META } from "@/lib/domain/constants";
import { urgency } from "@/lib/domain/scheduler";
import { toSchedTask } from "@/server/schedule-context";
import { habitsForDate } from "@/server/habits";
import { HabitChecklist } from "@/components/habits/habit-checklist";
import { SEGMENT } from "@/components/tasks/category-style";

export const metadata = { title: "My Day" };

export default async function MyDayPage({ searchParams }: PageProps<"/my-day">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const date = typeof sp.date === "string" && isISODate(sp.date) ? sp.date : ctx.today;
  const isToday = date === ctx.today;
  const ws = weekStart(ctx.today);

  const [data, options, fixed, upcoming, targets, score, habits] = await Promise.all([
    dayData(ctx, date),
    taskFormOptions(ctx),
    fixedBlocksFor(ctx, [date]),
    db.task.findMany({ where: { userId: ctx.userId, date: { gt: ctx.today, lte: addDays(ws, 6) }, status: "PENDING", kind: { not: "FIXED" } } }),
    weeklyTargetProgress(ctx, ws),
    db.dailyScore.findUnique({ where: { userId_date: { userId: ctx.userId, date } } }),
    date <= ctx.today ? habitsForDate(ctx, date) : Promise.resolve([]),
  ]);

  const blocks = (fixed.get(date) ?? []).filter((b) => !data.events.some((e) => e.title === b.label));
  const planned = data.tasks.filter((t) => t.status !== "SKIPPED" && t.status !== "RESCHEDULED").reduce((s, t) => s + t.durationMin, 0);
  const done = data.tasks.filter((t) => t.status === "COMPLETED").length;

  const suggestions = upcoming
    .map((t) => ({ t, u: urgency(toSchedTask(t, ctx), ctx.today) }))
    .sort((a, b) => b.u - a.u)
    .slice(0, 5)
    .map(({ t }) => toTaskView(t, ctx));
  const behind = targets.filter((t) => t.target > 0 && !t.optional && t.done + t.scheduled < t.target);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isToday ? "Today" : date < ctx.today ? "Past day" : "Upcoming"}
        title={formatDate(date, "long")}
        description={`${done}/${data.tasks.length} done · ${formatDuration(planned)} planned${score ? ` · score ${Math.round(score.score)}/100` : ""}`}
        actions={
          <>
            <div className={SEGMENT}>
              <Button variant="ghost" size="icon" aria-label="Previous day" nativeButton={false} render={<Link href={`/my-day?date=${addDays(date, -1)}`} />}>
                <ChevronLeft className="size-4" />
              </Button>
              {!isToday && (
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/my-day" />}>
                  Today
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label="Next day" nativeButton={false} render={<Link href={`/my-day?date=${addDays(date, 1)}`} />}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <AddTaskButton options={options} date={date} variant="outline" />
            {isToday && <RescheduleDayButton />}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {(blocks.length > 0 || data.events.length > 0) && (
            <Panel title="Fixed commitments" description="Protected — the scheduler never moves these">
              <ul className="space-y-1.5">
                {data.events.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-[8px] border-2 border-ink bg-muted px-3 py-2 text-sm">
                    <Lock className="size-3.5 shrink-0 text-foreground" aria-hidden />
                    <span className="w-36 shrink-0 font-mono text-xs font-medium text-muted-foreground tabular-nums">{e.allDay || e.startMinute == null ? "All day" : `${formatMinute(e.startMinute)} – ${formatMinute(e.endMinute)}`}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{e.title}</span>
                    <span className="hidden rounded-[6px] border-2 border-ink bg-card px-1.5 py-px text-[11px] leading-4 font-semibold sm:inline">{EVENT_TYPE_META[e.type]?.label}</span>
                  </li>
                ))}
                {blocks.map((b, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-[8px] border-2 border-ink bg-muted px-3 py-2 text-sm">
                    <Lock className="size-3.5 shrink-0 text-foreground" aria-hidden />
                    <span className="w-36 shrink-0 font-mono text-xs font-medium text-muted-foreground tabular-nums">
                      {formatMinute(b.start)} – {formatMinute(b.end)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{b.label}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Tasks" description="Complete, edit, reschedule, skip or add notes from each task's menu">
            <TaskBoard tasks={data.tasks} options={options} date={date} />
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel
            title="Habits"
            description={date <= ctx.today ? "Encouragement, not a score" : undefined}
            action={
              <Link href="/personal#habits" aria-label="Manage habits" className="rounded-[4px] text-xs font-semibold text-foreground underline decoration-ink/30 decoration-2 underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
                Manage
              </Link>
            }
          >
            {date <= ctx.today ? <HabitChecklist habits={habits} date={date} /> : <p className="text-sm text-muted-foreground">Habits can be ticked on the day itself — nothing to do here yet.</p>}
          </Panel>
          {isToday && (
            <Panel title="Feeling unwell or exhausted?">
              <RecoveryToggle mode={ctx.mode} />
            </Panel>
          )}
          {data.missed.length > 0 && (
            <Panel title="Missed recently" description="Never auto-dumped onto tomorrow. Bring back only what matters.">
              <MissedList tasks={data.missed} today={ctx.today} nowMinute={ctx.nowMinute} />
            </Panel>
          )}
          {isToday && (
            <Panel title="Got extra free time?" description="Due soon or helps a weekly target">
              <FreeTimePanel suggestions={suggestions} behind={behind.map((b) => ({ label: b.label, unit: b.unit, done: b.done, target: b.target, scheduled: b.scheduled }))} today={ctx.today} nowMinute={ctx.nowMinute} />
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
