/**
 * Day rhythm — pure helpers (no I/O).
 *
 * A day's rhythm (wake, sleep, focus cap, task cap, rest day) is resolved with
 * this precedence:
 *   1. a date override (DayOverride: "use template X on 25 Nov"),
 *   2. the template whose daysOfWeek contains the weekday (lowest sortOrder wins),
 *   3. the user's settings defaults.
 *
 * Protected blocks (family dinner, commute, prayer) and energy windows are
 * per-weekday and filtered to a date here. Everything is deterministic so the
 * same inputs always produce the same schedule.
 */
import type { Block, EnergyWindowBlock } from "./scheduler";
import type { CategoryKeyT } from "./constants";
import { dayOfWeek, type ISODate } from "../time";

export interface RhythmDefaults {
  wakeMinute: number;
  sleepMinute: number;
  dailyFocusLimitMin: number;
  dailyTaskLimit: number;
}

export interface TemplateLike {
  id: string;
  name: string;
  color?: string | null;
  daysOfWeek: number[];
  wakeMinute: number;
  sleepMinute: number;
  focusLimitMin: number;
  taskLimit: number;
  restDay: boolean;
  sortOrder?: number | null;
}

export interface OverrideLike {
  date: ISODate;
  templateId: string;
}

export interface DayRhythm {
  templateId: string | null;
  templateName: string | null;
  color: string | null;
  /** Where the rhythm came from. */
  source: "override" | "template" | "default";
  wake: number;
  sleep: number;
  focusLimit: number;
  taskLimit: number;
  restDay: boolean;
}

export interface ProtectedBlockLike {
  label: string;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
}

export interface EnergyWindowLike {
  categoryKey: CategoryKeyT | null;
  kind: string;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  label?: string | null;
}

type OverridesInput = Map<ISODate, string> | Record<ISODate, string> | OverrideLike[];

function overrideFor(overrides: OverridesInput, date: ISODate): string | undefined {
  if (overrides instanceof Map) return overrides.get(date);
  if (Array.isArray(overrides)) return overrides.find((o) => o.date === date)?.templateId;
  return overrides[date];
}

/** Templates ordered by sortOrder (then name) so ties resolve deterministically. */
export function sortTemplates<T extends TemplateLike>(templates: T[]): T[] {
  return [...templates].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function fromTemplate(t: TemplateLike, source: "override" | "template"): DayRhythm {
  return {
    templateId: t.id,
    templateName: t.name,
    color: t.color ?? null,
    source,
    wake: t.wakeMinute,
    sleep: t.sleepMinute,
    focusLimit: t.focusLimitMin,
    taskLimit: t.taskLimit,
    restDay: t.restDay,
  };
}

/** Effective rhythm for one date. */
export function resolveDayRhythm(defaults: RhythmDefaults, templates: TemplateLike[], overrides: OverridesInput, date: ISODate): DayRhythm {
  const overrideId = overrideFor(overrides, date);
  if (overrideId) {
    const t = templates.find((x) => x.id === overrideId);
    if (t) return fromTemplate(t, "override");
  }
  const dow = dayOfWeek(date);
  const byDay = sortTemplates(templates).find((t) => t.daysOfWeek.includes(dow));
  if (byDay) return fromTemplate(byDay, "template");
  return {
    templateId: null,
    templateName: null,
    color: null,
    source: "default",
    wake: defaults.wakeMinute,
    sleep: defaults.sleepMinute,
    focusLimit: defaults.dailyFocusLimitMin,
    taskLimit: defaults.dailyTaskLimit,
    restDay: false,
  };
}

/** Protected personal blocks that apply on `date` (as busy blocks with their label). */
export function protectedBlocksForDate(blocks: ProtectedBlockLike[], date: ISODate): Block[] {
  const dow = dayOfWeek(date);
  return blocks
    .filter((b) => b.daysOfWeek.includes(dow) && b.endMinute > b.startMinute)
    .map((b) => ({ start: b.startMinute, end: b.endMinute, label: b.label }));
}

/** Energy windows that apply on `date`. Unknown kinds are ignored. */
export function energyWindowsForDate(windows: EnergyWindowLike[], date: ISODate): EnergyWindowBlock[] {
  const dow = dayOfWeek(date);
  const out: EnergyWindowBlock[] = [];
  for (const w of windows) {
    if (!w.daysOfWeek.includes(dow) || w.endMinute <= w.startMinute) continue;
    if (w.kind !== "PREFER" && w.kind !== "AVOID") continue;
    out.push({ categoryKey: w.categoryKey ?? null, kind: w.kind, start: w.startMinute, end: w.endMinute, label: w.label ?? undefined });
  }
  return out;
}

// ───────────── Validation helpers (shared by actions and UI) ─────────────

export const MIN_AWAKE_MIN = 8 * 60;
export const MAX_AWAKE_MIN = 20 * 60;

/** Same rule as Settings → Schedule: 8h–20h between wake-up and sleep. */
export function awakeWindowError(wake: number, sleep: number): string | null {
  if (sleep - wake < MIN_AWAKE_MIN) return "Keep at least 8 hours between wake-up and sleep for scheduling (the rest is protected sleep).";
  if (sleep - wake > MAX_AWAKE_MIN) return "That leaves less than 4 hours of sleep — please adjust.";
  return null;
}

/**
 * A weekday can belong to only one template. Returns the first clash
 * (weekday + other template's name) or null.
 */
export function findWeekdayClash(
  templates: Pick<TemplateLike, "id" | "name" | "daysOfWeek">[],
  daysOfWeek: number[],
  excludeId?: string | null,
): { day: number; templateName: string } | null {
  for (const t of templates) {
    if (excludeId && t.id === excludeId) continue;
    const day = [1, 2, 3, 4, 5, 6, 0].find((d) => daysOfWeek.includes(d) && t.daysOfWeek.includes(d));
    if (day != null) return { day, templateName: t.name };
  }
  return null;
}

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Human-friendly weekday list, Monday-first: "Every day", "Mon–Fri",
 * "Sat, Sun", "Mon, Wed, Fri", "No default days".
 */
export function formatDays(days: number[]): string {
  const set = new Set(days.filter((d) => d >= 0 && d <= 6));
  if (set.size === 0) return "No default days";
  if (set.size === 7) return "Every day";
  // Monday-first positions: Mon=0 … Sun=6
  const pos = [...set].map((d) => (d + 6) % 7).sort((a, b) => a - b);
  const name = (p: number) => SHORT[(p + 1) % 7];
  const runs: [number, number][] = [];
  for (const p of pos) {
    const last = runs[runs.length - 1];
    if (last && p === last[1] + 1) last[1] = p;
    else runs.push([p, p]);
  }
  return runs.map(([a, b]) => (b - a >= 2 ? `${name(a)}–${name(b)}` : a === b ? name(a) : `${name(a)}, ${name(b)}`)).join(", ");
}
