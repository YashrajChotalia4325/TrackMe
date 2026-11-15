"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { getContext } from "../context";
import { recomputeDailyScore } from "../score";
import { checkAchievements } from "../maintenance";
import { firstError, isoDate, optionalText, type ActionResult } from "@/lib/validation";

const revalidateAll = () => {
  for (const p of ["/dashboard", "/ai", "/my-day", "/analytics", "/planner"]) revalidatePath(p);
};

/** Seconds of active time for a session at `now` (paused time excluded). */
function activeSeconds(s: { status: string; accumulatedSec: number; lastResumedAt: Date | null }, now = new Date()) {
  const running = s.status === "RUNNING" && s.lastResumedAt ? Math.max(0, Math.floor((now.getTime() - s.lastResumedAt.getTime()) / 1000)) : 0;
  return s.accumulatedSec + running;
}

export async function startLearning(input: { topic?: string; taskId?: string }): Promise<ActionResult<{ id: string }>> {
  const ctx = await getContext();
  const open = await db.learningSession.findFirst({ where: { userId: ctx.userId, status: { in: ["RUNNING", "PAUSED"] } } });
  if (open) return { ok: false, error: "A learning timer is already active." };
  if (input.taskId) {
    const t = await db.task.findFirst({ where: { id: input.taskId, userId: ctx.userId } });
    if (!t) return { ok: false, error: "Task not found" };
    await db.task.update({ where: { id: t.id }, data: { status: "IN_PROGRESS" } });
  }
  const now = new Date();
  const s = await db.learningSession.create({
    data: { userId: ctx.userId, date: ctx.today, status: "RUNNING", startedAt: now, lastResumedAt: now, topic: input.topic?.trim() || null, taskId: input.taskId ?? null },
  });
  revalidateAll();
  return { ok: true, data: { id: s.id }, message: "Timer started" };
}

export async function pauseLearning(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  const s = await db.learningSession.findFirst({ where: { id, userId: ctx.userId, status: "RUNNING" } });
  if (!s) return { ok: false, error: "No running timer" };
  await db.learningSession.update({ where: { id }, data: { status: "PAUSED", accumulatedSec: activeSeconds(s), lastResumedAt: null } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Paused" };
}

export async function resumeLearning(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  const s = await db.learningSession.findFirst({ where: { id, userId: ctx.userId, status: "PAUSED" } });
  if (!s) return { ok: false, error: "No paused timer" };
  await db.learningSession.update({ where: { id }, data: { status: "RUNNING", lastResumedAt: new Date() } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Resumed" };
}

/**
 * Stop and log the session. Time is the actual active time — never the
 * scheduled duration. A linked task is marked complete only when the user stops
 * the timer (not because the scheduled time has passed).
 */
export async function stopLearning(id: string, input: { topic?: string; notes?: string; completeTask?: boolean }): Promise<ActionResult<{ minutes: number }>> {
  const ctx = await getContext();
  const s = await db.learningSession.findFirst({ where: { id, userId: ctx.userId, status: { in: ["RUNNING", "PAUSED"] } } });
  if (!s) return { ok: false, error: "No active timer" };
  const secs = activeSeconds(s);
  const minutes = Math.round(secs / 60);
  if (minutes < 1) {
    await db.learningSession.delete({ where: { id } });
    if (s.taskId) await db.task.updateMany({ where: { id: s.taskId, status: "IN_PROGRESS" }, data: { status: "PENDING" } });
    revalidateAll();
    return { ok: true, data: { minutes: 0 }, message: "Less than a minute — not logged." };
  }
  await db.learningSession.update({
    where: { id },
    data: { status: "COMPLETED", endedAt: new Date(), accumulatedSec: secs, durationMin: minutes, lastResumedAt: null, topic: input.topic?.trim() || s.topic, notes: input.notes?.trim() || null },
  });
  if (s.taskId) {
    const task = await db.task.findUnique({ where: { id: s.taskId } });
    if (task) {
      const done = input.completeTask !== false;
      const pct = Math.min(100, Math.round((minutes / task.durationMin) * 100));
      await db.task.update({
        where: { id: task.id },
        data: done
          ? { status: "COMPLETED", completionPct: Math.max(pct, 1), actualMin: minutes, completedAt: new Date() }
          : { status: "PENDING", completionPct: pct, actualMin: minutes },
      });
      await db.taskCompletion.create({ data: { taskId: task.id, userId: ctx.userId, status: done ? "COMPLETED" : "PENDING", completionPct: pct, actualMin: minutes, date: task.date, note: "Learning timer" } });
      await recomputeDailyScore(ctx, task.date);
    }
  }
  await checkAchievements(ctx);
  revalidateAll();
  return { ok: true, data: { minutes }, message: `Logged ${minutes} min of learning` };
}

export async function discardLearning(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  const s = await db.learningSession.findFirst({ where: { id, userId: ctx.userId, status: { in: ["RUNNING", "PAUSED"] } } });
  if (!s) return { ok: false, error: "No active timer" };
  await db.learningSession.delete({ where: { id } });
  if (s.taskId) await db.task.updateMany({ where: { id: s.taskId, status: "IN_PROGRESS" }, data: { status: "PENDING" } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Timer discarded" };
}

const manualInput = z.object({ date: isoDate, durationMin: z.number().int().min(1).max(12 * 60), topic: optionalText, notes: optionalText });

export async function logLearning(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const parsed = manualInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;
  if (v.date > ctx.today) return { ok: false, error: "You can't log future sessions." };
  await db.learningSession.create({ data: { userId: ctx.userId, date: v.date, status: "COMPLETED", startedAt: new Date(), endedAt: new Date(), durationMin: v.durationMin, accumulatedSec: v.durationMin * 60, topic: v.topic, notes: v.notes, manual: true } });
  await checkAchievements(ctx);
  revalidateAll();
  return { ok: true, data: undefined, message: "Session logged" };
}

export async function deleteLearning(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.learningSession.deleteMany({ where: { id, userId: ctx.userId, status: "COMPLETED" } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Session deleted" };
}
