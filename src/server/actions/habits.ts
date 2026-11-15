"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { getContext } from "../context";
import { firstError, isoDate, type ActionResult } from "@/lib/validation";
import { HABIT_BACKFILL_DAYS, HABIT_COLOR_VALUES, HABIT_ICONS, MAX_ACTIVE_HABITS } from "@/lib/domain/habits";
import { addDays } from "@/lib/time";

// getContext() is called outside try/catch so auth redirects still propagate.

function revalidate() {
  for (const p of ["/my-day", "/dashboard", "/personal"]) revalidatePath(p);
}

function ok<T>(data: T, message?: string): ActionResult<T> {
  revalidate();
  return { ok: true, data, message };
}

const id = z.string().trim().min(1, "Habit not found").max(100);

const habitInput = z.object({
  name: z.string().trim().min(1, "Give the habit a name").max(60, "Keep the name under 60 characters"),
  icon: z.enum(HABIT_ICONS, { error: "Choose an icon from the list" }),
  color: z.enum(HABIT_COLOR_VALUES, { error: "Choose a colour from the palette" }),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Pick at least one day")
    .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
});

const toggleInput = z.object({ habitId: id, date: isoDate, done: z.boolean().optional() });

/** Tick or untick a habit for a day. `done` sets an explicit state (idempotent); omitted, it flips. */
export async function toggleHabit(habitId: string, date: string, done?: boolean): Promise<ActionResult<{ done: boolean }>> {
  const ctx = await getContext();
  try {
    const p = toggleInput.safeParse({ habitId, date, done });
    if (!p.success) return { ok: false, error: firstError(p.error) };
    if (p.data.date > ctx.today) return { ok: false, error: "You can't tick a habit for a future day." };
    if (p.data.date < addDays(ctx.today, -HABIT_BACKFILL_DAYS)) return { ok: false, error: "That day is too far back to change." };
    const habit = await db.habit.findFirst({ where: { id: p.data.habitId, userId: ctx.userId }, select: { id: true, active: true } });
    if (!habit) return { ok: false, error: "Habit not found" };
    if (!habit.active) return { ok: false, error: "This habit is archived. Restore it to tick it again." };

    const existing = await db.habitLog.findUnique({ where: { habitId_date: { habitId: habit.id, date: p.data.date } }, select: { id: true } });
    const target = p.data.done ?? !existing;
    if (target) {
      await db.habitLog.upsert({
        where: { habitId_date: { habitId: habit.id, date: p.data.date } },
        update: {},
        create: { habitId: habit.id, userId: ctx.userId, date: p.data.date },
      });
    } else {
      await db.habitLog.deleteMany({ where: { habitId: habit.id, userId: ctx.userId, date: p.data.date } });
    }
    return ok({ done: target });
  } catch (e) {
    console.error("toggleHabit failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't update the habit. Please try again." };
  }
}

export async function createHabit(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await getContext();
  try {
    const p = habitInput.safeParse(raw);
    if (!p.success) return { ok: false, error: firstError(p.error) };
    const activeCount = await db.habit.count({ where: { userId: ctx.userId, active: true } });
    if (activeCount >= MAX_ACTIVE_HABITS) {
      return { ok: false, error: `You already have ${MAX_ACTIVE_HABITS} active habits — archive one before adding another. A few kept well beats many half-kept.` };
    }
    const last = await db.habit.findFirst({ where: { userId: ctx.userId, active: true }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const habit = await db.habit.create({ data: { userId: ctx.userId, ...p.data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    return ok({ id: habit.id }, "Habit added");
  } catch (e) {
    console.error("createHabit failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't add the habit. Please try again." };
  }
}

export async function updateHabit(habitId: string, raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  try {
    const hid = id.safeParse(habitId);
    if (!hid.success) return { ok: false, error: firstError(hid.error) };
    const p = habitInput.safeParse(raw);
    if (!p.success) return { ok: false, error: firstError(p.error) };
    const r = await db.habit.updateMany({ where: { id: hid.data, userId: ctx.userId }, data: p.data });
    if (r.count === 0) return { ok: false, error: "Habit not found" };
    return ok(undefined, "Habit updated");
  } catch (e) {
    console.error("updateHabit failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't update the habit. Please try again." };
  }
}

/** Hide a habit from daily lists; its history is kept. */
export async function archiveHabit(habitId: string): Promise<ActionResult> {
  const ctx = await getContext();
  try {
    const hid = id.safeParse(habitId);
    if (!hid.success) return { ok: false, error: firstError(hid.error) };
    const r = await db.habit.updateMany({ where: { id: hid.data, userId: ctx.userId }, data: { active: false } });
    if (r.count === 0) return { ok: false, error: "Habit not found" };
    return ok(undefined, "Habit archived — its history is kept");
  } catch (e) {
    console.error("archiveHabit failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't archive the habit. Please try again." };
  }
}

/** Bring an archived habit back to the end of the active list. */
export async function restoreHabit(habitId: string): Promise<ActionResult> {
  const ctx = await getContext();
  try {
    const hid = id.safeParse(habitId);
    if (!hid.success) return { ok: false, error: firstError(hid.error) };
    const habit = await db.habit.findFirst({ where: { id: hid.data, userId: ctx.userId }, select: { id: true, active: true } });
    if (!habit) return { ok: false, error: "Habit not found" };
    if (habit.active) return ok(undefined);
    const activeCount = await db.habit.count({ where: { userId: ctx.userId, active: true } });
    if (activeCount >= MAX_ACTIVE_HABITS) return { ok: false, error: `You already have ${MAX_ACTIVE_HABITS} active habits — archive one first.` };
    const last = await db.habit.findFirst({ where: { userId: ctx.userId, active: true }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    await db.habit.update({ where: { id: habit.id }, data: { active: true, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    return ok(undefined, "Habit restored");
  } catch (e) {
    console.error("restoreHabit failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't restore the habit. Please try again." };
  }
}

/** Permanently delete a habit and all of its check-ins. */
export async function deleteHabit(habitId: string): Promise<ActionResult> {
  const ctx = await getContext();
  try {
    const hid = id.safeParse(habitId);
    if (!hid.success) return { ok: false, error: firstError(hid.error) };
    const r = await db.habit.deleteMany({ where: { id: hid.data, userId: ctx.userId } });
    if (r.count === 0) return { ok: false, error: "Habit not found" };
    return ok(undefined, "Habit deleted");
  } catch (e) {
    console.error("deleteHabit failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't delete the habit. Please try again." };
  }
}

const reorderInput = z.object({ habitId: id, direction: z.enum(["up", "down"]) });

/** Move an active habit one place up or down (also normalises sort order). */
export async function reorderHabit(habitId: string, direction: "up" | "down"): Promise<ActionResult> {
  const ctx = await getContext();
  try {
    const p = reorderInput.safeParse({ habitId, direction });
    if (!p.success) return { ok: false, error: firstError(p.error) };
    const habits = await db.habit.findMany({
      where: { userId: ctx.userId, active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const i = habits.findIndex((h) => h.id === p.data.habitId);
    if (i === -1) return { ok: false, error: "Habit not found" };
    const j = p.data.direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= habits.length) return ok(undefined);
    const order = habits.map((h) => h.id);
    [order[i], order[j]] = [order[j], order[i]];
    await db.$transaction(order.map((hid, sortOrder) => db.habit.update({ where: { id: hid }, data: { sortOrder } })));
    return ok(undefined);
  } catch (e) {
    console.error("reorderHabit failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't reorder habits. Please try again." };
  }
}
