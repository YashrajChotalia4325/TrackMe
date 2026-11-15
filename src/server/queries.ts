import "server-only";
import { db } from "./db";
import type { UserContext } from "./context";
import { weeklyTargetProgress } from "./targets";
import { fixedBlocksFor } from "./schedule-context";
import { taskXp } from "@/lib/domain/scoring";
import { currentStreak } from "@/lib/domain/achievements";
import { examModeSuggestion } from "@/lib/domain/scheduler";
import { addDays, diffDays, weekDays, type ISODate } from "@/lib/time";
import type { CategoryKeyT } from "@/lib/domain/constants";
import type { Goal, Milestone, Task } from "@/generated/prisma/client";

export async function totalXp(userId: string) {
  const [tasks, ach] = await Promise.all([
    db.task.findMany({ where: { userId, status: "COMPLETED" }, select: { durationMin: true, completionPct: true } }),
    db.userAchievement.findMany({ where: { userId }, include: { achievement: { select: { xp: true } } } }),
  ]);
  return tasks.reduce((s, t) => s + taskXp(t.durationMin, t.completionPct), 0) + ach.reduce((s, a) => s + a.achievement.xp, 0);
}

export type TaskView = ReturnType<typeof toTaskView>;

export function toTaskView(t: Task, ctx: UserContext) {
  const cat = ctx.catById.get(t.categoryId);
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    categoryId: t.categoryId,
    categoryKey: (cat?.key ?? "PERSONAL") as CategoryKeyT,
    categoryName: cat?.name ?? "Other",
    color: cat?.color ?? "#A1A1AA",
    priority: t.priority,
    kind: t.kind,
    date: t.date,
    startMinute: t.startMinute,
    durationMin: t.durationMin,
    actualMin: t.actualMin,
    status: t.status,
    deadline: t.deadline,
    canSkip: t.canSkip,
    notes: t.notes,
    completionPct: t.completionPct,
    skipReason: t.skipReason,
    skipApproved: t.skipApproved,
    weeklyTargetId: t.weeklyTargetId,
    recurringTaskId: t.recurringTaskId,
    goalId: t.goalId,
    rescheduleCount: t.rescheduleCount,
  };
}

const sortTasks = (a: Task, b: Task) => (a.startMinute ?? 9999) - (b.startMinute ?? 9999) || a.title.localeCompare(b.title);

export function goalProgress(g: Goal & { milestones: Milestone[] }) {
  if (g.progressMode === "MANUAL") return g.manualProgress;
  if (g.milestones.length === 0) return g.status === "ACHIEVED" ? 100 : 0;
  return Math.round((g.milestones.filter((m) => m.doneAt).length / g.milestones.length) * 100);
}

/** Options needed by task forms (categories, targets, goals). */
export async function taskFormOptions(ctx: UserContext) {
  const [targets, goals] = await Promise.all([
    db.weeklyTarget.findMany({ where: { userId: ctx.userId, active: true }, orderBy: { sortOrder: "asc" } }),
    db.goal.findMany({ where: { userId: ctx.userId, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true } }),
  ]);
  return {
    categories: ctx.categories.map((c) => ({ id: c.id, key: c.key, name: c.name, color: c.color })),
    targets: targets.map((t) => ({ id: t.id, label: t.label, categoryId: t.categoryId })),
    goals,
    today: ctx.today,
  };
}
export type TaskFormOptions = Awaited<ReturnType<typeof taskFormOptions>>;

