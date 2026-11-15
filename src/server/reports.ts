import "server-only";
import { db } from "./db";
import type { UserContext } from "./context";
import { weeklyTargetProgress } from "./targets";
import { CATEGORY_META, gradeFor, SCORED_CATEGORIES, type CategoryKeyT } from "@/lib/domain/constants";
import { learnLateHourPattern } from "@/lib/domain/scheduler";
import { addDays, datesBetween, formatDuration, monthRange, type ISODate } from "@/lib/time";

async function rangeStats(ctx: UserContext, start: ISODate, end: ISODate) {
  const uid = ctx.userId;
  const range = { gte: start, lte: end };
  const [tasks, scores, learning, gym, pro, jobs, mba, creative, money, milestones, health] = await Promise.all([
    db.task.findMany({ where: { userId: uid, date: range }, orderBy: [{ date: "asc" }, { startMinute: "asc" }] }),
    db.dailyScore.findMany({ where: { userId: uid, date: range }, orderBy: { date: "asc" } }),
    db.learningSession.findMany({ where: { userId: uid, date: range, status: "COMPLETED" } }),
    db.gymSession.findMany({ where: { userId: uid, date: range } }),
    db.professionalAchievement.findMany({ where: { userId: uid, date: range } }),
    db.jobApplication.findMany({ where: { userId: uid, OR: [{ appliedOn: range }, { createdAt: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${end}T23:59:59Z`) } }] } }),
    db.mBAActivity.findMany({ where: { userId: uid, date: range } }),
    db.creativeSession.findMany({ where: { userId: uid, date: range } }),
    db.financialTransaction.findMany({ where: { userId: uid, date: range } }),
    db.milestone.findMany({ where: { goal: { userId: uid }, doneAt: { gte: new Date(`${start}T00:00:00+05:30`), lte: new Date(`${end}T23:59:59+05:30`) } }, include: { goal: true } }),
    db.healthLog.findMany({ where: { userId: uid, date: range }, orderBy: { date: "asc" } }),
  ]);

  const catKey = (id: string) => (ctx.catById.get(id)?.key ?? "PERSONAL") as CategoryKeyT;
  const counted = tasks.filter((t) => t.status !== "RESCHEDULED" && !(t.status === "SKIPPED" && t.skipApproved) && !(t.kind === "OPTIONAL" && t.status !== "COMPLETED"));
  const completed = tasks.filter((t) => t.status === "COMPLETED");
  const failed = counted.filter((t) => t.status === "MISSED" || (t.status === "SKIPPED" && !t.skipApproved) || (t.status === "PENDING" && t.date < ctx.today));

  const categoryStats = SCORED_CATEGORIES.map((key) => {
    const list = counted.filter((t) => catKey(t.categoryId) === key);
    const done = list.filter((t) => t.status === "COMPLETED").length;
    const minutes = list.filter((t) => t.status === "COMPLETED").reduce((s, t) => s + (t.actualMin ?? t.durationMin), 0);
    return { key, name: CATEGORY_META[key].name, color: CATEGORY_META[key].color, done, total: list.length, rate: list.length ? done / list.length : null, minutes };
  });
  const ranked = categoryStats.filter((c) => c.rate != null && c.total >= 1).sort((a, b) => b.rate! - a.rate! || b.total - a.total);

  const sum = (xs: { durationMin: number }[]) => xs.reduce((s, x) => s + x.durationMin, 0);
  const income = money.filter((m) => m.type === "INCOME").reduce((s, m) => s + Number(m.amount), 0);
  const expense = money.filter((m) => m.type === "EXPENSE").reduce((s, m) => s + Number(m.amount), 0);
  const saved = money.filter((m) => m.type === "SAVING" || m.type === "INVESTMENT").reduce((s, m) => s + Number(m.amount), 0);
  const avgScore = scores.length ? Math.round(scores.reduce((s, d) => s + d.score, 0) / scores.length) : null;
  const weights = health.filter((h) => h.weightKg != null);
  const sleeps = health.filter((h) => h.sleepHours != null);

  return {
    start,
    end,
    tasksTotal: counted.length,
    tasksCompleted: completed.length,
    completionRate: counted.length ? completed.length / counted.length : null,
    completed: completed.map((t) => ({ title: t.title, date: t.date, category: catKey(t.categoryId) })),
    failed: failed.map((t) => ({ title: t.title, date: t.date, category: catKey(t.categoryId), status: t.status })),
    categoryStats,
    best: ranked[0] ?? null,
    attention: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    scores: scores.map((s) => ({ date: s.date, score: Math.round(s.score), mode: s.mode })),
    avgScore,
    grade: avgScore != null ? gradeFor(avgScore) : null,
    learningMinutes: sum(learning),
    learningSessions: learning.length,
    gymSessions: gym.filter((g) => g.type !== "WALK" && g.type !== "CARDIO").length,
    cardioSessions: gym.filter((g) => g.type === "CARDIO").length,
    proAchievements: pro.map((p) => p.title),
    jobApplications: jobs.length,
    mbaActivities: mba.map((m) => ({ title: m.title, type: m.type })),
    creativeMinutes: sum(creative),
    creativeSessions: creative.length,
    words: creative.reduce((s, c) => s + c.wordCount, 0),
    income,
    expense,
    saved,
    milestones: milestones.map((m) => ({ title: m.title, goal: m.goal.title })),
    weightChange: weights.length >= 2 ? Math.round((weights[weights.length - 1].weightKg! - weights[0].weightKg!) * 10) / 10 : null,
    avgSleep: sleeps.length ? Math.round((sleeps.reduce((s, h) => s + h.sleepHours!, 0) / sleeps.length) * 10) / 10 : null,
    timeByHour: tasks.filter((t) => t.startMinute != null && t.date < ctx.today && t.status !== "RESCHEDULED").map((t) => ({ startMinute: t.startMinute!, completed: t.status === "COMPLETED" })),
  };
}

export type WeeklyReport = Awaited<ReturnType<typeof weeklyReport>>;

/** The 9-question weekly review, plus rule-based improvements. */
export async function weeklyReport(ctx: UserContext, weekStart: ISODate) {
  const end = addDays(weekStart, 6);
  const stats = await rangeStats(ctx, weekStart, end);
  const targets = await weeklyTargetProgress(ctx, weekStart);
  const improvements: string[] = [];
  const late = learnLateHourPattern(stats.timeByHour);
  if (late.suggestion) improvements.push(late.suggestion);
  if (stats.attention && stats.attention.rate! < 0.6) improvements.push(`${stats.attention.name} needs attention — only ${Math.round(stats.attention.rate! * 100)}% completed. Consider fewer, shorter blocks.`);
  const missedTargets = targets.filter((t) => t.target > 0 && !t.optional && t.done < t.target);
  for (const t of missedTargets.slice(0, 3)) {
    improvements.push(`${t.label}: ${t.unit === "MINUTES" ? `${formatDuration(t.done)} of ${formatDuration(t.target)}` : `${t.done}/${t.target} sessions`}. Plan these earlier in the week.`);
  }
  if (stats.completionRate != null && stats.completionRate > 0.9 && stats.tasksTotal >= 10) improvements.push("Excellent consistency. You could add one stretch goal next week — if it doesn't cost sleep.");
  if (stats.tasksTotal === 0) improvements.push("No tasks were tracked this week. Start with a small weekly plan.");
  return { ...stats, targets, improvements, weekStart };
}

export async function monthlyReport(ctx: UserContext, month: string) {
  const { start, end } = monthRange(month);
  const stats = await rangeStats(ctx, start, end < ctx.today ? end : ctx.today < start ? start : ctx.today);
  return { ...stats, month };
}

export async function yearReport(ctx: UserContext, year: number) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const stats = await rangeStats(ctx, start, end);
  const goals = await db.goal.findMany({ where: { userId: ctx.userId }, include: { milestones: true } });
  const uid = ctx.userId;
  const [mbaCount, creativeCount] = await Promise.all([
    db.mBAActivity.count({ where: { userId: uid, date: { gte: start, lte: end } } }),
    db.creativeSession.count({ where: { userId: uid, date: { gte: start, lte: end } } }),
  ]);
  const monthly = await Promise.all(
    Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).map(async (m) => {
      const { start: s, end: e } = monthRange(m);
      const [scores, learning, gym, tasks] = await Promise.all([
        db.dailyScore.aggregate({ where: { userId: uid, date: { gte: s, lte: e } }, _avg: { score: true } }),
        db.learningSession.aggregate({ where: { userId: uid, date: { gte: s, lte: e }, status: "COMPLETED" }, _sum: { durationMin: true } }),
        db.gymSession.count({ where: { userId: uid, date: { gte: s, lte: e }, type: { notIn: ["WALK"] } } }),
        db.task.count({ where: { userId: uid, date: { gte: s, lte: e }, status: "COMPLETED" } }),
      ]);
      return { month: m, avgScore: scores._avg.score ? Math.round(scores._avg.score) : null, learningHours: Math.round(((learning._sum.durationMin ?? 0) / 60) * 10) / 10, gym, tasks };
    }),
  );
  return {
    ...stats,
    year,
    mbaCount,
    creativeCount,
    monthly,
    goalsAchieved: goals.filter((g) => g.status === "ACHIEVED").length,
    goalsTotal: goals.length,
  };
}

export function daysOf(start: ISODate, end: ISODate) {
  return datesBetween(start, end);
}
