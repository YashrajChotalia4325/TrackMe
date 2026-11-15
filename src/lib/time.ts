/**
 * Time utilities.
 *
 * TrackMe stores user-local calendar days as `YYYY-MM-DD` strings and times of
 * day as minutes from local midnight. Everything here is pure and does not
 * depend on the server's time zone.
 */
import { TZDate } from "@date-fns/tz";

export const DEFAULT_TZ = "Asia/Kolkata";
export type ISODate = string; // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, "0");

/** Current local date + minute-of-day in the given time zone. */
export function nowIn(tz: string = DEFAULT_TZ, at: Date = new Date()) {
  const d = new TZDate(at.getTime(), tz);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { date, minute: d.getHours() * 60 + d.getMinutes(), hour: d.getHours() };
}

export function todayIn(tz: string = DEFAULT_TZ): ISODate {
  return nowIn(tz).date;
}

function toUTC(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(d: Date): ISODate {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUTC(toUTC(s)) === s;
}

export function addDays(date: ISODate, n: number): ISODate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: ISODate): number {
  return toUTC(date).getUTCDay();
}

/** Monday of the ISO week containing `date`. */
export function weekStart(date: ISODate): ISODate {
  const dow = dayOfWeek(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

export function weekDays(start: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86_400_000);
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function monthRange(month: string): { start: ISODate; end: ISODate } {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = fromUTC(new Date(Date.UTC(y, m, 0)));
  return { start, end };
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function datesBetween(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function minuteToHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function hhmmToMinute(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59 || (h === 24 && mm > 0)) return null;
  return h * 60 + mm;
}

/** 12-hour label, e.g. "6:30 PM". */
export function formatMinute(min: number | null | undefined): string {
  if (min == null) return "Unscheduled";
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

export function formatDuration(min: number): string {
  if (min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DAY_LABELS = DAYS;
export const DAY_LABELS_LONG = DAYS_LONG;

export function formatDate(date: ISODate, style: "short" | "long" | "weekday" | "dm" = "short"): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = dayOfWeek(date);
  switch (style) {
    case "long":
      return `${DAYS_LONG[dow]}, ${d} ${MONTHS_LONG[m - 1]} ${y}`;
    case "weekday":
      return `${DAYS[dow]} ${d} ${MONTHS[m - 1]}`;
    case "dm":
      return `${d} ${MONTHS[m - 1]}`;
    default:
      return `${d} ${MONTHS[m - 1]} ${y}`;
  }
}

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export type DayPart = "Morning" | "Afternoon" | "Evening" | "Night";
export function dayPart(minute: number | null | undefined): DayPart {
  if (minute == null) return "Morning";
  if (minute < 12 * 60) return "Morning";
  if (minute < 17 * 60) return "Afternoon";
  if (minute < 21 * 60) return "Evening";
  return "Night";
}

export function greeting(minute: number): string {
  if (minute < 12 * 60) return "Good morning";
  if (minute < 17 * 60) return "Good afternoon";
  return "Good evening";
}
