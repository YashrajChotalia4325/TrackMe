import "server-only";
import { busyIntervalOn } from "@/lib/domain/google-calendar";
import { db } from "./db";
import type { UserContext } from "./context";
import type { Block, DayContext, SchedTask } from "@/lib/domain/scheduler";
import { learnLateHourPattern } from "@/lib/domain/scheduler";
import { energyWindowsForDate, protectedBlocksForDate, resolveDayRhythm, type DayRhythm } from "@/lib/domain/rhythm";
import { addDays, dayOfWeek, type ISODate } from "@/lib/time";
import type { CategoryKeyT } from "@/lib/domain/constants";
import type { Task } from "@/generated/prisma/client";

const ACTIVE = ["PENDING", "IN_PROGRESS", "COMPLETED", "MISSED"] as const;

export function toSchedTask(t: Task, ctx: UserContext): SchedTask {
  return {
    id: t.id,
    title: t.title,
    kind: t.kind,
    priority: t.priority,
    categoryKey: (ctx.catById.get(t.categoryId)?.key ?? "PERSONAL") as CategoryKeyT,
    date: t.date,
    startMinute: t.startMinute,
    durationMin: t.durationMin,
    deadline: t.deadline,
    status: t.status,
    canSkip: t.canSkip,
  };
}

/**
 * Fixed (non-task) busy blocks per date: lectures, work, blocking events and
 * protected personal time (family dinner, commute, prayer…), labelled.
 */
export async function fixedBlocksFor(ctx: UserContext, dates: ISODate[]): Promise<Map<ISODate, Block[]>> {
  if (dates.length === 0) return new Map();
  const [slots, work, events, protectedBlocks] = await Promise.all([
    db.timetableSlot.findMany({ where: { userId: ctx.userId } }),
    db.workBlock.findMany({ where: { userId: ctx.userId } }),
    db.event.findMany({
      where: { userId: ctx.userId, blocksTime: true, date: { lte: dates[dates.length - 1] }, OR: [{ date: { gte: dates[0] } }, { endDate: { gte: dates[0] } }] },
    }),
    db.protectedBlock.findMany({ where: { userId: ctx.userId } }),
  ]);
  const map = new Map<ISODate, Block[]>();
  for (const date of dates) {
    const dow = dayOfWeek(date);
    const blocks: Block[] = [];
    const holiday = events.some((e) => e.type === "HOLIDAY" && e.date <= date && (e.endDate ?? e.date) >= date);
    if (!holiday) {
      for (const s of slots) {
        if (s.dayOfWeek !== dow) continue;
        if (s.validFrom && date < s.validFrom) continue;
        if (s.validTo && date > s.validTo) continue;
        blocks.push({ start: s.startMinute, end: s.endMinute, label: s.title });
      }
    }
    for (const w of work) if (w.dayOfWeek === dow) blocks.push({ start: w.startMinute, end: w.endMinute, label: w.label });
    for (const e of events) {
      if (!(e.date <= date && (e.endDate ?? e.date) >= date)) continue;
      if (e.type === "HOLIDAY") continue;
      if (e.allDay || e.startMinute == null) blocks.push({ start: 0, end: 24 * 60, label: e.title });
      else {
        // Multi-day timed events (e.g. 22:00 Mon -> 09:00 Wed) cover start..midnight, whole middle days, then midnight..end.
        const span = busyIntervalOn({ date: e.date, endDate: e.endDate && e.endDate !== e.date ? e.endDate : null, startMinute: e.startMinute, endMinute: e.endMinute ?? e.startMinute + 60, allDay: false }, date);
        if (span && span.end > span.start) blocks.push({ ...span, label: e.title });
      }
    }
    // Protected personal time applies on holidays too.
    blocks.push(...protectedBlocksForDate(protectedBlocks, date));
    map.set(date, blocks);
  }
  return map;
}