export async function dashboardData(ctx: UserContext) {
  const uid = ctx.userId;
  const ws = ctx.weekStart;
  const days = weekDays(ws);
  const [todayTasks, weekTasks, scores, yesterday, goals, events, periods, activeDates, openProposal, targets] = await Promise.all([
    db.task.findMany({ where: { userId: uid, date: ctx.today } }),
    db.task.findMany({ where: { userId: uid, date: { gte: ws, lte: days[6] } }, select: { status: true, categoryId: true, kind: true, skipApproved: true, date: true } }),
    db.dailyScore.findMany({ where: { userId: uid, date: { gte: ws, lte: days[6] } } }),
    db.dailyScore.findUnique({ where: { userId_date: { userId: uid, date: addDays(ctx.today, -1) } } }),
    db.goal.findMany({ where: { userId: uid, status: { not: "DROPPED" } }, include: { milestones: true, category: true }, orderBy: [{ priority: "desc" }, { sortOrder: "asc" }] }),
    db.event.findMany({ where: { userId: uid, date: { gte: ctx.today, lte: addDays(ctx.today, 30) }, type: { not: "HOLIDAY" } }, orderBy: [{ date: "asc" }, { startMinute: "asc" }], take: 8 }),
    db.examPeriod.findMany({ where: { userId: uid, endDate: { gte: ctx.today } }, orderBy: { startDate: "asc" } }),
    db.task.findMany({ where: { userId: uid, status: "COMPLETED", date: { gte: addDays(ctx.today, -120) } }, select: { date: true }, distinct: ["date"] }),
    db.scheduleVersion.findFirst({ where: { userId: uid, status: "APPLIED" }, orderBy: { appliedAt: "desc" } }),
    weeklyTargetProgress(ctx, ws),
  ]);

  const todayScore = scores.find((s) => s.date === ctx.today) ?? null;
  // Only finished days count toward the weekly average (today is still in progress).
  const pastScores = scores.filter((s) => s.date < ctx.today);
  const weekAvg = pastScores.length ? Math.round(pastScores.reduce((s, d) => s + d.score, 0) / pastScores.length) : null;
  const countable = weekTasks.filter((t) => t.status !== "RESCHEDULED" && !(t.status === "SKIPPED" && t.skipApproved) && !(t.kind === "OPTIONAL" && t.status !== "COMPLETED"));
  const completedWeek = countable.filter((t) => t.status === "COMPLETED").length;

  const categoryWeek = ctx.categories
    .filter((c) => c.key !== "FINANCE")
    .map((c) => {
      const list = countable.filter((t) => t.categoryId === c.id);
      return { key: c.key, name: c.name, color: c.color, done: list.filter((t) => t.status === "COMPLETED").length, total: list.length };
    })
    .filter((c) => c.total > 0);

  const suggestion =
    ctx.mode === "NORMAL" && !(ctx.settings.examSuggestionDismissedAt && diffDays(ctx.today, ctx.settings.examSuggestionDismissedAt.toISOString().slice(0, 10)) < 3)
      ? examModeSuggestion(ctx.today, periods)
      : null;

  return {
    todayTasks: todayTasks.sort(sortTasks).map((t) => toTaskView(t, ctx)),
    score: todayScore ? { score: Math.round(todayScore.score), breakdown: todayScore.breakdown as { key: CategoryKeyT; weight: number; credit: number; points: number; done: number; total: number }[] } : null,
    yesterdayScore: yesterday ? Math.round(yesterday.score) : null,
    weekAvg,
    week: {
      days: days.map((d) => ({ date: d, score: scores.find((s) => s.date === d)?.score ?? null })),
      completed: completedWeek,
      pending: countable.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length,
      total: countable.length,
      categories: categoryWeek,
    },
    targets,
    goals: goals.map((g) => ({ id: g.id, title: g.title, categoryKey: g.category?.key ?? null, color: g.category?.color ?? "#A1A1AA", progress: goalProgress(g), targetDate: g.targetDate, status: g.status, milestones: g.milestones.length, done: g.milestones.filter((m) => m.doneAt).length })),
    events: events.map((e) => ({ id: e.id, title: e.title, type: e.type, date: e.date, startMinute: e.startMinute, endMinute: e.endMinute, allDay: e.allDay, location: e.location, daysUntil: diffDays(e.date, ctx.today) })),
    examPeriods: periods.map((p) => ({ id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate, daysUntil: diffDays(p.startDate, ctx.today) })),
    streak: currentStreak(new Set(activeDates.map((d) => d.date)), ctx.today, addDays),
    examSuggestion: suggestion,
    lastApplied: openProposal ? { id: openProposal.id, summary: openProposal.summary, kind: openProposal.kind, appliedAt: openProposal.appliedAt?.toISOString() ?? null } : null,
  };
}

export async function dayData(ctx: UserContext, date: ISODate) {
  const [tasks, events, missed] = await Promise.all([
    db.task.findMany({ where: { userId: ctx.userId, date } }),
    db.event.findMany({ where: { userId: ctx.userId, date: { lte: date }, OR: [{ date }, { endDate: { gte: date } }] }, orderBy: { startMinute: "asc" } }),
    db.task.findMany({ where: { userId: ctx.userId, status: "MISSED", date: { gte: addDays(ctx.today, -7), lt: ctx.today } }, orderBy: { date: "desc" } }),
  ]);
  return {
    tasks: tasks.sort(sortTasks).map((t) => toTaskView(t, ctx)),
    events: events.map((e) => ({ id: e.id, title: e.title, type: e.type, startMinute: e.startMinute, endMinute: e.endMinute, allDay: e.allDay, location: e.location })),
    missed: missed.map((t) => toTaskView(t, ctx)),
  };
}

export async function weekData(ctx: UserContext, ws: ISODate) {
  const days = weekDays(ws);
  const [tasks, scores, fixed, events] = await Promise.all([
    db.task.findMany({ where: { userId: ctx.userId, date: { gte: ws, lte: days[6] } } }),
    db.dailyScore.findMany({ where: { userId: ctx.userId, date: { gte: ws, lte: days[6] } } }),
    fixedBlocksFor(ctx, days),
    db.event.findMany({ where: { userId: ctx.userId, date: { lte: days[6] }, OR: [{ date: { gte: ws } }, { endDate: { gte: ws } }] } }),
  ]);
  const s = ctx.settings;
  return days.map((date) => {
    const dayTasks = tasks.filter((t) => t.date === date).sort(sortTasks);
    const blocks = fixed.get(date) ?? [];
    const busyMin = blocks.reduce((acc, b) => acc + Math.max(0, Math.min(b.end, s.sleepMinute) - Math.max(b.start, s.wakeMinute)), 0);
    const active = dayTasks.filter((t) => ["PENDING", "IN_PROGRESS", "COMPLETED", "MISSED"].includes(t.status));
    const plannedMin = active.reduce((acc, t) => acc + t.durationMin, 0);
    const window = s.sleepMinute - s.wakeMinute;
    return {
      date,
      tasks: dayTasks.map((t) => toTaskView(t, ctx)),
      fixed: blocks.map((b) => ({ start: b.start, end: b.end, label: b.label ?? "Busy" })),
      events: events.filter((e) => e.date <= date && (e.endDate ?? e.date) >= date).map((e) => ({ id: e.id, title: e.title, type: e.type, endDate: e.endDate, startMinute: e.startMinute, endMinute: e.endMinute, allDay: e.allDay, source: e.source })),
      score: scores.find((x) => x.date === date)?.score ?? null,
      availableMin: Math.max(0, Math.min(window - busyMin - plannedMin, s.dailyFocusLimitMin - plannedMin)),
      plannedMin,
    };
  });
}
