import Link from "next/link";
import { Award, Briefcase, CheckCircle2, Clapperboard, Clock, Dumbbell, Landmark, PiggyBank, Send, Target, Wallet, XCircle } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { monthlyReport, weeklyReport, yearReport } from "@/server/reports";
import { PageHeader, Panel, Stat } from "@/components/common/ui";
import { Bars, Donut, Lines, TrendArea } from "@/components/charts/charts";
import { ExportButtons } from "@/components/analytics/export-buttons";
import { inr } from "@/lib/format";
import { addDays, datesBetween, formatDate, formatDuration, formatMonth, monthKey } from "@/lib/time";
import { CATEGORY_META, type CategoryKeyT } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";
import { BLOCK, display, divide, eyebrow, num, segItem, segList } from "@/components/config/bold";
import { CategorySwatch } from "@/components/tasks/category-style";

export const metadata = { title: "Analytics" };

const TABS = ["daily", "weekly", "monthly", "yearly"] as const;

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const tab = TABS.includes(sp.tab as (typeof TABS)[number]) ? (sp.tab as (typeof TABS)[number]) : "weekly";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Analytics" title="How you spend your time" description="All charts are calculated from your actual logged activity." actions={<ExportButtons />} />
      <nav className={cn(segList, "print:hidden")} aria-label="Report period">
        {TABS.map((t) => (
          <Link key={t} href={`/analytics?tab=${t}`} aria-current={tab === t ? "page" : undefined} className={segItem(tab === t)}>
            {t === "yearly" ? "2027 report" : t}
          </Link>
        ))}
      </nav>
      {tab === "daily" && <Daily />}
      {tab === "weekly" && <Weekly />}
      {tab === "monthly" && <Monthly />}
      {tab === "yearly" && <Yearly />}
    </div>
  );

  async function Daily() {
    const start = addDays(ctx.today, -29);
    const [scores, tasks] = await Promise.all([
      db.dailyScore.findMany({ where: { userId: ctx.userId, date: { gte: start, lte: ctx.today } } }),
      db.task.findMany({ where: { userId: ctx.userId, date: { gte: start, lte: ctx.today } }, select: { date: true, status: true, durationMin: true, actualMin: true, categoryId: true, skipApproved: true } }),
    ]);
    const days = datesBetween(start, ctx.today);
    const series = days.map((d) => {
      const list = tasks.filter((t) => t.date === d);
      return {
        label: formatDate(d, "dm"),
        score: scores.find((s) => s.date === d)?.score != null ? Math.round(scores.find((s) => s.date === d)!.score) : null,
        completed: list.filter((t) => t.status === "COMPLETED").length,
        missed: list.filter((t) => t.status === "MISSED" || (t.status === "SKIPPED" && !t.skipApproved)).length,
      };
    });
    const today = tasks.filter((t) => t.date === ctx.today);
    const timeByCat = new Map<string, number>();
    for (const t of today.filter((t) => t.status === "COMPLETED")) {
      const key = ctx.catById.get(t.categoryId)?.key ?? "PERSONAL";
      timeByCat.set(key, (timeByCat.get(key) ?? 0) + (t.actualMin ?? t.durationMin));
    }
    const spent = [...timeByCat.values()].reduce((a, b) => a + b, 0);
    const todayScore = scores.find((s) => s.date === ctx.today);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Today's score" value={todayScore ? Math.round(todayScore.score) : "—"} icon={Target} tone="accent" />
          <Stat label="Completed today" value={today.filter((t) => t.status === "COMPLETED").length} icon={CheckCircle2} tone="success" />
          <Stat label="Missed today" value={today.filter((t) => t.status === "MISSED" || (t.status === "SKIPPED" && !t.skipApproved)).length} icon={XCircle} />
          <Stat label="Time spent" value={formatDuration(spent)} hint="On completed tasks" icon={Clock} />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Panel title="Daily score" description="Last 30 days">
            <TrendArea data={series} dataKey="score" domain={[0, 100]} ariaLabel="Daily score over the last 30 days" emptyText="Scores appear as you complete tasks" />
          </Panel>
          <Panel title="Today's time by category">
            <Donut data={[...timeByCat.entries()].map(([k, v]) => ({ name: CATEGORY_META[k as CategoryKeyT].name, value: v, color: CATEGORY_META[k as CategoryKeyT]?.color ?? BLOCK.stone }))} unit=" min" ariaLabel="Time spent by category today" />
          </Panel>
        </div>
        <Panel title="Completed vs missed" description="Last 30 days">
          <Bars data={series} keys={[{ key: "completed", label: "Completed", color: BLOCK.lime }, { key: "missed", label: "Missed", color: BLOCK.danger }]} stacked ariaLabel="Completed and missed tasks per day" />
        </Panel>
      </div>
    );
  }

  async function Weekly() {
    const r = await weeklyReport(ctx, ctx.weekStart);
    const weeks = await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const ws = addDays(ctx.weekStart, -7 * (7 - i));
        const [scores, tasks, learning, gym] = await Promise.all([
          db.dailyScore.aggregate({ where: { userId: ctx.userId, date: { gte: ws, lte: addDays(ws, 6) } }, _avg: { score: true } }),
          db.task.groupBy({ by: ["status"], where: { userId: ctx.userId, date: { gte: ws, lte: addDays(ws, 6) }, status: { notIn: ["RESCHEDULED"] } }, _count: true }),
          db.learningSession.aggregate({ where: { userId: ctx.userId, date: { gte: ws, lte: addDays(ws, 6) }, status: "COMPLETED" }, _sum: { durationMin: true } }),
          db.gymSession.count({ where: { userId: ctx.userId, date: { gte: ws, lte: addDays(ws, 6) }, type: { notIn: ["WALK"] } } }),
        ]);
        const total = tasks.reduce((s, t) => s + t._count, 0);
        const done = tasks.find((t) => t.status === "COMPLETED")?._count ?? 0;
        return { label: formatDate(ws, "dm"), avg: scores._avg.score != null ? Math.round(scores._avg.score) : null, completion: total ? Math.round((done / total) * 100) : null, learning: Math.round(((learning._sum.durationMin ?? 0) / 60) * 10) / 10, gym };
      }),
    );
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Average daily score" value={r.avgScore ?? "—"} hint={r.grade ?? "No scored days yet"} icon={Target} tone="accent" />
          <Stat label="Task completion" value={r.completionRate != null ? `${Math.round(r.completionRate * 100)}%` : "—"} hint={`${r.tasksCompleted}/${r.tasksTotal} tasks`} icon={CheckCircle2} />
          <Stat label="AI learning" value={formatDuration(r.learningMinutes)} hint={`${r.learningSessions} sessions`} icon={Clock} />
          <Stat label="Gym attendance" value={r.gymSessions} hint={`${r.cardioSessions} cardio`} icon={Dumbbell} />
          <Stat label="MBA activities" value={r.mbaActivities.length} icon={Landmark} />
          <Stat label="Career achievements" value={r.proAchievements.length} icon={Briefcase} />
          <Stat label="Creative writing" value={formatDuration(r.creativeMinutes)} hint={`${r.words} words`} icon={Clapperboard} />
          <Stat label="Academics" value={`${r.categoryStats.find((c) => c.key === "ACADEMICS")?.done ?? 0}/${r.categoryStats.find((c) => c.key === "ACADEMICS")?.total ?? 0}`} hint="Study tasks completed" icon={CheckCircle2} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Score & completion trend" description="Last 8 weeks">
            <Lines data={weeks} keys={[{ key: "avg", label: "Avg score", color: BLOCK.violet }, { key: "completion", label: "Completion %", color: BLOCK.orange }]} domain={[0, 100]} ariaLabel="Weekly average score and completion rate" />
          </Panel>
          <Panel title="Learning & gym" description="Last 8 weeks">
            <Bars data={weeks} keys={[{ key: "learning", label: "Learning hours", color: BLOCK.violet }, { key: "gym", label: "Gym sessions", color: BLOCK.lime }]} ariaLabel="Weekly learning hours and gym sessions" />
          </Panel>
        </div>
        <CategoryTable stats={r.categoryStats} />
      </div>
    );
  }

  async function Monthly() {
    const month = monthKey(ctx.today);
    const r = await monthlyReport(ctx, month);
    const year = await yearReport(ctx, Number(month.slice(0, 4)));
    return (
      <div className="space-y-6">
        <h2 className={cn(display, "text-xl")}>{formatMonth(month)}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Average score" value={r.avgScore ?? "—"} hint={r.grade ?? undefined} icon={Target} tone="accent" />
          <Stat label="Tasks completed" value={r.tasksCompleted} hint={r.completionRate != null ? `${Math.round(r.completionRate * 100)}% completion` : undefined} icon={CheckCircle2} />
          <Stat label="Learning hours" value={formatDuration(r.learningMinutes)} icon={Clock} />
          <Stat label="Gym sessions" value={r.gymSessions} hint={r.avgSleep != null ? `Avg sleep ${r.avgSleep}h` : undefined} icon={Dumbbell} />
          <Stat label="Saved" value={inr(r.saved)} hint={`Income ${inr(r.income)}`} icon={PiggyBank} />
          <Stat label="Spent" value={inr(r.expense)} icon={Wallet} />
          <Stat label="Milestones completed" value={r.milestones.length} icon={Award} />
          <Stat label="Weight change" value={r.weightChange != null ? `${r.weightChange > 0 ? "+" : ""}${r.weightChange} kg` : "—"} icon={Dumbbell} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Monthly performance" description={`${year.year}`}>
            <TrendArea data={year.monthly.map((m) => ({ label: formatMonth(m.month).slice(0, 3), avg: m.avgScore }))} dataKey="avg" domain={[0, 100]} ariaLabel="Average score per month" />
          </Panel>
          <Panel title="Productivity" description="Completed tasks and learning hours per month">
            <Bars data={year.monthly.map((m) => ({ label: formatMonth(m.month).slice(0, 3), tasks: m.tasks, learning: m.learningHours }))} keys={[{ key: "tasks", label: "Tasks", color: BLOCK.sky }, { key: "learning", label: "Learning h", color: BLOCK.violet }]} ariaLabel="Tasks and learning per month" />
          </Panel>
        </div>
        <CategoryTable stats={r.categoryStats} />
      </div>
    );
  }

  async function Yearly() {
    const y = await yearReport(ctx, 2027);
    return (
      <div className="space-y-6">
        <Panel title="2027 progress report" description="Your year toward 31 December 2027. Fills in as the year unfolds.">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Tasks completed" value={y.tasksCompleted} icon={CheckCircle2} />
            <Stat label="Learning hours" value={Math.round(y.learningMinutes / 60)} icon={Clock} />
            <Stat label="Gym sessions" value={y.gymSessions} icon={Dumbbell} />
            <Stat label="Achievements" value={y.proAchievements.length} icon={Award} />
            <Stat label="Job applications" value={y.jobApplications} icon={Send} />
            <Stat label="MBA activities" value={y.mbaCount} icon={Landmark} />
            <Stat label="Writing sessions" value={y.creativeCount} icon={Clapperboard} />
            <Stat label="Money earned" value={inr(y.income)} icon={Wallet} />
            <Stat label="Money saved" value={inr(y.saved)} icon={PiggyBank} />
            <Stat label="Goals achieved" value={`${y.goalsAchieved}/${y.goalsTotal}`} icon={Target} tone="success" />
          </div>
        </Panel>
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Learning & gym by month">
            <Bars data={y.monthly.map((m) => ({ label: formatMonth(m.month).slice(0, 3), learning: m.learningHours, gym: m.gym }))} keys={[{ key: "learning", label: "Learning h", color: BLOCK.violet }, { key: "gym", label: "Gym", color: BLOCK.lime }]} ariaLabel="2027 learning hours and gym sessions by month" emptyText="2027 hasn't started yet" />
          </Panel>
          <Panel title="Average score by month">
            <TrendArea data={y.monthly.map((m) => ({ label: formatMonth(m.month).slice(0, 3), avg: m.avgScore }))} dataKey="avg" domain={[0, 100]} ariaLabel="2027 average score by month" emptyText="2027 hasn't started yet" />
          </Panel>
        </div>
      </div>
    );
  }
}

