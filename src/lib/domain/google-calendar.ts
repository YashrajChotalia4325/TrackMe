/**
 * Pure helpers for the read-only Google Calendar sync: OAuth scopes, the sync
 * window, and mapping Google events onto TrackMe's Event shape in the user's
 * time zone. No I/O here — everything is unit-tested.
 */
import { TZDate } from "@date-fns/tz";
import { addDays, type ISODate } from "../time";

export const GOOGLE_SCOPES = {
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
} as const;

/** Integration table provider keys owned by the Google integration. */
export const GOOGLE_PROVIDERS = ["GOOGLE_CALENDAR", "GMAIL"] as const;
export type GoogleProvider = (typeof GOOGLE_PROVIDERS)[number];

/** Days of history / future the calendar sync mirrors. */
export const CALENDAR_PAST_DAYS = 7;
export const CALENDAR_FUTURE_DAYS = 60;

/** Subset of the Calendar API v3 Event resource that the sync reads. */
export interface GoogleCalendarEvent {
  id: string;
  status?: string;
  /** default | focusTime | outOfOffice | workingLocation | birthday | fromGmail */
  eventType?: string;
  summary?: string;
  location?: string;
  transparency?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  attendees?: { email?: string; self?: boolean; responseStatus?: string; resource?: boolean }[];
}

/** The TrackMe Event fields produced from a Google event. */
export interface MappedCalendarEvent {
  externalId: string;
  title: string;
  type: "MEETING" | "PERSONAL";
  date: ISODate;
  endDate: ISODate | null;
  startMinute: number | null;
  endMinute: number | null;
  allDay: boolean;
  blocksTime: boolean;
  location: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar date + minute-of-day of an instant in a time zone. */
export function localParts(instant: Date | number | string, tz: string): { date: ISODate; minute: number } | null {
  const ms = typeof instant === "string" ? Date.parse(instant) : typeof instant === "number" ? instant : instant.getTime();
  if (!Number.isFinite(ms)) return null;
  const d = new TZDate(ms, tz);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, minute: d.getHours() * 60 + d.getMinutes() };
}

/** The instant at local midnight starting `date` in `tz`. */
export function startOfLocalDay(date: ISODate, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, tz).getTime());
}

/** RFC 3339 timeMin / timeMax for the synced window, plus its local date bounds. */
export function calendarSyncWindow(today: ISODate, tz: string) {
  const startDate = addDays(today, -CALENDAR_PAST_DAYS);
  const endDate = addDays(today, CALENDAR_FUTURE_DAYS);
  return {
    startDate,
    endDate,
    timeMin: startOfLocalDay(startDate, tz).toISOString(),
    // End of `endDate` == start of the following day (timeMax is exclusive).
    timeMax: startOfLocalDay(addDays(endDate, 1), tz).toISOString(),
  };
}

/** Whether the user declined this event (they are an attendee with responseStatus "declined"). */
export function isDeclined(ev: GoogleCalendarEvent): boolean {
  return Boolean(ev.attendees?.some((a) => a.self && a.responseStatus === "declined"));
}

/** Other human attendees (not the user, not rooms/resources). */
function hasOtherAttendees(ev: GoogleCalendarEvent): boolean {
  return Boolean(ev.attendees?.some((a) => !a.self && !a.resource));
}

/**
 * Map one Google event to TrackMe's Event shape in `tz`. Returns null for
 * cancelled or declined events, working-location entries and events without
 * usable times.
 *
 * - Timed events: date + startMinute/endMinute in the user's zone. Events that
 *   end exactly at the next midnight stay single-day (endMinute 1440); longer
 *   multi-day timed events keep date = start date, endDate = end date and the
 *   start/end minutes as given.
 * - All-day events: Google's end date is exclusive, so endDate = end − 1 day
 *   (null when it is a single day).
 */
