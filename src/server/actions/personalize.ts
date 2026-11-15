"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { getContext } from "../context";
import { firstError, type ActionResult } from "@/lib/validation";
import { DASHBOARD_PANEL_IDS, normalizeLayout, PERSONAL_WHY_MAX, START_PAGES } from "@/lib/domain/dashboard-layout";

function done(message: string, extra: string[] = []): ActionResult {
  for (const p of ["/dashboard", "/settings", ...extra]) revalidatePath(p);
  return { ok: true, data: undefined, message };
}

function failed(e: unknown, what: string): ActionResult {
  // Log only the error kind: database error messages can echo the submitted values.
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : undefined;
  console.error(`[personalize] saving ${what} failed`, e instanceof Error ? e.name : typeof e, code ?? "");
  return { ok: false, error: `Couldn't save ${what}. Please try again.` };
}

const whyInput = z
  .string()
  .max(2000)
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .refine((v) => v.length <= PERSONAL_WHY_MAX, `Keep it to ${PERSONAL_WHY_MAX} characters`);

/** Set the personal "why" shown on the dashboard. An empty string clears it. */
export async function updatePersonalWhy(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = whyInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const personalWhy = p.data || null;
  try {
    await db.userSettings.update({ where: { userId: ctx.userId }, data: { personalWhy } });
  } catch (e) {
    return failed(e, "your why");
  }
  return done(personalWhy ? "Your why is saved" : "Your why was cleared");
}

const layoutInput = z
  .array(z.object({ id: z.enum(DASHBOARD_PANEL_IDS), hidden: z.boolean() }))
  .max(DASHBOARD_PANEL_IDS.length * 2);

/** Save the dashboard panel order and visibility. */
export async function updateDashboardLayout(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = layoutInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "That layout couldn't be read. Try resetting to default." };
  const layout = normalizeLayout(p.data);
  try {
    await db.userSettings.update({ where: { userId: ctx.userId }, data: { dashboardLayout: layout } });
  } catch (e) {
    return failed(e, "the layout");
  }
  return done("Dashboard layout saved");
}

/** Restore the default dashboard layout. */
export async function resetDashboardLayout(): Promise<ActionResult> {
  const ctx = await getContext();
  try {
    await db.userSettings.update({ where: { userId: ctx.userId }, data: { dashboardLayout: normalizeLayout(null) } });
  } catch (e) {
    return failed(e, "the layout");
  }
  return done("Dashboard layout reset");
}

const startPageInput = z.enum(START_PAGES);

/** Choose where TrackMe opens after sign-in. */
export async function updateStartPage(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = startPageInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "Choose Dashboard or My Day" };
  try {
    await db.userSettings.update({ where: { userId: ctx.userId }, data: { startPage: p.data } });
  } catch (e) {
    return failed(e, "the start page");
  }
  return done(p.data === "/my-day" ? "TrackMe will open on My Day" : "TrackMe will open on the Dashboard", ["/"]);
}
