"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { getContext } from "../context";
import { invalidateMaintenance } from "../maintenance";
import { recomputeDailyScore } from "../score";
import { SCORED_CATEGORIES } from "@/lib/domain/constants";
import { firstError, isoDate, minuteOfDay, type ActionResult } from "@/lib/validation";

const revalidateAll = () => revalidatePath("/", "layout");

export async function setMode(mode: "NORMAL" | "EXAM" | "RECOVERY"): Promise<ActionResult> {
  const ctx = await getContext();
  if (!["NORMAL", "EXAM", "RECOVERY"].includes(mode)) return { ok: false, error: "Unknown mode" };
  await db.userSettings.update({ where: { userId: ctx.userId }, data: { mode, modeChangedAt: new Date(), examSuggestionDismissedAt: mode === "NORMAL" ? new Date() : undefined } });
  await invalidateMaintenance(ctx.userId);
  // Today's score is re-weighted for the new mode; past days keep their snapshot.
  await recomputeDailyScore({ ...ctx, mode, weights: (mode === "EXAM" ? ctx.settings.weightsExam : mode === "RECOVERY" ? ctx.settings.weightsRecovery : ctx.settings.weightsNormal) as never }, ctx.today);
  revalidateAll();
  const msg = mode === "EXAM" ? "Examination mode on — academics first." : mode === "RECOVERY" ? "Recovery mode on. Take care of yourself." : "Back to normal mode.";
  return { ok: true, data: undefined, message: msg };
}

export async function dismissExamSuggestion(): Promise<ActionResult> {
  const ctx = await getContext();
  await db.userSettings.update({ where: { userId: ctx.userId }, data: { examSuggestionDismissedAt: new Date() } });
  revalidateAll();
  return { ok: true, data: undefined };
}

const settingsInput = z.object({
  timezone: z.string().min(1).optional(),
  currency: z.string().min(3).max(3).optional(),
  wakeMinute: minuteOfDay.optional(),
  sleepMinute: minuteOfDay.optional(),
  dailyFocusLimitMin: z.number().int().min(30).max(16 * 60).optional(),
  dailyTaskLimit: z.number().int().min(1).max(30).optional(),
  breakMinutes: z.number().int().min(0).max(120).optional(),
  minRestBetweenMin: z.number().int().min(0).max(120).optional(),
  preferEarlierHours: z.boolean().optional(),
  aiDailyMin: z.number().int().min(0).max(600).optional(),
  aiWeeklyMin: z.number().int().min(0).max(4200).optional(),
  aiMonthlyMin: z.number().int().min(0).max(18000).optional(),
  gymDays: z.array(z.number().int().min(0).max(6)).optional(),
  gymPreferredStart: minuteOfDay.nullable().optional(),
  gymDurationMin: z.number().int().min(10).max(300).optional(),
  sleepTargetHours: z.number().min(4).max(12).optional(),
  waterTargetMl: z.number().int().min(0).max(10000).optional(),
  emergencyFundTarget: z.number().min(0).nullable().optional(),
  monthlySavingsTarget: z.number().min(0).nullable().optional(),
  planningStart: isoDate.optional(),
  planningEnd: isoDate.optional(),
  catTargetDate: isoDate.optional(),
  notificationPrefs: z.record(z.string(), z.boolean()).optional(),
  theme: z.enum(["dark", "light", "system"]).optional(),
});

