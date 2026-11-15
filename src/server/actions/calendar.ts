"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import Papa from "papaparse";
import { db } from "../db";
import { getContext } from "../context";
import { proposeConflictResolution, type StoredProposal } from "./schedule";
import { EVENT_TYPE_META } from "@/lib/domain/constants";
import { firstError, isoDate, minuteOfDay, optionalText, type ActionResult } from "@/lib/validation";
import { hhmmToMinute } from "@/lib/time";

const revalidateAll = () => {
  for (const p of ["/dashboard", "/calendar", "/academics", "/my-day", "/planner", "/career"]) revalidatePath(p);
};

const EVENT_TYPES = Object.keys(EVENT_TYPE_META) as [string, ...string[]];

const eventInput = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    type: z.enum(EVENT_TYPES),
    date: isoDate,
    endDate: isoDate.nullable().optional(),
    startMinute: minuteOfDay.nullable(),
    endMinute: minuteOfDay.nullable(),
    allDay: z.boolean().default(false),
    blocksTime: z.boolean().optional(),
    location: optionalText,
    notes: optionalText,
    subjectId: z.string().nullable().optional(),
    applicationId: z.string().nullable().optional(),
  })
  .refine((v) => v.allDay || (v.startMinute != null && v.endMinute != null && v.endMinute > v.startMinute), {
    message: "Set a start and end time (end after start), or mark it all-day",
    path: ["endMinute"],
  })
  .refine((v) => !v.endDate || v.endDate >= v.date, { message: "End date must be after the start date", path: ["endDate"] });

export async function createEvent(raw: unknown): Promise<ActionResult<{ id: string; conflict: { versionId: string; proposal: StoredProposal } | null }>> {
  const ctx = await getContext();
  const parsed = eventInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;
  const meta = EVENT_TYPE_META[v.type];
  const blocks = v.blocksTime ?? meta.blocks;
  const event = await db.event.create({
    data: {
      userId: ctx.userId,
      title: v.title,
      type: v.type as never,
      date: v.date,
      endDate: v.endDate ?? null,
      startMinute: v.allDay ? null : v.startMinute,
      endMinute: v.allDay ? null : v.endMinute,
      allDay: v.allDay,
      blocksTime: blocks,
      location: v.location,
      notes: v.notes,
      subjectId: v.subjectId ?? null,
      applicationId: v.applicationId ?? null,
      categoryId: ctx.catByKey.get(meta.category)?.id,
    },
  });
  let conflict = null;
  if (blocks && v.date >= ctx.today) {
    const start = v.allDay ? 0 : v.startMinute!;
    const end = v.allDay ? 24 * 60 : v.endMinute!;
    conflict = await proposeConflictResolution(v.date, start, end, v.title);
  }
  revalidateAll();
  return { ok: true, data: { id: event.id, conflict }, message: "Event added" };
}

const SYNCED_EVENT_ERROR = "This event syncs from Google Calendar — edit it there.";

/** Events mirrored from Google Calendar are read-only in TrackMe (the next sync would overwrite local edits). */
async function isGoogleSynced(userId: string, id: string) {
  const ev = await db.event.findFirst({ where: { id, userId }, select: { source: true } });
  return ev?.source === "GOOGLE_CALENDAR";
}

/** Server actions can be called with anything — an undefined id would make updateMany/deleteMany match every event. */
const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 64;

export async function updateEvent(id: string, raw: unknown): Promise<ActionResult> {
  if (!validId(id)) return { ok: false, error: "Event not found" };
  const ctx = await getContext();
  const parsed = eventInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (await isGoogleSynced(ctx.userId, id)) return { ok: false, error: SYNCED_EVENT_ERROR };
  const v = parsed.data;
  const meta = EVENT_TYPE_META[v.type];
  const res = await db.event.updateMany({
    where: { id, userId: ctx.userId, source: { not: "GOOGLE_CALENDAR" } },
    data: {
      title: v.title,
      type: v.type as never,
      date: v.date,
      endDate: v.endDate ?? null,
      startMinute: v.allDay ? null : v.startMinute,
      endMinute: v.allDay ? null : v.endMinute,
      allDay: v.allDay,
      blocksTime: v.blocksTime ?? meta.blocks,
      location: v.location ?? null,
      notes: v.notes ?? null,
      subjectId: v.subjectId ?? null,
    },
  });
  if (res.count === 0) return { ok: false, error: "Event not found" };
  revalidateAll();
  return { ok: true, data: undefined, message: "Event updated" };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  if (!validId(id)) return { ok: false, error: "Event not found" };
  const ctx = await getContext();
  if (await isGoogleSynced(ctx.userId, id)) return { ok: false, error: SYNCED_EVENT_ERROR };
  const res = await db.event.deleteMany({ where: { id, userId: ctx.userId, source: { not: "GOOGLE_CALENDAR" } } });
  if (res.count === 0) return { ok: false, error: "Event not found" };
  revalidateAll();
  return { ok: true, data: undefined, message: "Event deleted" };
}

// ── Timetable ──

const slotInput = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: minuteOfDay,
    endMinute: minuteOfDay,
    title: z.string().trim().min(1, "Subject is required").max(120),
    kind: z.enum(["LECTURE", "PRACTICAL", "TUTORIAL", "OTHER"]).default("LECTURE"),
    location: optionalText,
    notes: optionalText,
    validFrom: isoDate.nullable().optional(),
    validTo: isoDate.nullable().optional(),
  })
  .refine((v) => v.endMinute > v.startMinute, { message: "End time must be after start time", path: ["endMinute"] });

async function subjectIdFor(userId: string, title: string) {
  const existing = await db.universitySubject.findFirst({ where: { userId, name: { equals: title, mode: "insensitive" } } });
  if (existing) return existing.id;
  return (await db.universitySubject.create({ data: { userId, name: title } })).id;
}

