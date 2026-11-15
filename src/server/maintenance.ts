import "server-only";
import { cache } from "react";
import { after } from "next/server";
import { db } from "./db";
import { getContext, type UserContext } from "./context";
import { sweepMissed } from "./score";
import { runIntegrationSyncs } from "./integrations";
import { buildDayContexts } from "./schedule-context";
import { weeklyTargetProgress } from "./targets";
import { findSlot } from "@/lib/domain/scheduler";
import { ACHIEVEMENTS, currentStreak, evaluateAchievements, longestStreak } from "@/lib/domain/achievements";
import { addDays, dayOfWeek, diffDays, formatDate, monthKey, weekStart, type ISODate } from "@/lib/time";
import type { ModeT } from "@/lib/domain/constants";

/**
 * Create task instances for active recurring tasks over the next days.
 * Deduplicated by `rec:<id>:<date>`; placed with the engine so they don't
 * collide with fixed commitments.
 */
export async function materializeRecurring(ctx: UserContext, horizonDays = 7) {
  const recurring = await db.recurringTask.findMany({ where: { userId: ctx.userId, active: true } });
  if (recurring.length === 0) return 0;
  const dates = Array.from({ length: horizonDays }, (_, i) => addDays(ctx.today, i));
  const wanted: { r: (typeof recurring)[number]; date: ISODate; key: string }[] = [];
  for (const r of recurring) {
    if (!r.modes.includes(ctx.mode)) continue;
    for (const date of dates) {
      if (!r.daysOfWeek.includes(dayOfWeek(date))) continue;
      if (date < r.startDate || (r.endDate && date > r.endDate)) continue;
      wanted.push({ r, date, key: `rec:${r.id}:${date}` });
    }
  }
  if (wanted.length === 0) return 0;
  const existing = new Set(
    (await db.task.findMany({ where: { userId: ctx.userId, dedupeKey: { in: wanted.map((w) => w.key) } }, select: { dedupeKey: true } })).map((t) => t.dedupeKey!),
  );
  const todo = wanted.filter((w) => !existing.has(w.key));
  if (todo.length === 0) return 0;

  const { days } = await buildDayContexts(ctx, dates);
  const byDate = new Map(days.map((d) => [d.date, d]));
  let created = 0;
  for (const w of todo) {
    const day = byDate.get(w.date)!;
    // Rest days only get essentials; try again on the next run (no dedupeKey is written).
    if (day.restDay && w.r.kind !== "FIXED" && w.r.kind !== "HIGH_PRIORITY") continue;
    if (w.date === ctx.today) day.notBefore = Math.min(ctx.nowMinute, day.sleep);
    const start =
      findSlot(w.r.kind === "FIXED" ? { ...day, windows: undefined } : day, w.r.durationMin, { preferred: w.r.preferredStart, gap: ctx.settings.minRestBetweenMin, ignoreCaps: w.r.kind === "FIXED", categoryKey: ctx.catById.get(w.r.categoryId)?.key ?? null }) ?? null;
    if (start != null) {
      day.placed.push({ start, end: start + w.r.durationMin });
      day.focusUsed += w.r.durationMin;
      day.tasksCount += 1;
    }
    try {
      await db.task.create({
        data: {
          userId: ctx.userId,
          title: w.r.title,
          description: w.r.description,
          categoryId: w.r.categoryId,
          priority: w.r.priority,
          kind: w.r.kind,
          date: w.date,
          startMinute: start,
          durationMin: w.r.durationMin,
          isFlexible: w.r.kind !== "FIXED",
          canSkip: w.r.canSkip,
          weeklyTargetId: w.r.weeklyTargetId,
          recurringTaskId: w.r.id,
          source: "RECURRING",
          dedupeKey: w.key,
        },
      });
      created += 1;
    } catch {
      // Unique constraint race — another request created it. Safe to ignore.
    }
  }
  return created;
}

