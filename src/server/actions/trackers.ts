"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { getContext } from "../context";
import { checkAchievements } from "../maintenance";
import { recomputeDailyScore } from "../score";
import { firstError, isoDate, optionalText, type ActionResult } from "@/lib/validation";
import { JOB_STATUSES } from "@/lib/domain/constants";

function done(paths: string[], message: string): ActionResult {
  for (const p of [...paths, "/dashboard", "/analytics", "/planner"]) revalidatePath(p);
  return { ok: true, data: undefined, message };
}

async function guardDate(date: string) {
  const ctx = await getContext();
  return date > ctx.today ? "You can't log something in the future." : null;
}

// ── Fitness ──

const gymInput = z.object({
  date: isoDate,
  type: z.enum(["STRENGTH", "CARDIO", "WALK", "SPORT", "MOBILITY", "OTHER"]),
  durationMin: z.number().int().min(1).max(600),
  focus: optionalText,
  exercises: optionalText,
  notes: optionalText,
});

export async function logGym(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = gymInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const future = await guardDate(p.data.date);
  if (future) return { ok: false, error: future };
  await db.gymSession.create({ data: { userId: ctx.userId, ...p.data } });
  if (p.data.type === "WALK") {
    await db.healthLog.upsert({ where: { userId_date: { userId: ctx.userId, date: p.data.date } }, update: { walked: true }, create: { userId: ctx.userId, date: p.data.date, walked: true } });
  }
  // Complete today's matching gym task if there is one (user logged the session).
  const gymTarget = await db.weeklyTarget.findFirst({ where: { userId: ctx.userId, key: p.data.type === "CARDIO" ? "cardio" : "gym" } });
  if (gymTarget) {
    const task = await db.task.findFirst({ where: { userId: ctx.userId, date: p.data.date, weeklyTargetId: gymTarget.id, status: { in: ["PENDING", "IN_PROGRESS", "MISSED"] } } });
    if (task) {
      await db.task.update({ where: { id: task.id }, data: { status: "COMPLETED", completionPct: 100, actualMin: p.data.durationMin, completedAt: new Date() } });
      await db.taskCompletion.create({ data: { taskId: task.id, userId: ctx.userId, status: "COMPLETED", completionPct: 100, actualMin: p.data.durationMin, date: task.date, note: "Logged gym session" } });
      await recomputeDailyScore(ctx, task.date);
    }
  }
  await checkAchievements(ctx);
  return done(["/fitness", "/my-day"], "Workout logged");
}

export async function deleteGym(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.gymSession.deleteMany({ where: { id, userId: ctx.userId } });
  return done(["/fitness"], "Workout deleted");
}

const healthInput = z.object({
  date: isoDate,
  weightKg: z.number().min(20).max(300).nullable().optional(),
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  waterMl: z.number().int().min(0).max(15000).nullable().optional(),
  steps: z.number().int().min(0).max(200000).nullable().optional(),
  walked: z.boolean().optional(),
  notes: optionalText,
});

export async function logHealth(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = healthInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const future = await guardDate(p.data.date);
  if (future) return { ok: false, error: future };
  const { date, ...rest } = p.data;
  await db.healthLog.upsert({ where: { userId_date: { userId: ctx.userId, date } }, update: rest, create: { userId: ctx.userId, date, ...rest } });
  return done(["/fitness"], "Health log saved");
}

// ── Career ──

const jobInput = z.object({
  company: z.string().trim().min(1, "Company is required").max(120),
  role: z.string().trim().min(1, "Role is required").max(120),
  status: z.enum(JOB_STATUSES),
  appliedOn: isoDate.nullable().optional(),
  salary: optionalText,
  location: optionalText,
  url: z.string().trim().url("Enter a valid URL").max(500).optional().or(z.literal("").transform(() => undefined)),
  source: optionalText,
  nextStep: optionalText,
  notes: optionalText,
});

export async function upsertJob(id: string | null, raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = jobInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const data = { ...p.data, appliedOn: p.data.appliedOn ?? (p.data.status === "APPLIED" ? ctx.today : null) };
  if (id) {
    const r = await db.jobApplication.updateMany({ where: { id, userId: ctx.userId }, data });
    if (r.count === 0) return { ok: false, error: "Application not found" };
  } else {
    await db.jobApplication.create({ data: { userId: ctx.userId, ...data } });
  }
  await checkAchievements(ctx);
  return done(["/career"], "Application saved");
}

