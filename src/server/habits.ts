import "server-only";
import { db } from "./db";
import type { UserContext } from "./context";
import { dayOfWeek, nowIn } from "@/lib/time";
import { bestStreak, completionRate, currentStreak, habitGrid, isExpectedOn, type HabitOverview } from "@/lib/domain/habits";

export type { HabitOverview } from "@/lib/domain/habits";

export interface HabitView {
  id: string;
  name: string;
  icon: string;
  color: string;
  done: boolean;
  /** Current streak in expected days */
  streak: number;
}

type HabitRow = { id: string; createdAt: Date };

/** Group log dates by habit. */
async function logsByHabit(ctx: UserContext, habitIds: string[], upTo: string): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>(habitIds.map((id) => [id, new Set<string>()]));
  if (habitIds.length === 0) return map;
  const logs = await db.habitLog.findMany({
    where: { userId: ctx.userId, habitId: { in: habitIds }, date: { lte: upTo } },
    select: { habitId: true, date: true },
  });
  for (const l of logs) map.get(l.habitId)?.add(l.date);
  return map;
}

/** Earliest day a habit counts from: its creation day, or an earlier back-filled log. */
function sinceFor(ctx: UserContext, habit: HabitRow, done: Set<string>): string {
  let since = nowIn(ctx.tz, habit.createdAt).date;
  for (const d of done) if (d < since) since = d;
  return since;
}

/** Active habits expected on `date`, with done-state and streak. */
export async function habitsForDate(ctx: UserContext, date: string): Promise<HabitView[]> {
  const habits = await db.habit.findMany({
    where: { userId: ctx.userId, active: true, daysOfWeek: { has: dayOfWeek(date) } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const logs = await logsByHabit(
    ctx,
    habits.map((h) => h.id),
    date,
  );
  return habits.map((h) => {
    const done = logs.get(h.id) ?? new Set<string>();
    return {
      id: h.id,
      name: h.name,
      icon: h.icon,
      color: h.color,
      done: done.has(date),
      streak: currentStreak({ daysOfWeek: h.daysOfWeek, done, asOf: date, since: sinceFor(ctx, h, done) }),
    };
  });
}

/** Every habit (active first, then archived) with a 30-day grid, streaks and completion rate. */
export async function habitsOverview(ctx: UserContext): Promise<HabitOverview[]> {
  const habits = await db.habit.findMany({
    where: { userId: ctx.userId },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const logs = await logsByHabit(
    ctx,
    habits.map((h) => h.id),
    ctx.today,
  );
  return habits.map((h) => {
    const done = logs.get(h.id) ?? new Set<string>();
    const since = sinceFor(ctx, h, done);
    const input = { daysOfWeek: h.daysOfWeek, done, asOf: ctx.today, since };
    return {
      id: h.id,
      name: h.name,
      icon: h.icon,
      color: h.color,
      daysOfWeek: h.daysOfWeek,
      active: h.active,
      streak: currentStreak(input),
      best: bestStreak(input),
      rate: completionRate(input, 30),
      grid: habitGrid(h.daysOfWeek, done, ctx.today, 30, since),
      doneToday: done.has(ctx.today),
      expectedToday: isExpectedOn(h.daysOfWeek, ctx.today),
    };
  });
}
