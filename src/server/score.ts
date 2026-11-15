import "server-only";
import { db } from "./db";
import type { UserContext } from "./context";
import { computeDailyScore, type ScoreTask } from "@/lib/domain/scoring";
import type { CategoryKeyT, ModeT, Weights } from "@/lib/domain/constants";
import type { ISODate } from "@/lib/time";

/**
 * Recompute and persist the score for one day.
 *
 * Historical integrity: if a DailyScore row already exists for a past day, its
 * stored weights/mode snapshot are reused, so editing category weights later
 * never rewrites history. Today's score uses the current mode + weights.
 */
export async function recomputeDailyScore(ctx: UserContext, date: ISODate) {
  const existing = await db.dailyScore.findUnique({ where: { userId_date: { userId: ctx.userId, date } } });
  const usePast = existing && date < ctx.today;
  const weights = (usePast ? existing.weights : ctx.weights) as Weights;
  const mode = (usePast ? existing.mode : ctx.mode) as ModeT;

  const tasks = await db.task.findMany({ where: { userId: ctx.userId, date } });
  if (tasks.length === 0 && !existing) return null;

  const input: ScoreTask[] = tasks.map((t) => ({
    categoryKey: (ctx.catById.get(t.categoryId)?.key ?? "PERSONAL") as CategoryKeyT,
    status: t.status,
    kind: t.kind,
    durationMin: t.durationMin,
    completionPct: t.completionPct,
    skipApproved: t.skipApproved,
  }));
  const r = computeDailyScore(input, weights);
  const data = {
    score: r.score,
    mode,
    weights,
    breakdown: r.breakdown as unknown as object,
    tasksDone: r.tasksDone,
    tasksTotal: r.tasksTotal,
  };
  return db.dailyScore.upsert({
    where: { userId_date: { userId: ctx.userId, date } },
    update: data,
    create: { userId: ctx.userId, date, ...data },
  });
}

/** Mark past pending tasks as missed (never deletes or moves them) and finalize their scores. */
export async function sweepMissed(ctx: UserContext) {
  const stale = await db.task.findMany({
    where: { userId: ctx.userId, date: { lt: ctx.today }, status: "PENDING" },
    select: { id: true, date: true },
  });
  if (stale.length === 0) return;
  await db.$transaction([
    db.task.updateMany({ where: { id: { in: stale.map((s) => s.id) } }, data: { status: "MISSED" } }),
    db.taskCompletion.createMany({
      data: stale.map((s) => ({ taskId: s.id, userId: ctx.userId, status: "MISSED" as const, date: s.date, note: "Day ended without completion" })),
    }),
  ]);
  for (const d of new Set(stale.map((s) => s.date))) await recomputeDailyScore(ctx, d);
}