export async function setJobStatus(id: string, status: (typeof JOB_STATUSES)[number]): Promise<ActionResult> {
  const ctx = await getContext();
  if (!JOB_STATUSES.includes(status)) return { ok: false, error: "Unknown status" };
  const job = await db.jobApplication.findFirst({ where: { id, userId: ctx.userId } });
  if (!job) return { ok: false, error: "Application not found" };
  await db.jobApplication.update({ where: { id }, data: { status, appliedOn: job.appliedOn ?? (status === "APPLIED" ? ctx.today : null) } });
  return done(["/career"], "Status updated");
}

export async function deleteJob(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.jobApplication.deleteMany({ where: { id, userId: ctx.userId } });
  return done(["/career"], "Application deleted");
}

const achievementInput = z.object({ date: isoDate, title: z.string().trim().min(1).max(200), kind: z.string().max(30).default("INTERNSHIP"), impact: optionalText, notes: optionalText });

export async function addProAchievement(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = achievementInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  await db.professionalAchievement.create({ data: { userId: ctx.userId, ...p.data } });
  await checkAchievements(ctx);
  return done(["/career"], "Achievement recorded");
}

export async function deleteProAchievement(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.professionalAchievement.deleteMany({ where: { id, userId: ctx.userId } });
  return done(["/career"], "Achievement deleted");
}

const networkInput = z.object({ date: isoDate, person: z.string().trim().min(1).max(120), company: optionalText, channel: optionalText, notes: optionalText, followUp: optionalText });

export async function addNetworking(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = networkInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  await db.networkingLog.create({ data: { userId: ctx.userId, ...p.data } });
  return done(["/career"], "Contact logged");
}

export async function deleteNetworking(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.networkingLog.deleteMany({ where: { id, userId: ctx.userId } });
  return done(["/career"], "Entry deleted");
}

// ── MBA ──

const mbaInput = z.object({
  date: isoDate,
  section: z.enum(["PROFILE", "CAT", "ENTRANCE", "RESEARCH", "INTERVIEW"]),
  type: z.enum(["BUSINESS_READING", "GENERAL_AWARENESS", "COMMUNICATION", "LEADERSHIP", "ACHIEVEMENT_DOC", "CAT_PRACTICE", "EXAM_RESEARCH", "SCHOOL_RESEARCH", "INTERVIEW_PREP", "OTHER"]),
  title: z.string().trim().min(1).max(200),
  durationMin: z.number().int().min(0).max(600),
  notes: optionalText,
});

export async function logMba(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = mbaInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const future = await guardDate(p.data.date);
  if (future) return { ok: false, error: future };
  await db.mBAActivity.create({ data: { userId: ctx.userId, ...p.data } });
  return done(["/mba"], "Activity logged");
}

export async function deleteMba(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.mBAActivity.deleteMany({ where: { id, userId: ctx.userId } });
  return done(["/mba"], "Activity deleted");
}

// ── Creativity ──

const projectInput = z.object({ title: z.string().trim().min(1).max(200), logline: optionalText, synopsis: optionalText, status: z.enum(["ACTIVE", "PAUSED", "DONE"]).default("ACTIVE"), wordGoal: z.number().int().min(0).max(1_000_000).nullable().optional() });

export async function upsertProject(id: string | null, raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = projectInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  if (id) await db.creativeProject.updateMany({ where: { id, userId: ctx.userId }, data: p.data });
  else await db.creativeProject.create({ data: { userId: ctx.userId, ...p.data } });
  return done(["/creativity"], "Project saved");
}

const noteInput = z.object({ projectId: z.string(), kind: z.enum(["CHARACTER", "PLOT", "SCENE", "IDEA", "NOTE"]), title: z.string().trim().min(1).max(200), body: optionalText });

export async function upsertCreativeNote(id: string | null, raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = noteInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const project = await db.creativeProject.findFirst({ where: { id: p.data.projectId, userId: ctx.userId } });
  if (!project) return { ok: false, error: "Project not found" };
  if (id) await db.creativeNote.updateMany({ where: { id, projectId: project.id }, data: { kind: p.data.kind, title: p.data.title, body: p.data.body ?? null } });
  else await db.creativeNote.create({ data: p.data });
  return done(["/creativity"], "Saved");
}

export async function deleteCreativeNote(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.creativeNote.deleteMany({ where: { id, project: { userId: ctx.userId } } });
  return done(["/creativity"], "Deleted");
}

export async function toggleCreativeMilestone(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  const m = await db.creativeMilestone.findFirst({ where: { id, project: { userId: ctx.userId } } });
  if (!m) return { ok: false, error: "Milestone not found" };
  await db.creativeMilestone.update({ where: { id }, data: { doneAt: m.doneAt ? null : new Date() } });
  return done(["/creativity"], m.doneAt ? "Marked as not done" : "Milestone complete");
}