function CategoryTable({ stats }: { stats: { key: string; name: string; color: string; done: number; total: number; rate: number | null; minutes: number }[] }) {
  return (
    <Panel title="Category performance">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr className="border-b-2 border-border">
              <th scope="col" className={cn(eyebrow, "py-2 pr-3")}>Category</th>
              <th scope="col" className={cn(eyebrow, "py-2 pr-3")}>Completed</th>
              <th scope="col" className={cn(eyebrow, "py-2 pr-3")}>Rate</th>
              <th scope="col" className={cn(eyebrow, "py-2 text-right")}>Time</th>
            </tr>
          </thead>
          <tbody className={divide}>
            {stats.map((c) => (
              <tr key={c.key}>
                <th scope="row" className="py-2.5 pr-3 text-left font-semibold">
                  <span className="flex items-center gap-2">
                    <CategorySwatch categoryKey={c.key} color={c.color} />
                    {c.name}
                  </span>
                </th>
                <td className={cn(num, "py-2.5 pr-3")}>
                  {c.done}/{c.total}
                </td>
                <td className={cn(num, "py-2.5 pr-3")}>{c.rate != null ? `${Math.round(c.rate * 100)}%` : "—"}</td>
                <td className={cn(num, "py-2.5 text-right")}>{formatDuration(c.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