export async function updateSettings(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const parsed = settingsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;
  const wake = v.wakeMinute ?? ctx.settings.wakeMinute;
  const sleep = v.sleepMinute ?? ctx.settings.sleepMinute;
  if (sleep - wake < 8 * 60) return { ok: false, error: "Keep at least 8 hours between wake-up and sleep for scheduling (the rest is protected sleep)." };
  if (sleep - wake > 20 * 60) return { ok: false, error: "That leaves less than 4 hours of sleep — please adjust." };

  // Keep AI weekly target in sync with the learning target.
  if (v.aiWeeklyMin != null) {
    await db.weeklyTarget.updateMany({ where: { userId: ctx.userId, key: "ai-learning" }, data: { normalTarget: v.aiWeeklyMin } });
  }
  if (v.gymDays) {
    await db.weeklyTarget.updateMany({ where: { userId: ctx.userId, key: "gym" }, data: { normalTarget: v.gymDays.length } });
  }
  await db.userSettings.update({ where: { userId: ctx.userId }, data: { ...v, notificationPrefs: v.notificationPrefs ? { ...(ctx.settings.notificationPrefs as object), ...v.notificationPrefs } : undefined } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Settings saved" };
}

const weightsInput = z.object({
  mode: z.enum(["NORMAL", "EXAM", "RECOVERY"]),
  weights: z.record(z.string(), z.number().int().min(0).max(100)),
});

/** Category weights. Future days only — past DailyScores keep their snapshot. */
export async function updateWeights(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const parsed = weightsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { mode, weights } = parsed.data;
  const clean = Object.fromEntries(SCORED_CATEGORIES.map((k) => [k, weights[k] ?? 0]));
  const total = Object.values(clean).reduce((s, n) => s + n, 0);
  if (total !== 100) return { ok: false, error: `Weights must add up to 100 (currently ${total}).` };
  const field = mode === "EXAM" ? "weightsExam" : mode === "RECOVERY" ? "weightsRecovery" : "weightsNormal";
  await db.userSettings.update({ where: { userId: ctx.userId }, data: { [field]: clean } });
  if (mode === ctx.mode) await recomputeDailyScore({ ...ctx, weights: clean }, ctx.today);
  revalidateAll();
  return { ok: true, data: undefined, message: "Weights saved — applies from today onwards." };
}

const profileInput = z.object({
  displayName: z.string().trim().min(1).max(60),
  location: z.string().trim().max(120).optional(),
  education: z.string().trim().max(120).optional(),
  college: z.string().trim().max(160).optional(),
  graduationTarget: z.string().trim().max(20).optional(),
  currentRole: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
  currentFocus: z.string().trim().max(300).optional(),
  mbaObjective: z.string().trim().max(300).optional(),
  mbaAdmissionTarget: z.string().trim().max(20).optional(),
  creativeAmbition: z.string().trim().max(300).optional(),
  creativeObjective: z.string().trim().max(300).optional(),
  sideProject: z.string().trim().max(300).optional(),
  image: z.string().trim().url().max(2000).optional().or(z.literal("")),
});

export async function updateProfile(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const parsed = profileInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { image, ...profile } = parsed.data;
  await db.profile.upsert({ where: { userId: ctx.userId }, update: profile, create: { userId: ctx.userId, ...profile } });
  await db.user.update({ where: { id: ctx.userId }, data: { name: profile.displayName, image: image === "" ? null : image } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Profile saved" };
}

const targetInput = z.object({
  id: z.string(),
  label: z.string().trim().min(1).max(80),
  normalTarget: z.number().int().min(0).max(10000),
  examTarget: z.number().int().min(0).max(10000),
  recoveryTarget: z.number().int().min(0).max(10000),
  blockMin: z.number().int().min(10).max(300),
  preferredStart: minuteOfDay.nullable(),
  autoPlan: z.boolean(),
  active: z.boolean(),
});

export async function updateWeeklyTarget(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const parsed = targetInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { id, ...data } = parsed.data;
  const res = await db.weeklyTarget.updateMany({ where: { id, userId: ctx.userId }, data });
  if (res.count === 0) return { ok: false, error: "Target not found" };
  if (parsed.data.label && id) {
    const t = await db.weeklyTarget.findUnique({ where: { id } });
    if (t?.key === "ai-learning") await db.userSettings.update({ where: { userId: ctx.userId }, data: { aiWeeklyMin: data.normalTarget } });
  }
  revalidateAll();
  return { ok: true, data: undefined, message: "Target saved" };
}

const newTargetInput = z.object({
  label: z.string().trim().min(1).max(80),
  categoryId: z.string(),
  unit: z.enum(["MINUTES", "SESSIONS"]),
  normalTarget: z.number().int().min(1).max(10000),
  blockMin: z.number().int().min(10).max(300),
});

export async function createWeeklyTarget(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const parsed = newTargetInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;
  if (!ctx.catById.has(v.categoryId)) return { ok: false, error: "Unknown category" };
  const key = `custom-${v.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}-${Date.now().toString(36)}`;
  await db.weeklyTarget.create({
    data: { userId: ctx.userId, key, label: v.label, categoryId: v.categoryId, unit: v.unit, normalTarget: v.normalTarget, examTarget: Math.round(v.normalTarget / 2), recoveryTarget: 0, blockMin: v.blockMin, sortOrder: 100 },
  });
  revalidateAll();
  return { ok: true, data: undefined, message: "Target added" };
}

export async function completeOnboarding(): Promise<ActionResult> {
  const ctx = await getContext();
  await db.userSettings.update({ where: { userId: ctx.userId }, data: { onboardedAt: new Date() } });
  revalidateAll();
  return { ok: true, data: undefined };
}

/** Export the user's data as JSON (for backups / downloadable reports). */
export async function exportData(): Promise<ActionResult<string>> {
  const ctx = await getContext();
  const uid = ctx.userId;
  const [tasks, events, goals, learning, gym, health, jobs, mba, creative, money, reviews, scores] = await Promise.all([
    db.task.findMany({ where: { userId: uid } }),
    db.event.findMany({ where: { userId: uid } }),
    db.goal.findMany({ where: { userId: uid }, include: { milestones: true } }),
    db.learningSession.findMany({ where: { userId: uid } }),
    db.gymSession.findMany({ where: { userId: uid } }),
    db.healthLog.findMany({ where: { userId: uid } }),
    db.jobApplication.findMany({ where: { userId: uid } }),
    db.mBAActivity.findMany({ where: { userId: uid } }),
    db.creativeSession.findMany({ where: { userId: uid } }),
    db.financialTransaction.findMany({ where: { userId: uid } }),
    db.weeklyReview.findMany({ where: { userId: uid } }),
    db.dailyScore.findMany({ where: { userId: uid } }),
  ]);
  return { ok: true, data: JSON.stringify({ exportedAt: new Date().toISOString(), tasks, events, goals, learning, gym, health, jobs, mba, creative, money, reviews, scores }, null, 2) };
}
