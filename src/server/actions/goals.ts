"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { getContext } from "../context";
import { firstError, isoDate, optionalText, PRIORITIES, type ActionResult } from "@/lib/validation";
import { weeklyReport, monthlyReport } from "../reports";
import { checkAchievements } from "../maintenance";

const revalidateGoals = () => {
  for (const p of ["/goals", "/dashboard", "/analytics"]) revalidatePath(p);
};

const goalInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: optionalText,
    categoryId: z.string().nullable().optional(),
    startDate: isoDate,
    targetDate: isoDate,
    priority: z.enum(PRIORITIES),
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "ACHIEVED", "PAUSED", "DROPPED"]),
    progressMode: z.enum(["MILESTONES", "MANUAL"]),
    manualProgress: z.number().int().min(0).max(100).default(0),
  })
  .refine((v) => v.targetDate >= v.startDate, { message: "Target date must be after the start date", path: ["targetDate"] });

export async function upsertGoal(id: string | null, raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = goalInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  if (id) {
    const r = await db.goal.updateMany({ where: { id, userId: ctx.userId }, data: p.data });
    if (r.count === 0) return { ok: false, error: "Goal not found" };
  } else {
    await db.goal.create({ data: { userId: ctx.userId, ...p.data } });
  }
  revalidateGoals();
  return { ok: true, data: undefined, message: "Goal saved" };
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.goal.deleteMany({ where: { id, userId: ctx.userId } });
  revalidateGoals();
  return { ok: true, data: undefined, message: "Goal deleted" };
}

export async function addMilestone(goalId: string, title: string, targetDate?: string | null): Promise<ActionResult> {
  const ctx = await getContext();
  const goal = await db.goal.findFirst({ where: { id: goalId, userId: ctx.userId }, include: { milestones: true } });
  if (!goal) return { ok: false, error: "Goal not found" };
  const t = title.trim();
  if (!t) return { ok: false, error: "Milestone title is required" };
  const date = targetDate && isoDate.safeParse(targetDate).success ? targetDate : null;
  await db.milestone.create({ data: { goalId, title: t.slice(0, 200), targetDate: date, order: goal.milestones.length } });
  revalidateGoals();
  return { ok: true, data: undefined, message: "Milestone added" };
}

export async function toggleMilestone(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  const m = await db.milestone.findFirst({ where: { id, goal: { userId: ctx.userId } }, include: { goal: { include: { milestones: true } } } });
  if (!m) return { ok: false, error: "Milestone not found" };
  await db.milestone.update({ where: { id }, data: { doneAt: m.doneAt ? null : new Date() } });
  // Auto-advance goal status from milestones (never auto-mark ACHIEVED without all milestones).
  const remaining = m.goal.milestones.filter((x) => (x.id === id ? !!m.doneAt : !x.doneAt)).length;
  const status = remaining === 0 ? "ACHIEVED" : m.goal.status === "NOT_STARTED" ? "IN_PROGRESS" : m.goal.status === "ACHIEVED" ? "IN_PROGRESS" : m.goal.status;
  if (m.goal.progressMode === "MILESTONES") await db.goal.update({ where: { id: m.goalId }, data: { status } });
  revalidateGoals();
  return { ok: true, data: undefined, message: m.doneAt ? "Milestone reopened" : "Milestone completed" };
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.milestone.deleteMany({ where: { id, goal: { userId: ctx.userId } } });
  revalidateGoals();
  return { ok: true, data: undefined, message: "Milestone removed" };
}

// ── Reviews ──

const weeklyReviewInput = z.object({ weekStart: isoDate, reflection: optionalText, improvements: optionalText });

export async function saveWeeklyReview(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = weeklyReviewInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const data = await weeklyReport(ctx, p.data.weekStart);
  await db.weeklyReview.upsert({
    where: { userId_weekStart: { userId: ctx.userId, weekStart: p.data.weekStart } },
    update: { data: data as unknown as object, reflection: p.data.reflection ?? null, improvements: p.data.improvements ?? null },
    create: { userId: ctx.userId, weekStart: p.data.weekStart, data: data as unknown as object, reflection: p.data.reflection, improvements: p.data.improvements },
  });
  await checkAchievements(ctx);
  revalidatePath("/reviews");
  return { ok: true, data: undefined, message: "Weekly review saved" };
}

const monthlyReviewInput = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), reflection: optionalText, challenges: optionalText, lessons: optionalText, priorities: optionalText });

export async function saveMonthlyReview(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = monthlyReviewInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const { month, ...text } = p.data;
  const data = await monthlyReport(ctx, month);
  const fields = { reflection: text.reflection ?? null, challenges: text.challenges ?? null, lessons: text.lessons ?? null, priorities: text.priorities ?? null };
  await db.monthlyReview.upsert({
    where: { userId_month: { userId: ctx.userId, month } },
    update: { data: data as unknown as object, ...fields, completedAt: new Date() },
    create: { userId: ctx.userId, month, data: data as unknown as object, ...fields, completedAt: new Date() },
  });
  await checkAchievements(ctx);
  revalidatePath("/reviews");
  return { ok: true, data: undefined, message: "Monthly review saved" };
}