/** Day rhythm rows for the user, loaded once (templates, overrides in range, energy windows). */
async function loadRhythmRows(ctx: UserContext, dates: ISODate[]) {
  const sorted = [...dates].sort();
  const [templates, overrides, windows] = await Promise.all([
    db.dayTemplate.findMany({ where: { userId: ctx.userId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    sorted.length
      ? db.dayOverride.findMany({ where: { userId: ctx.userId, date: { gte: sorted[0], lte: sorted[sorted.length - 1] } } })
      : Promise.resolve([]),
    db.energyWindow.findMany({ where: { userId: ctx.userId } }),
  ]);
  return { templates, overrides: new Map(overrides.map((o) => [o.date, o.templateId])), windows };
}

/** Effective day rhythm (template / override / defaults) for each date — for display. */
export async function dayRhythmsFor(ctx: UserContext, dates: ISODate[]): Promise<Map<ISODate, DayRhythm>> {
  const { templates, overrides } = await loadRhythmRows(ctx, dates);
  const s = ctx.settings;
  return new Map(dates.map((d) => [d, resolveDayRhythm(s, templates, overrides, d)]));
}

/**
 * Build DayContexts for the engine. Tasks whose ids are in `excludeTaskIds`
 * are treated as "to be placed" and therefore not counted as occupying time.
 */
export async function buildDayContexts(
  ctx: UserContext,
  dates: ISODate[],
  opts: { excludeTaskIds?: Set<string> } = {},
): Promise<{ days: DayContext[]; tasksByDate: Map<ISODate, Task[]> }> {
  const s = ctx.settings;
  const [fixed, tasks, history, rhythm] = await Promise.all([
    fixedBlocksFor(ctx, dates),
    db.task.findMany({ where: { userId: ctx.userId, date: { in: dates } } }),
    db.task.findMany({
      where: { userId: ctx.userId, date: { gte: addDays(ctx.today, -42), lt: ctx.today }, startMinute: { not: null }, status: { in: ["COMPLETED", "MISSED", "PENDING", "SKIPPED"] } },
      select: { startMinute: true, status: true, skipApproved: true },
    }),
    loadRhythmRows(ctx, dates),
  ]);
  const learned = s.preferEarlierHours
    ? learnLateHourPattern(history.filter((h) => !(h.status === "SKIPPED" && h.skipApproved)).map((h) => ({ startMinute: h.startMinute!, completed: h.status === "COMPLETED" })))
    : {};

  const recovery = ctx.mode === "RECOVERY";
  const tasksByDate = new Map<ISODate, Task[]>();
  const days: DayContext[] = dates.map((date) => {
    const dayTasks = tasks.filter((t) => t.date === date);
    const r = resolveDayRhythm(s, rhythm.templates, rhythm.overrides, date);
    tasksByDate.set(date, dayTasks);
    const busy = [...(fixed.get(date) ?? [])];
    const placed: Block[] = [];
    let focusUsed = 0;
    let tasksCount = 0;
    for (const t of dayTasks) {
      if (!ACTIVE.includes(t.status as (typeof ACTIVE)[number])) continue;
      if (opts.excludeTaskIds?.has(t.id)) continue;
      if (t.kind === "FIXED") {
        if (t.startMinute != null) busy.push({ start: t.startMinute, end: t.startMinute + t.durationMin, label: t.title });
        continue;
      }
      if (t.startMinute != null) placed.push({ start: t.startMinute, end: t.startMinute + t.durationMin, label: t.title });
      focusUsed += t.durationMin;
      tasksCount += 1;
    }
    return {
      date,
      wake: r.wake,
      sleep: r.sleep,
      busy,
      placed,
      focusUsed,
      tasksCount,
      focusLimit: recovery ? Math.min(r.focusLimit, 120) : r.focusLimit,
      taskLimit: recovery ? Math.min(r.taskLimit, 4) : r.taskLimit,
      softLatestStart: learned.softLatestStart,
      restDay: r.restDay,
      windows: energyWindowsForDate(rhythm.windows, date),
    };
  });
  return { days, tasksByDate };
}

export async function learnedSuggestion(ctx: UserContext): Promise<string | undefined> {
  const history = await db.task.findMany({
    where: { userId: ctx.userId, date: { gte: addDays(ctx.today, -42), lt: ctx.today }, startMinute: { not: null }, status: { in: ["COMPLETED", "MISSED", "PENDING", "SKIPPED"] } },
    select: { startMinute: true, status: true, skipApproved: true },
  });
  return learnLateHourPattern(history.filter((h) => !(h.status === "SKIPPED" && h.skipApproved)).map((h) => ({ startMinute: h.startMinute!, completed: h.status === "COMPLETED" }))).suggestion;
}