async function notify(userId: string, dedupeKey: string, n: { type: string; title: string; body?: string; href?: string }) {
  await db.notification.upsert({
    where: { userId_dedupeKey: { userId, dedupeKey } },
    update: {},
    create: { userId, dedupeKey, ...n },
  });
}

/** Generate de-duplicated in-app notifications. At most one per item per day. */
export async function generateNotifications(ctx: UserContext) {
  const prefs = ctx.settings.notificationPrefs as Record<string, boolean>;
  const uid = ctx.userId;
  const soon = addDays(ctx.today, 3);

  if (prefs.deadlines !== false || prefs.exams !== false) {
    const events = await db.event.findMany({ where: { userId: uid, date: { gte: ctx.today, lte: addDays(ctx.today, 7) } } });
    for (const e of events) {
      const isExam = ["EXAM", "INTERNAL_EXAM", "PRACTICAL_EXAM", "VIVA"].includes(e.type);
      if (isExam && prefs.exams === false) continue;
      if (!isExam && prefs.deadlines === false) continue;
      if (!isExam && e.date > soon) continue;
      const days = diffDays(e.date, ctx.today);
      await notify(uid, `event:${e.id}:${e.date}`, {
        type: isExam ? "exam" : "deadline",
        title: days === 0 ? `Today: ${e.title}` : `${e.title} in ${days} day${days === 1 ? "" : "s"}`,
        body: formatDate(e.date, "long"),
        href: "/calendar",
      });
    }
    const periods = await db.examPeriod.findMany({ where: { userId: uid, endDate: { gte: ctx.today } } });
    for (const p of periods) {
      const days = diffDays(p.startDate, ctx.today);
      if (days >= 0 && days <= p.leadDays && prefs.exams !== false) {
        await notify(uid, `exam-period:${p.id}`, {
          type: "exam",
          title: `${p.name} start in ${days} day${days === 1 ? "" : "s"}`,
          body: ctx.mode === "EXAM" ? "Examination mode is on." : "Consider switching to Examination mode.",
          href: "/academics",
        });
      }
    }
  }

  if (prefs.pendingImportant !== false) {
    const urgent = await db.task.findMany({
      where: { userId: uid, status: { in: ["PENDING", "MISSED"] }, deadline: { gte: ctx.today, lte: soon }, priority: { in: ["HIGH", "CRITICAL"] } },
      take: 5,
    });
    for (const t of urgent) {
      await notify(uid, `task-due:${t.id}:${ctx.today}`, { type: "task", title: `Due soon: ${t.title}`, body: `Deadline ${formatDate(t.deadline!, "weekday")}`, href: "/my-day" });
    }
  }

  const dow = dayOfWeek(ctx.today);
  if (prefs.weeklyReview !== false && (dow === 0 || dow === 6)) {
    await notify(uid, `weekly-review:${weekStart(ctx.today)}`, { type: "review", title: "Your weekly review is ready", body: "Review the week and approve next week's plan.", href: "/reviews" });
  }
  if (prefs.monthlyReview !== false) {
    const lastOfMonth = monthKey(addDays(ctx.today, 1)) !== monthKey(ctx.today);
    if (lastOfMonth || ctx.today.endsWith("-01")) {
      const m = ctx.today.endsWith("-01") ? monthKey(addDays(ctx.today, -1)) : monthKey(ctx.today);
      await notify(uid, `monthly-review:${m}`, { type: "review", title: "Monthly review time", body: "Reflect on the month and set priorities.", href: "/reviews?tab=monthly" });
    }
  }

  if (prefs.milestones !== false) {
    const ms = await db.milestone.findMany({ where: { goal: { userId: uid }, doneAt: null, targetDate: { gte: ctx.today, lte: addDays(ctx.today, 7) } }, include: { goal: true } });
    for (const m of ms) {
      await notify(uid, `milestone:${m.id}`, { type: "milestone", title: `Milestone due ${formatDate(m.targetDate!, "dm")}: ${m.title}`, body: m.goal.title, href: "/goals" });
    }
  }

  if (prefs.weeklyTargets !== false && (dow === 5 || dow === 6)) {
    const progress = await weeklyTargetProgress(ctx, weekStart(ctx.today));
    const behind = progress.filter((p) => p.target > 0 && !p.optional && p.done + p.scheduled < p.target);
    if (behind.length) {
      await notify(uid, `targets:${weekStart(ctx.today)}:${dow}`, {
        type: "target",
        title: `${behind.length} weekly target${behind.length > 1 ? "s are" : " is"} behind`,
        body: behind.map((b) => b.label).join(", "),
        href: "/planner",
      });
    }
  }
}

