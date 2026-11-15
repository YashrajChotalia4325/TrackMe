"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import { getContext, type UserContext } from "../context";
import { buildDayContexts, learnedSuggestion, toSchedTask } from "../schedule-context";
import { recomputeDailyScore } from "../score";
import { weeklyTargetProgress } from "../targets";
import { planWeek, rescheduleDay, resolveConflicts, type Proposal } from "@/lib/domain/scheduler";
import { addDays, datesBetween, isISODate, weekDays, weekStart as weekStartOf, type ISODate } from "@/lib/time";
import type { ActionResult } from "@/lib/validation";
import type { ScheduleVersionKind } from "@/generated/prisma/client";

export interface StoredProposal extends Proposal {
  kind: ScheduleVersionKind;
  context?: Record<string, string>;
}

function revalidateAll() {
  for (const p of ["/dashboard", "/my-day", "/planner", "/calendar", "/analytics"]) revalidatePath(p);
}

async function saveProposal(ctx: UserContext, kind: ScheduleVersionKind, proposal: Proposal, context?: Record<string, string>) {
  // Only one open proposal of each kind at a time.
  await db.scheduleVersion.updateMany({ where: { userId: ctx.userId, kind, status: "PROPOSED" }, data: { status: "DISCARDED" } });
  const stored: StoredProposal = { ...proposal, kind, context };
  return db.scheduleVersion.create({
    data: { userId: ctx.userId, kind, summary: proposal.summary, proposal: stored as unknown as object },
  });
}

/** Step 1–6 of "Reschedule My Day": compute a proposal (nothing is changed yet). */
export async function proposeRescheduleDay(): Promise<ActionResult<{ versionId: string; proposal: StoredProposal }>> {
  const ctx = await getContext();
  const ws = weekStartOf(ctx.today);
  const weekEnd = addDays(ws, 6);
  // Use the rest of this week, and at least 3 days ahead when it's late in the week.
  const laterDates = datesBetween(addDays(ctx.today, 1), weekEnd < addDays(ctx.today, 3) ? addDays(ctx.today, 3) : weekEnd);

  const todayTasks = await db.task.findMany({ where: { userId: ctx.userId, date: ctx.today } });
  const missedThisWeek = await db.task.findMany({
    where: { userId: ctx.userId, date: { gte: ws, lt: ctx.today }, status: "MISSED", kind: { not: "FIXED" } },
  });
  const candidates = [...todayTasks, ...missedThisWeek];
  const movableIds = new Set(candidates.filter((t) => ["PENDING", "MISSED"].includes(t.status) && t.kind !== "FIXED").map((t) => t.id));

  const { days } = await buildDayContexts(ctx, [ctx.today, ...laterDates], { excludeTaskIds: movableIds });
  const [todayCtx, ...laterDays] = days;
  const proposal = rescheduleDay({
    today: ctx.today,
    nowMinute: ctx.nowMinute,
    todayTasks: candidates.map((t) => toSchedTask(t, ctx)),
    todayCtx,
    laterDays,
    weekEnd: laterDates[laterDates.length - 1] ?? ctx.today,
    gap: ctx.settings.minRestBetweenMin,
    mode: ctx.mode,
  });
  const learned = await learnedSuggestion(ctx);
  if (learned) proposal.suggestions.push(learned);
  const version = await saveProposal(ctx, ctx.mode === "RECOVERY" ? "RECOVERY" : "RESCHEDULE_DAY", proposal);
  return { ok: true, data: { versionId: version.id, proposal: version.proposal as unknown as StoredProposal } };
}

