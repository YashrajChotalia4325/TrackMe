/**
 * Habits — pure helpers (no I/O).
 *
 * Habits are encouragement, not judgement: they never feed the daily score.
 * Streaks only consider the days a habit is expected on (0=Sun … 6=Sat).
 * Non-expected days neither break nor extend a streak, and an expected day
 * that is still in progress (the "as of" day, not yet ticked) never breaks it.
 */
import { addDays, dayOfWeek, type ISODate } from "@/lib/time";

/** Lucide icon names a habit may use (mapped to components client-side). */
export const HABIT_ICONS = [
  "Check",
  "Droplets",
  "Dumbbell",
  "Footprints",
  "Bike",
  "Bed",
  "Moon",
  "Sun",
  "Brain",
  "BookOpen",
  "PenLine",
  "Code2",
  "Languages",
  "Music",
  "Apple",
  "Salad",
  "Coffee",
  "Pill",
  "Heart",
  "HandHeart",
  "Smile",
  "Leaf",
  "Flower2",
  "Timer",
  "Target",
  "Wallet",
  "Phone",
  "Sparkles",
] as const;
export type HabitIconName = (typeof HABIT_ICONS)[number];

/** Small, calm colour palette. */
export const HABIT_COLORS = [
  { value: "#22C55E", label: "Green" },
  { value: "#14B8A6", label: "Teal" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#A855F7", label: "Purple" },
  { value: "#EC4899", label: "Pink" },
  { value: "#EF4444", label: "Red" },
  { value: "#F97316", label: "Orange" },
  { value: "#EAB308", label: "Yellow" },
  { value: "#94A3B8", label: "Slate" },
] as const;
export type HabitColor = (typeof HABIT_COLORS)[number]["value"];
export const HABIT_COLOR_VALUES = HABIT_COLORS.map((c) => c.value) as unknown as readonly [HabitColor, ...HabitColor[]];

export const DEFAULT_HABIT_ICON: HabitIconName = "Check";
export const DEFAULT_HABIT_COLOR: HabitColor = "#22C55E";
export const ALL_DAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
/** How far back a habit may be ticked (back-filling a forgotten day is fine; decades ago is not). */
export const HABIT_BACKFILL_DAYS = 366;
/** Gentle cap so the habit list never becomes another overfilled to-do list. */
export const MAX_ACTIVE_HABITS = 12;
/** Streak length at which the little flame appears. */
export const FLAME_AT = 3;

export function isHabitIcon(name: string): name is HabitIconName {
  return (HABIT_ICONS as readonly string[]).includes(name);
}

export function isHabitColor(value: string): value is HabitColor {
  return HABIT_COLORS.some((c) => c.value === value);
}

export function isExpectedOn(daysOfWeek: readonly number[], date: ISODate): boolean {
  return daysOfWeek.includes(dayOfWeek(date));
}

/** Human label for a set of weekdays: "Every day", "Weekdays", "Mon, Wed, Fri". */
export function describeDays(daysOfWeek: readonly number[]): string {
  const set = new Set(daysOfWeek);
  if (set.size === 7) return "Every day";
  if (set.size === 0) return "No days";
  const key = [...set].sort().join("");
  if (key === "12345") return "Weekdays";
  if (key === "06") return "Weekends";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => set.has(d)).map((d) => names[d]).join(", ");
}

export interface StreakInput {
  /** Expected weekdays (0=Sun … 6=Sat). */
  daysOfWeek: readonly number[];
  /** Dates (YYYY-MM-DD) the habit was ticked. */
  done: ReadonlySet<string> | readonly string[];
  /** The day to measure from (usually today). */
  asOf: ISODate;
  /** Earliest day the habit can count from (creation day or first log). Defaults to one year before asOf. */
  since?: ISODate;
}

const toSet = (d: ReadonlySet<string> | readonly string[]): ReadonlySet<string> => (d instanceof Set ? d : new Set(d as readonly string[]));
const LOOKBACK = 3660;

/**
 * Expected days walking backwards from `asOf` (inclusive) down to `since`.
 * If `asOf` is expected but not done yet, it is skipped — today still has time.
 */
function* expectedDaysBack(daysOfWeek: readonly number[], done: ReadonlySet<string>, asOf: ISODate, since: ISODate): Generator<ISODate> {
  if (daysOfWeek.length === 0) return;
  const floor = since > addDays(asOf, -LOOKBACK) ? since : addDays(asOf, -LOOKBACK);
  let d = asOf;
  if (!done.has(d)) d = addDays(d, -1);
  for (; d >= floor; d = addDays(d, -1)) {
    if (isExpectedOn(daysOfWeek, d)) yield d;
  }
}

/** Current streak, in expected days, as of `asOf`. */
export function currentStreak({ daysOfWeek, done, asOf, since }: StreakInput): number {
  const set = toSet(done);
  let n = 0;
  for (const d of expectedDaysBack(daysOfWeek, set, asOf, since ?? addDays(asOf, -366))) {
    if (!set.has(d)) break;
    n++;
  }
  return n;
}

/** Longest run of consecutive expected days done, between `since` and `asOf`. */
export function bestStreak({ daysOfWeek, done, asOf, since }: StreakInput): number {
  const set = toSet(done);
  let best = 0;
  let run = 0;
  for (const d of expectedDaysBack(daysOfWeek, set, asOf, since ?? addDays(asOf, -366))) {
    if (set.has(d)) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

export interface CompletionRate {
  done: number;
  expected: number;
  /** 0–1, or null when there were no expected days yet. */
  rate: number | null;
}

/**
 * Completion over the last `n` expected days up to `asOf`.
 * Today only counts once it's done; days before `since` are ignored so a new
 * habit isn't penalised for days it didn't exist.
 */
export function completionRate({ daysOfWeek, done, asOf, since }: StreakInput, n = 30): CompletionRate {
  const set = toSet(done);
  let expected = 0;
  let hits = 0;
  for (const d of expectedDaysBack(daysOfWeek, set, asOf, since ?? addDays(asOf, -366))) {
    if (expected >= n) break;
    expected++;
    if (set.has(d)) hits++;
  }
  return { done: hits, expected, rate: expected === 0 ? null : hits / expected };
}

export interface HabitGridDay {
  date: ISODate;
  /** Expected on this weekday and on/after the day the habit started. */
  expected: boolean;
  done: boolean;
  /** Before the habit existed — never shown as a miss. */
  beforeStart: boolean;
}

/**
 * Calendar strip of the last `days` days ending at `asOf` (oldest first).
 * Days before `since` are never "expected", so a new habit doesn't show a row of misses.
 */
export function habitGrid(daysOfWeek: readonly number[], done: ReadonlySet<string> | readonly string[], asOf: ISODate, days = 30, since?: ISODate): HabitGridDay[] {
  const set = toSet(done);
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(asOf, i - days + 1);
    const beforeStart = since != null && date < since;
    return { date, expected: !beforeStart && isExpectedOn(daysOfWeek, date), done: set.has(date), beforeStart };
  });
}

/** Serializable habit summary for the Personal page. */
export interface HabitOverview {
  id: string;
  name: string;
  icon: string;
  color: string;
  daysOfWeek: number[];
  active: boolean;
  streak: number;
  best: number;
  /** Rate over the last 30 expected days. */
  rate: CompletionRate;
  grid: HabitGridDay[];
  doneToday: boolean;
  expectedToday: boolean;
}
