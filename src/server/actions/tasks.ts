"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { getContext } from "../context";
import { recomputeDailyScore } from "../score";
import { syncTrackerLog } from "../task-effects";
import { checkAchievements } from "../maintenance";
import { firstError, isoDate, minuteOfDay, taskInput, type ActionResult } from "@/lib/validation";
import { dayOfWeek } from "@/lib/time";
import { overlaps } from "@/lib/domain/scheduler";
import { fixedBlocksFor } from "../schedule-context";

function revalidateAll() {
  for (const p of ["/dashboard", "/my-day", "/planner", "/calendar", "/analytics", "/ai", "/fitness", "/mba", "/creativity", "/personal"]) revalidatePath(p);
}

/** Returns human-readable overlaps with fixed commitments for a proposed slot. */
async function conflictsFor(ctx: Awaited<ReturnType<typeof getContext>>, date: string, start: number | null, duration: number, ignoreTaskId?: string) {
  if (start == null) return [];
  const block = { start, end: start + duration };
  const fixed = (await fixedBlocksFor(ctx, [date])).get(date) ?? [];
  const fixedTasks = await db.task.findMany({ where: { userId: ctx.userId, date, kind: "FIXED", status: { in: ["PENDING", "IN_PROGRESS"] }, startMinute: { not: null }, id: ignoreTaskId ? { not: ignoreTaskId } : undefined } });
  const all = [...fixed, ...fixedTasks.map((t) => ({ start: t.startMinute!, end: t.startMinute! + t.durationMin, label: t.title }))];
  return all.filter((b) => overlaps(b, block)).map((b) => b.label ?? "a fixed commitment");
}

export async function createTask(raw: unknown): Promise<ActionResult<{ id: string; conflicts: string[] }>> {
  const ctx = await getContext();
  const parsed = taskInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;
  if (!ctx.catById.has(v.categoryId)) return { ok: false, error: "Unknown category" };

  // Duplicate guard: same title, date and start time.
  const dupe = await db.task.findFirst({ where: { userId: ctx.userId, date: v.date, title: v.title, startMinute: v.startMinute, status: { not: "RESCHEDULED" } } });
  if (dupe) return { ok: false, error: "An identical task already exists at that time." };

  const conflicts = v.kind === "FIXED" ? [] : await conflictsFor(ctx, v.date, v.startMinute, v.durationMin);

  const task = await db.$transaction(async (tx) => {
    let recurringTaskId: string | undefined;
    if (v.recurrence) {
      const rec = await tx.recurringTask.create({
        data: {
          userId: ctx.userId,
          title: v.title,
          description: v.description,
          categoryId: v.categoryId,
          priority: v.priority,
          kind: v.kind === "FLEXIBLE" ? "RECURRING" : v.kind,
          durationMin: v.durationMin,
          daysOfWeek: v.recurrence.daysOfWeek,
          preferredStart: v.startMinute,
          startDate: v.date,
          endDate: v.recurrence.endDate ?? null,
          canSkip: v.canSkip,
          weeklyTargetId: v.weeklyTargetId ?? null,
          modes: v.kind === "FIXED" ? ["NORMAL", "EXAM", "RECOVERY"] : ["NORMAL", "EXAM"],
        },
      });
      recurringTaskId = rec.id;
    }
    const created = await tx.task.create({
      data: {
        userId: ctx.userId,
        title: v.title,
        description: v.description,
        categoryId: v.categoryId,
        priority: v.priority,
        kind: v.recurrence && v.kind === "FLEXIBLE" ? "RECURRING" : v.kind,
        date: v.date,
        startMinute: v.startMinute,
        durationMin: v.durationMin,
        deadline: v.deadline ?? null,
        isFlexible: v.kind !== "FIXED",
        canSkip: v.canSkip || v.kind === "OPTIONAL",
        weeklyTargetId: v.weeklyTargetId ?? null,
        goalId: v.goalId ?? null,
        notes: v.notes,
        recurringTaskId,
        dedupeKey: recurringTaskId && v.recurrence!.daysOfWeek.includes(dayOfWeek(v.date)) ? `rec:${recurringTaskId}:${v.date}` : null,
        source: recurringTaskId ? "RECURRING" : "MANUAL",
      },
    });
    await tx.scheduleChange.create({
      data: { userId: ctx.userId, taskId: created.id, taskTitle: created.title, action: "CREATE", toDate: created.date, toStart: created.startMinute, reason: "Created manually" },
    });
    return created;
  });

  await recomputeDailyScore(ctx, v.date);
  revalidateAll();
  return { ok: true, data: { id: task.id, conflicts }, message: conflicts.length ? `Created — overlaps ${conflicts.join(", ")}.` : "Task created" };
}