/** Weekly planning: propose next week's (or a given week's) schedule. */
export async function proposeWeekPlan(start?: string): Promise<ActionResult<{ versionId: string; proposal: StoredProposal }>> {
  const ctx = await getContext();
  let ws = start && isISODate(start) ? weekStartOf(start) : weekStartOf(addDays(ctx.today, 7));
  if (addDays(ws, 6) < ctx.today) return { ok: false, error: "That week is already over." };
  const dates = weekDays(ws).filter((d) => d >= ctx.today);
  if (dates.length === 0) return { ok: false, error: "No remaining days to plan." };
  ws = weekStartOf(dates[0]);

  const [{ days }, progress, recurring, existingKeys, carry, periods] = await Promise.all([
    buildDayContexts(ctx, dates),
    weeklyTargetProgress(ctx, ws),
    db.recurringTask.findMany({ where: { userId: ctx.userId, active: true }, include: { weeklyTarget: true } }),
    db.task.findMany({ where: { userId: ctx.userId, date: { in: dates }, dedupeKey: { not: null } }, select: { dedupeKey: true } }),
    db.task.findMany({
      where: { userId: ctx.userId, date: { gte: addDays(ws, -7), lt: ws }, status: { in: ["MISSED", "PENDING"] }, kind: { notIn: ["FIXED", "OPTIONAL"] }, canSkip: false, weeklyTargetId: null },
    }),
    db.examPeriod.findMany({ where: { userId: ctx.userId, endDate: { gte: dates[0] }, startDate: { lte: dates[dates.length - 1] } } }),
  ]);
  if (dates[0] === ctx.today) days[0].notBefore = ctx.nowMinute;

  const examDates = new Set<ISODate>();
  for (const p of periods) for (const d of dates) if (d >= p.startDate && d <= p.endDate) examDates.add(d);

  const proposal = planWeek({
    weekStart: ws,
    mode: ctx.mode,
    days,
    // Partial weeks (planning mid-week) get a prorated target so the remaining days aren't crammed.
    targets: progress.map((p) => ({
      key: p.key,
      label: dates.length < 7 ? `${p.label} (prorated for ${dates.length} day${dates.length === 1 ? "" : "s"})` : p.label,
      categoryKey: p.categoryKey,
      unit: p.unit,
      target: dates.length < 7 ? (p.unit === "MINUTES" ? Math.round((p.target * dates.length) / 7 / 15) * 15 : Math.round((p.target * dates.length) / 7)) : p.target,
      covered: p.done + p.scheduled,
      blockMin: p.blockMin,
      preferredStart: p.key === "gym" ? (ctx.settings.gymPreferredStart ?? p.preferredStart) : p.preferredStart,
      autoPlan: p.autoPlan,
      optional: p.optional,
      daysOfWeek: p.key === "gym" ? ctx.settings.gymDays : undefined,
    })),
    recurring: recurring.map((r) => ({
      id: r.id,
      title: r.title,
      categoryKey: (ctx.catById.get(r.categoryId)?.key ?? "PERSONAL") as never,
      kind: r.kind,
      priority: r.priority,
      durationMin: r.durationMin,
      daysOfWeek: r.daysOfWeek,
      preferredStart: r.preferredStart,
      startDate: r.startDate,
      endDate: r.endDate,
      modes: r.modes,
      canSkip: r.canSkip,
      weeklyTargetKey: r.weeklyTarget?.key ?? null,
    })),
    existingDedupeKeys: new Set(existingKeys.map((k) => k.dedupeKey!)),
    carryover: carry.map((t) => toSchedTask(t, ctx)),
    gap: ctx.settings.minRestBetweenMin,
    examDates,
  });

  if (periods.length && ctx.mode === "NORMAL") {
    proposal.suggestions.unshift(`${periods[0].name} fall in this week — consider switching to Examination mode before applying.`);
  }
  const learned = await learnedSuggestion(ctx);
  if (learned) proposal.suggestions.push(learned);
  const version = await saveProposal(ctx, "WEEKLY_PLAN", proposal, { weekStart: ws });
  return { ok: true, data: { versionId: version.id, proposal: version.proposal as unknown as StoredProposal } };
}

/** Propose fixes for flexible tasks that clash with a new commitment. */
export async function proposeConflictResolution(date: ISODate, start: number, end: number, label: string) {
  const ctx = await getContext();
  const tasksOnDate = await db.task.findMany({ where: { userId: ctx.userId, date } });
  const clashingIds = new Set(
    tasksOnDate.filter((t) => t.startMinute != null && t.kind !== "FIXED" && t.startMinute < end && start < t.startMinute + t.durationMin).map((t) => t.id),
  );
  if (clashingIds.size === 0 && !tasksOnDate.some((t) => t.kind === "FIXED" && t.startMinute != null && t.startMinute < end && start < t.startMinute + t.durationMin)) return null;
  const ws = weekStartOf(date);
  const weekEnd = addDays(ws, 6) < addDays(date, 3) ? addDays(date, 3) : addDays(ws, 6);
  const laterDates = datesBetween(addDays(date, 1), weekEnd);
  const { days } = await buildDayContexts(ctx, [date, ...laterDates], { excludeTaskIds: clashingIds });
  const [dayCtx, ...laterDays] = days;
  if (date === ctx.today) dayCtx.notBefore = ctx.nowMinute;
  const proposal = resolveConflicts({
    date,
    newBlock: { start, end, label },
    tasksOnDate: tasksOnDate.map((t) => toSchedTask(t, ctx)),
    dayCtx,
    laterDays,
    weekEnd,
    gap: ctx.settings.minRestBetweenMin,
  });
  if (proposal.changes.length === 0 && proposal.warnings.length === 0) return null;
  const version = await saveProposal(ctx, "CONFLICT_RESOLUTION", proposal, { label });
  return { versionId: version.id, proposal: version.proposal as unknown as StoredProposal };
}