export async function addCreativeMilestone(projectId: string, title: string): Promise<ActionResult> {
  const ctx = await getContext();
  const project = await db.creativeProject.findFirst({ where: { id: projectId, userId: ctx.userId }, include: { milestones: true } });
  if (!project) return { ok: false, error: "Project not found" };
  if (!title.trim()) return { ok: false, error: "Title is required" };
  await db.creativeMilestone.create({ data: { projectId, title: title.trim().slice(0, 200), order: project.milestones.length } });
  return done(["/creativity"], "Milestone added");
}

const creativeSessionInput = z.object({ projectId: z.string().nullable().optional(), date: isoDate, durationMin: z.number().int().min(1).max(720), wordCount: z.number().int().min(0).max(100000).default(0), notes: optionalText });

export async function logCreativeSession(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = creativeSessionInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const future = await guardDate(p.data.date);
  if (future) return { ok: false, error: future };
  await db.creativeSession.create({ data: { userId: ctx.userId, ...p.data, projectId: p.data.projectId ?? null } });
  await checkAchievements(ctx);
  return done(["/creativity"], "Writing session logged");
}

export async function deleteCreativeSession(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.creativeSession.deleteMany({ where: { id, userId: ctx.userId } });
  return done(["/creativity"], "Session deleted");
}

// ── Finance ──

const txInput = z.object({
  date: isoDate,
  type: z.enum(["INCOME", "EXPENSE", "SAVING", "INVESTMENT"]),
  category: z.string().trim().min(1).max(60),
  amount: z.number().positive("Amount must be greater than zero").max(1e10),
  note: optionalText,
});

export async function addTransaction(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = txInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  await db.financialTransaction.create({ data: { userId: ctx.userId, ...p.data } });
  return done(["/finance"], "Transaction added");
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.financialTransaction.deleteMany({ where: { id, userId: ctx.userId } });
  return done(["/finance"], "Transaction deleted");
}

// ── Personal ──

const journalInput = z.object({ date: isoDate, mood: z.number().int().min(1).max(5).nullable().optional(), body: z.string().trim().min(1, "Write something first").max(20000), tags: z.array(z.string().trim().max(30)).max(10).default([]) });

export async function addJournal(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = journalInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  await db.journalEntry.create({ data: { userId: ctx.userId, ...p.data } });
  return done(["/personal"], "Journal entry saved");
}

export async function deleteJournal(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.journalEntry.deleteMany({ where: { id, userId: ctx.userId } });
  return done(["/personal"], "Entry deleted");
}

const readingInput = z.object({ title: z.string().trim().min(1).max(200), author: optionalText, kind: z.string().max(20).default("BOOK"), status: z.enum(["TO_READ", "READING", "DONE"]), notes: optionalText });

export async function upsertReading(id: string | null, raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = readingInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const existing = id ? await db.readingItem.findFirst({ where: { id, userId: ctx.userId } }) : null;
  const data = {
    ...p.data,
    startedOn: existing?.startedOn ?? (p.data.status !== "TO_READ" ? ctx.today : null),
    finishedOn: p.data.status === "DONE" ? (existing?.finishedOn ?? ctx.today) : null,
  };
  if (existing) await db.readingItem.update({ where: { id: existing.id }, data });
  else await db.readingItem.create({ data: { userId: ctx.userId, ...data } });
  return done(["/personal"], "Reading list updated");
}

export async function deleteReading(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.readingItem.deleteMany({ where: { id, userId: ctx.userId } });
  return done(["/personal"], "Removed");
}

const sideInput = z.object({ date: isoDate, durationMin: z.number().int().min(1).max(720), notes: optionalText });

export async function logSideProject(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const p = sideInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const future = await guardDate(p.data.date);
  if (future) return { ok: false, error: future };
  await db.sideProjectLog.create({ data: { userId: ctx.userId, ...p.data } });
  return done(["/personal"], "Side-project time logged");
}

export async function deleteSideProject(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.sideProjectLog.deleteMany({ where: { id, userId: ctx.userId } });
  return done(["/personal"], "Entry deleted");
}

// ── Notifications ──

export async function markNotificationRead(id: string | "all"): Promise<ActionResult> {
  const ctx = await getContext();
  await db.notification.updateMany({ where: { userId: ctx.userId, readAt: null, ...(id === "all" ? {} : { id }) }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
