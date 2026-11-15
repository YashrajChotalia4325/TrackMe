"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getContext } from "../context";
import { CATEGORY_KEYS } from "@/lib/domain/constants";
import { awakeWindowError, findWeekdayClash } from "@/lib/domain/rhythm";
import { addDays, DAY_LABELS_LONG, formatDate } from "@/lib/time";
import { firstError, isoDate, minuteOfDay, type ActionResult } from "@/lib/validation";

const PATHS = ["/settings", "/my-day", "/planner", "/calendar", "/dashboard"];

function done<T = undefined>(message: string, data?: T): ActionResult<T> {
  for (const p of PATHS) revalidatePath(p);
  return { ok: true, data: data as T, message };
}

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

/** Wrap DB work so raw errors never reach the client. */
async function safely<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // let auth redirects through
    console.error("[rhythm action]", e instanceof Error ? e.message : "unknown error");
    return { ok: false, error: "Something went wrong saving your day rhythm. Please try again." };
  }
}

const weekdays = z.array(z.number().int().min(0).max(6)).max(7).transform((d) => [...new Set(d)].sort());
const id = z.string().min(1).max(100);
const MAX_TEMPLATES = 12;
const MAX_ITEMS = 40;

// ───────────────────────────── Day templates ─────────────────────────────

const templateInput = z.object({
  name: z.string().trim().min(1, "Give the template a name").max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour").default("#FACC15"),
  daysOfWeek: weekdays,
  wakeMinute: minuteOfDay,
  sleepMinute: minuteOfDay,
  focusLimitMin: z.number().int().min(30, "Focus limit must be at least 30 minutes").max(16 * 60),
  taskLimit: z.number().int().min(1, "Allow at least 1 task").max(30),
  restDay: z.boolean().default(false),
});

async function checkTemplate(userId: string, v: z.infer<typeof templateInput>, excludeId?: string): Promise<string | null> {
  const awake = awakeWindowError(v.wakeMinute, v.sleepMinute);
  if (awake) return awake;
  const others = await db.dayTemplate.findMany({ where: { userId }, select: { id: true, name: true, daysOfWeek: true } });
  if (others.some((t) => t.id !== excludeId && t.name.toLowerCase() === v.name.toLowerCase())) return `You already have a template called “${v.name}”.`;
  const clash = findWeekdayClash(others, v.daysOfWeek, excludeId);
  if (clash) return `${DAY_LABELS_LONG[clash.day]} already uses “${clash.templateName}”. A weekday can belong to only one template — remove it there first, or pick other days.`;
  return null;
}