/** Steps 7–8: apply an approved proposal atomically with a full audit trail. */
export async function applyProposal(versionId: string, excludedIndexes: number[] = []): Promise<ActionResult<{ applied: number; skipped: string[] }>> {
  const ctx = await getContext();
  const version = await db.scheduleVersion.findFirst({ where: { id: versionId, userId: ctx.userId } });
  if (!version) return { ok: false, error: "Proposal not found" };
  if (version.status !== "PROPOSED") return { ok: false, error: "This proposal was already applied or discarded." };
  const proposal = version.proposal as unknown as StoredProposal;
  const excluded = new Set(excludedIndexes);
  const touchedDates = new Set<string>();
  const skipped: string[] = [];

  const targets = await db.weeklyTarget.findMany({ where: { userId: ctx.userId } });
  const targetId = (key?: string) => (key ? (targets.find((t) => t.key === key)?.id ?? null) : null);

  const applied = await db.$transaction(async (tx) => {
    let count = 0;
    for (const [i, c] of proposal.changes.entries()) {
      if (excluded.has(i)) continue;
      if (c.action === "CREATE" && c.create) {
        const s = c.create;
        const exists = await tx.task.findUnique({ where: { userId_dedupeKey: { userId: ctx.userId, dedupeKey: s.dedupeKey } } });
        if (exists) {
          skipped.push(`${s.title} (already exists)`);
          continue;
        }
        const cat = ctx.catByKey.get(s.categoryKey);
        if (!cat) continue;
        const t = await tx.task.create({
          data: {
            userId: ctx.userId,
            title: s.title,
            description: s.description,
            categoryId: cat.id,
            priority: s.priority,
            kind: s.kind,
            date: s.date,
            startMinute: s.startMinute,
            durationMin: s.durationMin,
            isFlexible: s.kind !== "FIXED",
            canSkip: s.canSkip,
            weeklyTargetId: targetId(s.weeklyTargetKey),
            recurringTaskId: s.recurringTaskId,
            dedupeKey: s.dedupeKey,
            source: s.recurringTaskId ? "RECURRING" : "PLANNER",
          },
        });
        await tx.scheduleChange.create({
          data: { userId: ctx.userId, versionId, taskId: t.id, taskTitle: t.title, action: "CREATE", toDate: s.date, toStart: s.startMinute, reason: c.reason, automatic: true },
        });
        touchedDates.add(s.date);
        count++;
        continue;
      }
      if (!c.taskId) continue;
      const task = await tx.task.findFirst({ where: { id: c.taskId, userId: ctx.userId } });
      // Stale check: skip if the task changed since the proposal was made.
      if (!task || (c.from && (task.date !== c.from.date || task.startMinute !== c.from.start)) || task.status === "COMPLETED") {
        skipped.push(c.title);
        continue;
      }
      if (task.kind === "FIXED") {
        skipped.push(`${c.title} (fixed)`);
        continue;
      }
      if (c.action === "MOVE" || c.action === "UNSCHEDULE") {
        await tx.task.update({
          where: { id: task.id },
          data: { date: c.to!.date, startMinute: c.to!.start, status: task.status === "MISSED" ? "PENDING" : task.status, rescheduleCount: { increment: 1 } },
        });
        await tx.scheduleChange.create({
          data: { userId: ctx.userId, versionId, taskId: task.id, taskTitle: task.title, action: c.action, fromDate: task.date, fromStart: task.startMinute, toDate: c.to!.date, toStart: c.to!.start, fromStatus: task.status, toStatus: task.status === "MISSED" ? "PENDING" : task.status, reason: c.reason, automatic: true },
        });
        touchedDates.add(task.date);
        touchedDates.add(c.to!.date);
      } else if (c.action === "SKIP") {
        await tx.task.update({ where: { id: task.id }, data: { status: "SKIPPED", skipReason: c.reason, skipApproved: true } });
        await tx.taskCompletion.create({ data: { taskId: task.id, userId: ctx.userId, status: "SKIPPED", note: c.reason, date: task.date } });
        await tx.scheduleChange.create({
          data: { userId: ctx.userId, versionId, taskId: task.id, taskTitle: task.title, action: "SKIP", fromDate: task.date, fromStart: task.startMinute, fromStatus: task.status, toStatus: "SKIPPED", reason: c.reason, automatic: true },
        });
        touchedDates.add(task.date);
      }
      count++;
    }
    await tx.scheduleVersion.update({ where: { id: versionId }, data: { status: "APPLIED", appliedAt: new Date() } });
    return count;
  });

  for (const d of touchedDates) await recomputeDailyScore(ctx, d);
  revalidateAll();
  return { ok: true, data: { applied, skipped }, message: `${applied} change${applied === 1 ? "" : "s"} applied` };
}

