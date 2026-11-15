import { Clock, Flame, Layers, Timer } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { Bar, PageHeader, Panel, Stat } from "@/components/common/ui";
import { LearningTimer, ManualLearningForm, SessionList } from "@/components/trackers/learning-timer";
import { Bars, Heatmap } from "@/components/charts/charts";
import { AddTaskButton } from "@/components/tasks/task-board";
import { taskFormOptions } from "@/server/queries";
import { currentStreak } from "@/lib/domain/achievements";
import { GithubPanel } from "@/components/integrations/github-integration";
import { AiUsagePanel } from "@/components/integrations/ai-import-integration";
import { addDays, datesBetween, formatDate, formatDuration, monthKey, monthRange, weekStart } from "@/lib/time";
import { BLOCK, eyebrow, num } from "@/components/config/bold";

export const metadata = { title: "AI & Technology" };

export default async function AiPage() {
  const ctx = await getContext();
  const s = ctx.settings;
  const heatStart = weekStart(addDays(ctx.today, -7 * 17));
  const [sessions, timer, options] = await Promise.all([
    db.learningSession.findMany({ where: { userId: ctx.userId, status: "COMPLETED" }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    db.learningSession.findFirst({ where: { userId: ctx.userId, status: { in: ["RUNNING", "PAUSED"] } } }),
    taskFormOptions(ctx),
  ]);
  const linked = timer?.taskId ? await db.task.findUnique({ where: { id: timer.taskId }, select: { title: true } }) : null;

  const sum = (from: string, to: string) => sessions.filter((x) => x.date >= from && x.date <= to).reduce((a, x) => a + x.durationMin, 0);
  const todayMin = sum(ctx.today, ctx.today);
  const weekMin = sum(ctx.weekStart, addDays(ctx.weekStart, 6));
  const { start: mStart, end: mEnd } = monthRange(monthKey(ctx.today));
  const monthMin = sum(mStart, mEnd);
  const totalMin = sessions.reduce((a, x) => a + x.durationMin, 0);
  const streak = currentStreak(new Set(sessions.map((x) => x.date)), ctx.today, addDays);

  const heat = datesBetween(heatStart, addDays(weekStart(ctx.today), 6)).map((d) => ({ date: d, value: d > ctx.today ? 0 : sum(d, d) }));
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const ws = addDays(ctx.weekStart, -7 * (11 - i));
    return { label: formatDate(ws, "dm"), hours: Math.round((sum(ws, addDays(ws, 6)) / 60) * 10) / 10, target: Math.round((s.aiWeeklyMin / 60) * 10) / 10 };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI & Technology"
        title="Learning time"
        description="You decide what to learn. TrackMe protects the time and measures consistency — no imposed syllabus."
        actions={<AddTaskButton options={options} label="Schedule a session" variant="outline" categoryKey="AI" />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today" value={formatDuration(todayMin)} hint={`Target ${formatDuration(s.aiDailyMin)}`} icon={Timer} tone={todayMin >= s.aiDailyMin ? "success" : undefined} />
        <Stat label="This week" value={formatDuration(weekMin)} hint={`of ${formatDuration(s.aiWeeklyMin)}`} icon={Clock} tone={weekMin >= s.aiWeeklyMin ? "success" : "accent"} />
        <Stat label="This month" value={formatDuration(monthMin)} hint={`of ${formatDuration(s.aiMonthlyMin)}`} icon={Layers} />
        <Stat label="Learning streak" value={`${streak} day${streak === 1 ? "" : "s"}`} hint={`${formatDuration(totalMin)} total`} icon={Flame} tone={streak >= 3 ? "warning" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Learning timer">
          <LearningTimer
            key={timer?.id ?? "none"}
            timer={timer ? { id: timer.id, status: timer.status as "RUNNING" | "PAUSED", accumulatedSec: timer.accumulatedSec, lastResumedAt: timer.lastResumedAt?.toISOString() ?? null, topic: timer.topic, taskId: timer.taskId } : null}
            linkedTaskTitle={linked?.title ?? null}
          />
        </Panel>
        <Panel title="Log a session manually" description="For learning done away from the timer">
          <ManualLearningForm today={ctx.today} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Progress" description="Week and month against your targets">
          <div className="space-y-4">
            {[
              { label: "Weekly", v: weekMin, t: s.aiWeeklyMin },
              { label: "Monthly", v: monthMin, t: s.aiMonthlyMin },
            ].map((x) => (
              <div key={x.label}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-semibold">{x.label}</span>
                  <span className={`${num} text-xs text-muted-foreground`}>
                    {formatDuration(x.v)} / {formatDuration(x.t)}
                  </span>
                </div>
                <Bar value={x.v} max={x.t} color={x.v >= x.t ? BLOCK.lime : BLOCK.violet} label={`${x.label} learning progress`} />
              </div>
            ))}
            <div className="pt-2">
              <p className={`mb-2 ${eyebrow}`}>Learning calendar · last 18 weeks</p>
              <Heatmap days={heat} label="Learning minutes per day over the last 18 weeks" />
            </div>
          </div>
        </Panel>
        <Panel title="Weekly hours" description="Last 12 weeks">
          <Bars data={weekly} keys={[{ key: "hours", label: "Hours", color: BLOCK.violet }]} unit="h" ariaLabel="Weekly AI learning hours for the last 12 weeks" emptyText="No learning logged yet" />
        </Panel>
      </div>

      <GithubPanel />
      <AiUsagePanel />

      <Panel title="Recent sessions">
        <SessionList sessions={sessions.slice(0, 25).map((x) => ({ id: x.id, date: x.date, durationMin: x.durationMin, topic: x.topic, notes: x.notes, manual: x.manual }))} />
      </Panel>
    </div>
  );
}