/** Evaluate achievements and award new ones (with a notification). */
export async function checkAchievements(ctx: UserContext) {
  const uid = ctx.userId;
  const [activeDates, learning, gym, pro, exams, creative, monthly, weekly, jobs, earned] = await Promise.all([
    db.task.findMany({ where: { userId: uid, status: "COMPLETED" }, select: { date: true }, distinct: ["date"], orderBy: { date: "asc" } }),
    db.learningSession.aggregate({ where: { userId: uid, status: "COMPLETED" }, _sum: { durationMin: true } }),
    db.gymSession.count({ where: { userId: uid, type: { notIn: ["WALK"] } } }),
    db.professionalAchievement.count({ where: { userId: uid } }),
    db.examPeriod.count({ where: { userId: uid, endDate: { lt: ctx.today } } }),
    db.creativeSession.count({ where: { userId: uid } }),
    db.monthlyReview.count({ where: { userId: uid, completedAt: { not: null } } }),
    db.weeklyReview.count({ where: { userId: uid, reflection: { not: null } } }),
    db.jobApplication.count({ where: { userId: uid } }),
    db.userAchievement.findMany({ where: { userId: uid }, include: { achievement: true } }),
  ]);
  const dates = activeDates.map((d) => d.date);
  const keys = evaluateAchievements({
    activeDays: dates.length,
    longestStreak: longestStreak(dates, addDays),
    learningMinutes: learning._sum.durationMin ?? 0,
    gymSessions: gym,
    proAchievements: pro,
    completedExamPeriods: exams,
    creativeSessions: creative,
    monthlyReviews: monthly,
    weeklyReviews: weekly,
    jobApplications: jobs,
  });
  const have = new Set(earned.map((e) => e.achievement.key));
  for (const key of keys) {
    if (have.has(key)) continue;
    const a = await db.achievement.findUnique({ where: { key } });
    if (!a) continue;
    await db.userAchievement.create({ data: { userId: uid, achievementId: a.id } }).catch(() => null);
    const meta = ACHIEVEMENTS.find((x) => x.key === key)!;
    await notify(uid, `achievement:${key}`, { type: "achievement", title: `Achievement unlocked: ${meta.title}`, body: `${meta.description} +${meta.xp} XP`, href: "/achievements" });
  }
  return { streak: currentStreak(new Set(dates), ctx.today, addDays) };
}

/** Runs once per request from the app layout. Cheap and idempotent. */
const lastRun = ((globalThis as unknown as { __tmMaint?: Map<string, number> }).__tmMaint ??= new Map());

export const runMaintenance = cache(async () => {
  const ctx = await getContext();
  const key = `${ctx.userId}:${ctx.today}:${ctx.mode}`;
  const last = lastRun.get(key) ?? 0;
  if (Date.now() - last < 60_000) return ctx; // throttle: at most once a minute per user/day/mode
  lastRun.set(key, Date.now());
  await sweepMissed(ctx);
  await materializeRecurring(ctx);
  // Google / GitHub syncs run after the response is sent so a slow provider never delays a page.
  // They only use the user context captured above (no request APIs inside after()).
  after(() => runIntegrationSyncs(ctx).catch(() => undefined));
  await generateNotifications(ctx);
  await checkAchievements(ctx);
  return ctx;
});

export function invalidateMaintenance() {
  lastRun.clear();
}

export function modeLabel(m: ModeT) {
  return m === "EXAM" ? "Examination" : m === "RECOVERY" ? "Recovery" : "Normal";
}
