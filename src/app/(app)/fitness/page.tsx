import { CalendarCheck, Droplets, Flame, Moon } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { PageHeader, Panel, Stat } from "@/components/common/ui";
import { Bars, Lines } from "@/components/charts/charts";
import { HealthForm, LogWorkoutButton, WorkoutList } from "@/components/trackers/fitness";
import { addDays, formatDate, monthKey, monthRange } from "@/lib/time";
import { BLOCK } from "@/components/config/bold";

export const metadata = { title: "Fitness & Health" };

export default async function FitnessPage() {
  const ctx = await getContext();
  const s = ctx.settings;
  const [gym, health, todayLog] = await Promise.all([
    db.gymSession.findMany({ where: { userId: ctx.userId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    db.healthLog.findMany({ where: { userId: ctx.userId, date: { gte: addDays(ctx.today, -90) } }, orderBy: { date: "asc" } }),
    db.healthLog.findUnique({ where: { userId_date: { userId: ctx.userId, date: ctx.today } } }),
  ]);
  const strength = gym.filter((g) => g.type !== "WALK" && g.type !== "CARDIO");
  const gymTarget = s.gymDays.length || 4;
  const { start, end } = monthRange(monthKey(ctx.today));
  const monthSessions = strength.filter((g) => g.date >= start && g.date <= end).length;
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const ws = addDays(ctx.weekStart, -7 * (11 - i));
    const inWeek = (g: { date: string }) => g.date >= ws && g.date <= addDays(ws, 6);
    return { ws, label: formatDate(ws, "dm"), gym: strength.filter(inWeek).length, cardio: gym.filter((g) => g.type === "CARDIO" && inWeek(g)).length };
  });
  // Attendance streak: consecutive completed weeks meeting the gym target (current week counts once met).
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const isCurrent = i === weeks.length - 1;
    if (weeks[i].gym >= gymTarget) streak++;
    else if (!isCurrent) break;
  }
  const thisWeek = weeks[weeks.length - 1];
  const consistency = Math.round((weeks.slice(-8).filter((w) => w.gym >= gymTarget).length / 8) * 100);
  const sleepLogs = health.filter((h) => h.sleepHours != null);
  const avgSleep = sleepLogs.length ? Math.round((sleepLogs.slice(-7).reduce((a, h) => a + h.sleepHours!, 0) / Math.min(7, sleepLogs.length)) * 10) / 10 : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Fitness & Health" title="Sustainable consistency" description={`Gym ${gymTarget} days/week · cardio 2–3× · daily walk · ${s.sleepTargetHours}h sleep. Any split you like.`} actions={<LogWorkoutButton today={ctx.today} minutes={s.gymDurationMin} />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="This week" value={`${thisWeek.gym}/${gymTarget}`} hint={`${thisWeek.cardio} cardio`} icon={CalendarCheck} tone={thisWeek.gym >= gymTarget ? "success" : "accent"} />
        <Stat label="Attendance streak" value={`${streak} wk`} hint="Weeks hitting your target" icon={Flame} tone={streak >= 2 ? "warning" : undefined} />
        <Stat label="This month" value={monthSessions} hint={`${strength.length} sessions all-time`} icon={CalendarCheck} />
        <Stat label="Sleep (7-day avg)" value={avgSleep != null ? `${avgSleep}h` : "—"} hint={`Target ${s.sleepTargetHours}h · 8-week consistency ${consistency}%`} icon={Moon} tone={avgSleep != null && avgSleep < 7 ? "warning" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Weekly consistency" description="Gym and cardio sessions, last 12 weeks">
          <Bars data={weeks.map((w) => ({ label: w.label, gym: w.gym, cardio: w.cardio }))} keys={[{ key: "gym", label: "Gym", color: BLOCK.lime }, { key: "cardio", label: "Cardio", color: BLOCK.sky }]} stacked ariaLabel="Weekly gym and cardio sessions" emptyText="No workouts logged yet" />
        </Panel>
        <Panel title="Today's health log" description={todayLog?.waterMl != null ? `${todayLog.waterMl} / ${s.waterTargetMl} ml water` : "Weight, sleep, water, steps"}>
          <HealthForm today={ctx.today} initial={todayLog ? { weightKg: todayLog.weightKg, sleepHours: todayLog.sleepHours, waterMl: todayLog.waterMl, steps: todayLog.steps, walked: todayLog.walked } : null} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Weight" description="Last 90 days">
          <Lines data={health.filter((h) => h.weightKg != null).map((h) => ({ label: formatDate(h.date, "dm"), weight: h.weightKg }))} keys={[{ key: "weight", label: "Weight", color: BLOCK.orange }]} unit=" kg" ariaLabel="Weight trend" emptyText="Log your weight to see the trend" />
        </Panel>
        <Panel title="Sleep" description="Hours per night, last 90 days">
          <Lines data={sleepLogs.map((h) => ({ label: formatDate(h.date, "dm"), sleep: h.sleepHours }))} keys={[{ key: "sleep", label: "Sleep", color: BLOCK.violet }]} unit="h" domain={[0, 12]} ariaLabel="Sleep trend" emptyText="Log sleep to see the trend" />
        </Panel>
      </div>

      <Panel title="Recent workouts" action={<span className="flex items-center gap-1.5 rounded-md border-2 border-border bg-block-teal px-2 py-0.5 text-[11px] font-semibold text-ink"><Droplets className="size-3" aria-hidden /> Walks also mark your daily walk</span>}>
        <WorkoutList items={gym.slice(0, 20).map((g) => ({ id: g.id, date: g.date, type: g.type, durationMin: g.durationMin, focus: g.focus, exercises: g.exercises }))} />
      </Panel>
    </div>
  );
}