export async function discardProposal(versionId: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.scheduleVersion.updateMany({ where: { id: versionId, userId: ctx.userId, status: "PROPOSED" }, data: { status: "DISCARDED" } });
  revalidateAll();
  return { ok: true, data: undefined };
}

/** Undo an applied schedule version (only changes still in place are reverted). */
export async function undoVersion(versionId: string): Promise<ActionResult<{ reverted: number; kept: string[] }>> {
  const ctx = await getContext();
  const version = await db.scheduleVersion.findFirst({ where: { id: versionId, userId: ctx.userId }, include: { changes: { orderBy: { createdAt: "desc" } } } });
  if (!version) return { ok: false, error: "Schedule version not found" };
  if (version.status !== "APPLIED") return { ok: false, error: "Only applied changes can be undone." };
  const touched = new Set<string>();
  const kept: string[] = [];

  const reverted = await db.$transaction(async (tx) => {
    let n = 0;
    for (const ch of version.changes) {
      if (!ch.taskId) continue;
      const task = await tx.task.findUnique({ where: { id: ch.taskId } });
      if (!task) continue;
      if (ch.action === "CREATE") {
        if (task.status === "PENDING") {
          await tx.task.delete({ where: { id: task.id } });
          touched.add(task.date);
          n++;
        } else kept.push(`${task.title} (already ${task.status.toLowerCase()})`);
      } else if (ch.action === "MOVE" || ch.action === "UNSCHEDULE") {
        if (task.date === ch.toDate && task.startMinute === ch.toStart && task.status !== "COMPLETED") {
          await tx.task.update({ where: { id: task.id }, data: { date: ch.fromDate!, startMinute: ch.fromStart, status: ch.fromStatus ?? task.status, rescheduleCount: { decrement: 1 } } });
          touched.add(task.date);
          touched.add(ch.fromDate!);
          n++;
        } else kept.push(`${task.title} (changed since)`);
      } else if (ch.action === "SKIP") {
        if (task.status === "SKIPPED") {
          await tx.task.update({ where: { id: task.id }, data: { status: ch.fromStatus ?? "PENDING", skipReason: null, skipApproved: false } });
          await tx.taskCompletion.create({ data: { taskId: task.id, userId: ctx.userId, status: ch.fromStatus ?? "PENDING", note: "Undo reschedule", date: task.date } });
          touched.add(task.date);
          n++;
        } else kept.push(task.title);
      }
      await tx.scheduleChange.create({
        data: { userId: ctx.userId, taskId: ch.action === "CREATE" ? null : ch.taskId, taskTitle: ch.taskTitle, action: "RESTORE", fromDate: ch.toDate, fromStart: ch.toStart, toDate: ch.fromDate, toStart: ch.fromStart, reason: "Undo", automatic: false },
      });
    }
    await tx.scheduleVersion.update({ where: { id: versionId }, data: { status: "UNDONE", undoneAt: new Date() } });
    return n;
  });

  for (const d of touched) await recomputeDailyScore(ctx, d);
  revalidateAll();
  return { ok: true, data: { reverted, kept }, message: `Reverted ${reverted} change${reverted === 1 ? "" : "s"}` };
}