export async function updateTask(id: string, raw: unknown): Promise<ActionResult<{ conflicts: string[] }>> {
  const ctx = await getContext();
  const parsed = taskInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;
  const before = await db.task.findFirst({ where: { id, userId: ctx.userId } });
  if (!before) return { ok: false, error: "Task not found" };

  const conflicts = v.kind === "FIXED" ? [] : await conflictsFor(ctx, v.date, v.startMinute, v.durationMin, id);
  const moved = before.date !== v.date || before.startMinute !== v.startMinute;

  await db.$transaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: {
        title: v.title,
        description: v.description ?? null,
        categoryId: v.categoryId,
        priority: v.priority,
        kind: v.kind,
        date: v.date,
        startMinute: v.startMinute,
        durationMin: v.durationMin,
        deadline: v.deadline ?? null,
        isFlexible: v.kind !== "FIXED",
        canSkip: v.canSkip || v.kind === "OPTIONAL",
        weeklyTargetId: v.weeklyTargetId ?? null,
        goalId: v.goalId ?? null,
        notes: v.notes ?? null,
      },
    });
    if (moved) {
      await tx.scheduleChange.create({
        data: { userId: ctx.userId, taskId: id, taskTitle: v.title, action: "MOVE", fromDate: before.date, fromStart: before.startMinute, toDate: v.date, toStart: v.startMinute, reason: "Edited manually" },
      });
    }
  });

  await recomputeDailyScore(ctx, before.date);
  if (before.date !== v.date) await recomputeDailyScore(ctx, v.date);
  revalidateAll();
  return { ok: true, data: { conflicts }, message: conflicts.length ? `Saved — overlaps ${conflicts.join(", ")}.` : "Task updated" };
}

const statusInput = z.object({
  id: z.string(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED"]),
  completionPct: z.number().int().min(0).max(100).optional(),
  actualMin: z.number().int().min(0).max(24 * 60).optional(),
  skipReason: z.string().trim().max(300).optional(),
  skipApproved: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
});

/** Change status with an immutable completion-history entry. */
export async function setTaskStatus(raw: z.input<typeof statusInput>): Promise<ActionResult<{ score: number | null }>> {
  const ctx = await getContext();
  const parsed = statusInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;
  const task = await db.task.findFirst({ where: { id: v.id, userId: ctx.userId } });
  if (!task) return { ok: false, error: "Task not found" };

  const completionPct = v.status === "COMPLETED" ? (v.completionPct ?? 100) : v.status === "PENDING" ? 0 : (v.completionPct ?? task.completionPct);
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.task.update({
      where: { id: task.id },
      data: {
        status: v.status,
        completionPct,
        actualMin: v.actualMin ?? (v.status === "PENDING" ? null : task.actualMin),
        completedAt: v.status === "COMPLETED" ? new Date() : null,
        skipReason: v.status === "SKIPPED" ? (v.skipReason ?? null) : null,
        // Skips with a reason on skippable/optional tasks are approved automatically.
        skipApproved: v.status === "SKIPPED" ? (v.skipApproved ?? Boolean(v.skipReason && (task.canSkip || task.kind === "OPTIONAL" || ctx.mode === "RECOVERY"))) : false,
      },
    });
    await tx.taskCompletion.create({
      data: { taskId: task.id, userId: ctx.userId, status: v.status, completionPct, actualMin: v.actualMin, note: v.note ?? v.skipReason, date: task.date },
    });
    await tx.scheduleChange.create({
      data: { userId: ctx.userId, taskId: task.id, taskTitle: task.title, action: v.status === "SKIPPED" ? "SKIP" : "STATUS", fromStatus: task.status, toStatus: v.status, fromDate: task.date, toDate: task.date, reason: v.skipReason },
    });
    return u;
  });

  await syncTrackerLog(ctx, updated, v.status === "COMPLETED");
  const score = await recomputeDailyScore(ctx, task.date);
  if (v.status === "COMPLETED") await checkAchievements(ctx);
  revalidateAll();
  return { ok: true, data: { score: score?.score ?? null } };
}