export function mapGoogleEvent(ev: GoogleCalendarEvent, tz: string): MappedCalendarEvent | null {
  if (!ev.id || ev.status === "cancelled" || isDeclined(ev)) return null;
  // "Working location" entries (Home / Office) are not commitments.
  if (ev.eventType === "workingLocation") return null;
  const title = ev.summary?.trim().slice(0, 200) || "(busy)";
  const base = {
    externalId: ev.id,
    title,
    type: hasOtherAttendees(ev) ? ("MEETING" as const) : ("PERSONAL" as const),
    blocksTime: ev.transparency !== "transparent",
    location: ev.location?.trim().slice(0, 300) || null,
  };

  const sDate = ev.start?.date;
  if (sDate && ISO_DATE.test(sDate)) {
    const exclusiveEnd = ev.end?.date && ISO_DATE.test(ev.end.date) ? ev.end.date : addDays(sDate, 1);
    const last = addDays(exclusiveEnd, -1);
    return { ...base, date: sDate, endDate: last > sDate ? last : null, startMinute: null, endMinute: null, allDay: true };
  }

  const sDT = ev.start?.dateTime;
  if (!sDT) return null;
  const start = localParts(sDT, tz);
  if (!start) return null;
  const end = (ev.end?.dateTime && localParts(ev.end.dateTime, tz)) || { date: start.date, minute: Math.min(start.minute + 60, 1440) };

  if (end.date === start.date) {
    return { ...base, date: start.date, endDate: null, startMinute: start.minute, endMinute: Math.max(end.minute, start.minute), allDay: false };
  }
  if (end.date === addDays(start.date, 1) && end.minute === 0) {
    return { ...base, date: start.date, endDate: null, startMinute: start.minute, endMinute: 1440, allDay: false };
  }
  if (end.date < start.date) {
    return { ...base, date: start.date, endDate: null, startMinute: start.minute, endMinute: start.minute, allDay: false };
  }
  return { ...base, date: start.date, endDate: end.date, startMinute: start.minute, endMinute: end.minute, allDay: false };
}

/** Fields that matter for change detection (anything the scheduler or UI shows). */
export function calendarEventChanged(
  prev: Pick<MappedCalendarEvent, "title" | "type" | "date" | "endDate" | "startMinute" | "endMinute" | "allDay" | "blocksTime" | "location">,
  next: MappedCalendarEvent,
): boolean {
  return (
    prev.title !== next.title ||
    prev.type !== next.type ||
    prev.date !== next.date ||
    (prev.endDate ?? null) !== next.endDate ||
    (prev.startMinute ?? null) !== next.startMinute ||
    (prev.endMinute ?? null) !== next.endMinute ||
    prev.allDay !== next.allDay ||
    prev.blocksTime !== next.blocksTime ||
    (prev.location ?? null) !== next.location
  );
}

/** Whether the scheduling-relevant part (time / blocking) changed. */
export function calendarTimingChanged(
  prev: Pick<MappedCalendarEvent, "date" | "endDate" | "startMinute" | "endMinute" | "allDay" | "blocksTime"> | null | undefined,
  next: MappedCalendarEvent,
): boolean {
  if (!prev) return true;
  return (
    prev.date !== next.date ||
    (prev.endDate ?? null) !== next.endDate ||
    (prev.startMinute ?? null) !== next.startMinute ||
    (prev.endMinute ?? null) !== next.endMinute ||
    prev.allDay !== next.allDay ||
    prev.blocksTime !== next.blocksTime
  );
}

/** The busy interval [start, end) a mapped event occupies on `date`, or null if it doesn't touch that date. */
export function busyIntervalOn(ev: Pick<MappedCalendarEvent, "date" | "endDate" | "startMinute" | "endMinute" | "allDay">, date: ISODate): { start: number; end: number } | null {
  const last = ev.endDate ?? ev.date;
  if (date < ev.date || date > last) return null;
  if (ev.allDay || ev.startMinute == null) return { start: 0, end: 1440 };
  if (!ev.endDate) return { start: ev.startMinute, end: ev.endMinute ?? ev.startMinute + 60 };
  // Multi-day timed event: busy from start on the first day, until end on the last, all day in between.
  if (date === ev.date) return { start: ev.startMinute, end: 1440 };
  if (date === last) return { start: 0, end: ev.endMinute ?? 1440 };
  return { start: 0, end: 1440 };
}