export async function createDayTemplate(raw: unknown): Promise<ActionResult> {
  return safely(async () => {
    const ctx = await getContext();
    const p = templateInput.safeParse(raw);
    if (!p.success) return fail(firstError(p.error));
    const count = await db.dayTemplate.count({ where: { userId: ctx.userId } });
    if (count >= MAX_TEMPLATES) return fail(`You can have up to ${MAX_TEMPLATES} day templates.`);
    const err = await checkTemplate(ctx.userId, p.data);
    if (err) return fail(err);
    const last = await db.dayTemplate.findFirst({ where: { userId: ctx.userId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    await db.dayTemplate.create({ data: { userId: ctx.userId, ...p.data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    return done(`“${p.data.name}” created`);
  });
}

export async function updateDayTemplate(templateId: string, raw: unknown): Promise<ActionResult> {
  return safely(async () => {
    const ctx = await getContext();
    const pid = id.safeParse(templateId);
    const p = templateInput.safeParse(raw);
    if (!pid.success) return fail("Template not found");
    if (!p.success) return fail(firstError(p.error));
    const existing = await db.dayTemplate.findFirst({ where: { id: pid.data, userId: ctx.userId }, select: { id: true } });
    if (!existing) return fail("Template not found");
    const err = await checkTemplate(ctx.userId, p.data, pid.data);
    if (err) return fail(err);
    await db.dayTemplate.updateMany({ where: { id: pid.data, userId: ctx.userId }, data: p.data });
    return done(`“${p.data.name}” saved`);
  });
}

/** Deletes a template. Date overrides that use it are removed with it (the UI says so first). */
export async function deleteDayTemplate(templateId: string): Promise<ActionResult> {
  return safely(async () => {
    const ctx = await getContext();
    const pid = id.safeParse(templateId);
    if (!pid.success) return fail("Template not found");
    const t = await db.dayTemplate.findFirst({ where: { id: pid.data, userId: ctx.userId }, select: { id: true, name: true } });
    if (!t) return fail("Template not found");
    await db.$transaction([
      db.dayOverride.deleteMany({ where: { userId: ctx.userId, templateId: t.id } }),
      db.dayTemplate.deleteMany({ where: { id: t.id, userId: ctx.userId } }),
    ]);
    return done(`“${t.name}” deleted — those days use your default schedule now`);
  });
}

/**
 * Creates "College day" (Mon–Fri) and "Weekend" (Sat–Sun) from your CURRENT
 * schedule settings — never invented times. Only when you have no templates.
 */
export async function createSuggestedTemplates(): Promise<ActionResult> {
  return safely(async () => {
    const ctx = await getContext();
    const count = await db.dayTemplate.count({ where: { userId: ctx.userId } });
    if (count > 0) return fail("You already have day templates — suggestions are only added to an empty list.");
    const s = ctx.settings;
    const base = { userId: ctx.userId, wakeMinute: s.wakeMinute, sleepMinute: s.sleepMinute, focusLimitMin: s.dailyFocusLimitMin, taskLimit: s.dailyTaskLimit, restDay: false };
    await db.dayTemplate.createMany({
      data: [
        { ...base, name: "College day", color: "#60A5FA", daysOfWeek: [1, 2, 3, 4, 5], sortOrder: 0 },
        { ...base, name: "Weekend", color: "#2DD4BF", daysOfWeek: [0, 6], sortOrder: 1 },
      ],
    });
    return done("Added “College day” and “Weekend” with your current times — adjust them anytime");
  });
}

// ───────────────────────────── Date overrides ─────────────────────────────

const overrideInput = z.object({
  date: isoDate,
  /** null clears the override (the weekday template / defaults apply again). */
  templateId: id.nullable(),
});

export async function setDayOverride(raw: unknown): Promise<ActionResult> {
  return safely(async () => {
    const ctx = await getContext();
    const p = overrideInput.safeParse(raw);
    if (!p.success) return fail(firstError(p.error));
    const { date, templateId } = p.data;
    if (templateId == null) {
      await db.dayOverride.deleteMany({ where: { userId: ctx.userId, date } });
      return done(`${formatDate(date, "weekday")} is back to its usual rhythm`);
    }
    if (date < ctx.today) return fail("Pick today or a future date.");
    if (date > addDays(ctx.today, 366)) return fail("Pick a date within the next year.");
    const t = await db.dayTemplate.findFirst({ where: { id: templateId, userId: ctx.userId }, select: { id: true, name: true } });
    if (!t) return fail("Template not found");
    await db.dayOverride.upsert({
      where: { userId_date: { userId: ctx.userId, date } },
      update: { templateId: t.id },
      create: { userId: ctx.userId, date, templateId: t.id },
    });
    return done(`${formatDate(date, "weekday")} will use “${t.name}”`);
  });
}

export async function clearDayOverride(date: string): Promise<ActionResult> {
  return setDayOverride({ date, templateId: null });
}

// ───────────────────────────── Protected time ─────────────────────────────

const protectedInput = z
  .object({
    label: z.string().trim().min(1, "Add a label, e.g. Family dinner").max(60),
    daysOfWeek: weekdays.refine((d) => d.length > 0, "Choose at least one day"),
    startMinute: minuteOfDay,
    endMinute: minuteOfDay,
  })
  .refine((v) => v.startMinute < v.endMinute, { message: "End time must be after the start time", path: ["endMinute"] });

const RESCHEDULE_HINT = "Existing tasks stay put — use Reschedule My Day if anything now overlaps.";

export async function createProtectedBlock(raw: unknown): Promise<ActionResult> {
  return safely(async () => {
    const ctx = await getContext();
    const p = protectedInput.safeParse(raw);
    if (!p.success) return fail(firstError(p.error));
    const count = await db.protectedBlock.count({ where: { userId: ctx.userId } });
    if (count >= MAX_ITEMS) return fail(`You can have up to ${MAX_ITEMS} protected blocks.`);
    await db.protectedBlock.create({ data: { userId: ctx.userId, ...p.data } });
    return done(`“${p.data.label}” is protected. ${RESCHEDULE_HINT}`);
  });
}

export async function updateProtectedBlock(blockId: string, raw: unknown): Promise<ActionResult> {
  return safely(async () => {
    const ctx = await getContext();
    const pid = id.safeParse(blockId);
    const p = protectedInput.safeParse(raw);
    if (!pid.success) return fail("Protected block not found");
    if (!p.success) return fail(firstError(p.error));
    const res = await db.protectedBlock.updateMany({ where: { id: pid.data, userId: ctx.userId }, data: p.data });
    if (res.count === 0) return fail("Protected block not found");
    return done(`“${p.data.label}” saved`);
  });
}

export async function deleteProtectedBlock(blockId: string): Promise<ActionResult> {
  return safely(async () => {
    const ctx = await getContext();
    const pid = id.safeParse(blockId);
    if (!pid.success) return fail("Protected block not found");
    const res = await db.protectedBlock.deleteMany({ where: { id: pid.data, userId: ctx.userId } });
    if (res.count === 0) return fail("Protected block not found");
    return done("Protected block removed");
  });
}

// ───────────────────────────── Energy windows ─────────────────────────────

const energyInput = z
  .object({
    kind: z.enum(["PREFER", "AVOID"]),
    categoryKey: z.enum(CATEGORY_KEYS).nullable(),
    daysOfWeek: weekdays.refine((d) => d.length > 0, "Choose at least one day"),
    startMinute: minuteOfDay,
    endMinute: minuteOfDay,
    label: z
      .string()
      .trim()
      .max(60)
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
  })
  .refine((v) => v.startMinute < v.endMinute, { message: "End time must be after the start time", path: ["endMinute"] });

export async function createEnergyWindow(raw: unknown): Promise<ActionResult> {
  return safely(async () => {
    const ctx = await getContext();
    const p = energyInput.safeParse(raw);
    if (!p.success) return fail(firstError(p.error));
    const count = await db.energyWindow.count({ where: { userId: ctx.userId } });
    if (count >= MAX_ITEMS) return fail(`You can have up to ${MAX_ITEMS} energy windows.`);
    await db.energyWindow.create({ data: { userId: ctx.userId, ...p.data } });
    return done("Energy window added — new plans will follow it");
  });
}

export async function updateEnergyWindow(windowId: string, raw: unknown): Promise<ActionResult> {
  return safely(async () => {
    const ctx = await getContext();
    const pid = id.safeParse(windowId);
    const p = energyInput.safeParse(raw);
    if (!pid.success) return fail("Energy window not found");
    if (!p.success) return fail(firstError(p.error));
    const res = await db.energyWindow.updateMany({ where: { id: pid.data, userId: ctx.userId }, data: p.data });
    if (res.count === 0) return fail("Energy window not found");
    return done("Energy window saved");
  });
}

export async function deleteEnergyWindow(windowId: string): Promise<ActionResult> {
  return safely(async () => {
    const ctx = await getContext();
    const pid = id.safeParse(windowId);
    if (!pid.success) return fail("Energy window not found");
    const res = await db.energyWindow.deleteMany({ where: { id: pid.data, userId: ctx.userId } });
    if (res.count === 0) return fail("Energy window not found");
    return done("Energy window removed");
  });
}
