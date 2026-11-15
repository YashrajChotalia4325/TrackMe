import { describe, expect, it } from "vitest";
import { busyIntervalOn, calendarEventChanged, calendarSyncWindow, calendarTimingChanged, mapGoogleEvent, type GoogleCalendarEvent } from "../google-calendar";

const TZ = "Asia/Kolkata";
const ev = (over: Partial<GoogleCalendarEvent>): GoogleCalendarEvent => ({ id: "g1", summary: "Standup", start: { dateTime: "2026-11-16T10:00:00+05:30" }, end: { dateTime: "2026-11-16T10:30:00+05:30" }, ...over });

describe("mapGoogleEvent", () => {
  it("maps a timed event into local minutes", () => {
    expect(mapGoogleEvent(ev({}), TZ)).toEqual({ externalId: "g1", title: "Standup", type: "PERSONAL", date: "2026-11-16", endDate: null, startMinute: 600, endMinute: 630, allDay: false, blocksTime: true, location: null });
  });

  it("converts other time zones into the user's zone", () => {
    const m = mapGoogleEvent(ev({ start: { dateTime: "2026-11-16T04:30:00Z" }, end: { dateTime: "2026-11-16T05:30:00Z" } }), TZ);
    expect(m).toMatchObject({ date: "2026-11-16", startMinute: 600, endMinute: 660 });
    // A late-evening UTC event lands on the next local day
    const late = mapGoogleEvent(ev({ start: { dateTime: "2026-11-16T20:00:00Z" }, end: { dateTime: "2026-11-16T21:00:00Z" } }), TZ);
    expect(late).toMatchObject({ date: "2026-11-17", startMinute: 90, endMinute: 150 });
  });

  it("maps all-day events with exclusive end dates", () => {
    expect(mapGoogleEvent(ev({ start: { date: "2026-11-20" }, end: { date: "2026-11-21" } }), TZ)).toMatchObject({ allDay: true, date: "2026-11-20", endDate: null, startMinute: null, endMinute: null });
    expect(mapGoogleEvent(ev({ start: { date: "2026-11-20" }, end: { date: "2026-11-23" } }), TZ)).toMatchObject({ allDay: true, date: "2026-11-20", endDate: "2026-11-22" });
  });

  it("keeps events ending at midnight on one day, and spans multi-day timed events", () => {
    expect(mapGoogleEvent(ev({ start: { dateTime: "2026-11-16T22:00:00+05:30" }, end: { dateTime: "2026-11-17T00:00:00+05:30" } }), TZ)).toMatchObject({ date: "2026-11-16", endDate: null, startMinute: 1320, endMinute: 1440 });
    expect(mapGoogleEvent(ev({ start: { dateTime: "2026-11-16T22:00:00+05:30" }, end: { dateTime: "2026-11-18T09:00:00+05:30" } }), TZ)).toMatchObject({ date: "2026-11-16", endDate: "2026-11-18", startMinute: 1320, endMinute: 540 });
  });

  it("skips cancelled and declined events", () => {
    expect(mapGoogleEvent(ev({ status: "cancelled" }), TZ)).toBeNull();
    expect(mapGoogleEvent(ev({ eventType: "workingLocation", start: { date: "2026-11-16" }, end: { date: "2026-11-17" } }), TZ)).toBeNull();
    expect(mapGoogleEvent(ev({ eventType: "outOfOffice" }), TZ)).toMatchObject({ blocksTime: true });
    expect(mapGoogleEvent(ev({ attendees: [{ email: "me@x.com", self: true, responseStatus: "declined" }, { email: "a@x.com" }] }), TZ)).toBeNull();
  });

  it("derives type, blocking and title fallback", () => {
    const m = mapGoogleEvent(ev({ summary: "  ", transparency: "transparent", location: " Room 4 ", attendees: [{ email: "me@x.com", self: true, responseStatus: "accepted" }, { email: "boss@x.com" }] }), TZ);
    expect(m).toMatchObject({ title: "(busy)", blocksTime: false, type: "MEETING", location: "Room 4" });
    const roomOnly = mapGoogleEvent(ev({ attendees: [{ email: "me@x.com", self: true }, { email: "room@resource.calendar.google.com", resource: true }] }), TZ);
    expect(roomOnly?.type).toBe("PERSONAL");
  });

  it("returns null without start times", () => {
    expect(mapGoogleEvent({ id: "x" }, TZ)).toBeNull();
  });
});

describe("window + change detection", () => {
  it("builds the sync window in the user's zone", () => {
    const w = calendarSyncWindow("2026-11-15", TZ);
    expect(w.startDate).toBe("2026-11-08");
    expect(w.endDate).toBe("2027-01-14");
    expect(w.timeMin).toBe("2026-11-07T18:30:00.000Z");
    expect(w.timeMax).toBe("2027-01-14T18:30:00.000Z");
  });

  it("detects changes", () => {
    const m = mapGoogleEvent(ev({}), TZ)!;
    expect(calendarEventChanged({ ...m }, m)).toBe(false);
    expect(calendarEventChanged({ ...m, title: "Old" }, m)).toBe(true);
    const renamed = { ...m, title: "Old" };
    expect(calendarTimingChanged(renamed, m)).toBe(false);
    expect(calendarTimingChanged({ ...m, startMinute: 0 }, m)).toBe(true);
    expect(calendarTimingChanged(null, m)).toBe(true);
  });

  it("computes busy intervals per day", () => {
    const multi = { date: "2026-11-16", endDate: "2026-11-18", startMinute: 1320, endMinute: 540, allDay: false };
    expect(busyIntervalOn(multi, "2026-11-16")).toEqual({ start: 1320, end: 1440 });
    expect(busyIntervalOn(multi, "2026-11-17")).toEqual({ start: 0, end: 1440 });
    expect(busyIntervalOn(multi, "2026-11-18")).toEqual({ start: 0, end: 540 });
    expect(busyIntervalOn(multi, "2026-11-19")).toBeNull();
    expect(busyIntervalOn({ date: "2026-11-16", endDate: null, startMinute: 600, endMinute: 630, allDay: false }, "2026-11-16")).toEqual({ start: 600, end: 630 });
  });
});