export async function createTimetableSlot(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const parsed = slotInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const v = parsed.data;
  const clash = await db.timetableSlot.findFirst({ where: { userId: ctx.userId, dayOfWeek: v.dayOfWeek, startMinute: { lt: v.endMinute }, endMinute: { gt: v.startMinute } } });
  if (clash) return { ok: false, error: `Overlaps with "${clash.title}" on the same day.` };
  await db.timetableSlot.create({ data: { userId: ctx.userId, ...v, subjectId: await subjectIdFor(ctx.userId, v.title) } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Timetable slot added" };
}

export async function deleteTimetableSlot(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.timetableSlot.deleteMany({ where: { id, userId: ctx.userId } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Slot removed" };
}

const DAY_NAMES: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };

/**
 * Import a timetable from CSV. Expected headers (case-insensitive):
 * day, start, end, subject, [location], [type], [notes]
 * Excel users: File → Save As → CSV.
 */
export async function importTimetableCsv(csv: string, replace: boolean): Promise<ActionResult<{ imported: number; errors: string[] }>> {
  const ctx = await getContext();
  if (csv.length > 200_000) return { ok: false, error: "File is too large" };
  const parsed = Papa.parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const errors: string[] = [];
  const rows: z.infer<typeof slotInput>[] = [];
  parsed.data.forEach((r, i) => {
    const line = i + 2;
    const day = DAY_NAMES[(r.day ?? "").trim().toLowerCase()];
    const start = hhmmToMinute(r.start ?? r["start time"] ?? "");
    const end = hhmmToMinute(r.end ?? r["end time"] ?? "");
    const title = (r.subject ?? r.title ?? "").trim();
    const kindRaw = (r.type ?? r.kind ?? "LECTURE").trim().toUpperCase();
    const kind = (["LECTURE", "PRACTICAL", "TUTORIAL", "OTHER"].includes(kindRaw) ? kindRaw : "OTHER") as "LECTURE";
    if (day == null) return void errors.push(`Line ${line}: unknown day "${r.day ?? ""}"`);
    if (start == null || end == null) return void errors.push(`Line ${line}: times must be HH:MM`);
    const res = slotInput.safeParse({ dayOfWeek: day, startMinute: start, endMinute: end, title, kind, location: r.location || undefined, notes: r.notes || undefined });
    if (!res.success) return void errors.push(`Line ${line}: ${firstError(res.error)}`);
    rows.push(res.data);
  });
  if (rows.length === 0) return { ok: false, error: errors[0] ?? "No rows found. Expected columns: day, start, end, subject." };

  await db.$transaction(async (tx) => {
    if (replace) await tx.timetableSlot.deleteMany({ where: { userId: ctx.userId } });
    for (const r of rows) {
      const existing = await tx.universitySubject.findFirst({ where: { userId: ctx.userId, name: { equals: r.title, mode: "insensitive" } } });
      const subjectId = existing?.id ?? (await tx.universitySubject.create({ data: { userId: ctx.userId, name: r.title } })).id;
      await tx.timetableSlot.create({ data: { userId: ctx.userId, ...r, subjectId } });
    }
  });
  revalidateAll();
  return { ok: true, data: { imported: rows.length, errors }, message: `Imported ${rows.length} slot(s)` };
}

// ── Work schedule ──

const workInput = z
  .object({ dayOfWeek: z.number().int().min(0).max(6), startMinute: minuteOfDay, endMinute: minuteOfDay, label: z.string().trim().min(1).max(60), remote: z.boolean().default(false) })
  .refine((v) => v.endMinute > v.startMinute, { message: "End time must be after start time", path: ["endMinute"] });

export async function createWorkBlock(raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const parsed = workInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  await db.workBlock.create({ data: { userId: ctx.userId, ...parsed.data } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Work hours added" };
}

export async function deleteWorkBlock(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.workBlock.deleteMany({ where: { id, userId: ctx.userId } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Work hours removed" };
}

// ── Exam periods & subjects ──

const examPeriodInput = z
  .object({ name: z.string().trim().min(1).max(120), startDate: isoDate, endDate: isoDate, leadDays: z.number().int().min(0).max(60).default(10), notes: optionalText })
  .refine((v) => v.endDate >= v.startDate, { message: "End date must be on or after the start date", path: ["endDate"] });

export async function upsertExamPeriod(id: string | null, raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const parsed = examPeriodInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (id) {
    const res = await db.examPeriod.updateMany({ where: { id, userId: ctx.userId }, data: parsed.data });
    if (res.count === 0) return { ok: false, error: "Exam period not found" };
  } else {
    await db.examPeriod.create({ data: { userId: ctx.userId, ...parsed.data } });
  }
  revalidateAll();
  return { ok: true, data: undefined, message: "Exam period saved" };
}

export async function deleteExamPeriod(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.examPeriod.deleteMany({ where: { id, userId: ctx.userId } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Exam period removed" };
}

const subjectInput = z.object({ name: z.string().trim().min(1).max(120), code: optionalText, semester: optionalText, credits: z.number().int().min(0).max(30).nullable().optional(), notes: optionalText, progress: z.number().int().min(0).max(100).optional() });

export async function upsertSubject(id: string | null, raw: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  const parsed = subjectInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (id) await db.universitySubject.updateMany({ where: { id, userId: ctx.userId }, data: parsed.data });
  else await db.universitySubject.create({ data: { userId: ctx.userId, ...parsed.data } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Subject saved" };
}

export async function deleteSubject(id: string): Promise<ActionResult> {
  const ctx = await getContext();
  await db.universitySubject.deleteMany({ where: { id, userId: ctx.userId } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Subject removed" };
}