export async function addTaskNote(id: string, notes: string): Promise<ActionResult> {
  const ctx = await getContext();
  const res = await db.task.updateMany({ where: { id, userId: ctx.userId }, data: { notes: notes.trim().slice(0, 5000) || null } });
  if (res.count === 0) return { ok: false, error: "Task not found" };
  revalidateAll();
  return { ok: true, data: undefined, message: "Note saved" };
}

const moveInput = z.object({ id: z.string(), date: isoDate, startMinute: minuteOfDay.nullable() });

/** Manual move (drag-and-drop or the accessible "Move" dialog). Fixed tasks can be moved manually. */
export async function moveTask(raw: z.input<typeof moveInput>): Promise<ActionResult<{ conflicts: string[] }>> {
  const ctx = await getContext();
  const parsed = moveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;
  const task = await db.task.findFirst({ where: { id: v.id, userId: ctx.userId } });
  if (!task) return { ok: false, error: "Task not found" };
  if (v.startMinute != null && v.startMinute + task.durationMin > 24 * 60) return { ok: false, error: "Task would run past midnight" };
  const conflicts = task.kind === "FIXED" ? [] : await conflictsFor(ctx, v.date, v.startMinute, task.durationMin, task.id);

  await db.$transaction([
    db.task.update({ where: { id: task.id }, data: { date: v.date, startMinute: v.startMinute, status: task.status === "MISSED" ? "PENDING" : task.status } }),
    db.scheduleChange.create({
      data: { userId: ctx.userId, taskId: task.id, taskTitle: task.title, action: "MOVE", fromDate: task.date, fromStart: task.startMinute, toDate: v.date, toStart: v.startMinute, reason: "Moved manually" },
    }),
  ]);
  await recomputeDailyScore(ctx, task.date);
  if (task.date !== v.date) await recomputeDailyScore(ctx, v.date);
  revalidateAll();
  return { ok: true, data: { conflicts }, message: conflicts.length ? `Moved — overlaps ${conflicts.join(", ")}.` : "Task moved" };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  const task = await db.task.findFirst({ where: { id, userId: ctx.userId } });
  if (!task) return { ok: false, error: "Task not found" };
  await syncTrackerLog(ctx, task, false);
  await db.$transaction([
    db.scheduleChange.create({ data: { userId: ctx.userId, taskId: null, taskTitle: task.title, action: "UNSCHEDULE", fromDate: task.date, fromStart: task.startMinute, reason: "Deleted manually" } }),
    db.task.delete({ where: { id } }),
  ]);
  await recomputeDailyScore(ctx, task.date);
  revalidateAll();
  return { ok: true, data: undefined, message: "Task deleted" };
}

export async function stopRecurring(recurringTaskId: string): Promise<ActionResult> {
  const ctx = await getContext();
  const res = await db.recurringTask.updateMany({ where: { id: recurringTaskId, userId: ctx.userId }, data: { active: false, endDate: ctx.today } });
  if (res.count === 0) return { ok: false, error: "Recurring task not found" };
  // Remove future, untouched instances (pending + generated) — history stays.
  await db.task.deleteMany({ where: { userId: ctx.userId, recurringTaskId, date: { gt: ctx.today }, status: "PENDING" } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Recurring task stopped" };
}
