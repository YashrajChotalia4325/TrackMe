import { describe, expect, it } from "vitest";
import {
  awakeWindowError,
  energyWindowsForDate,
  findWeekdayClash,
  formatDays,
  protectedBlocksForDate,
  resolveDayRhythm,
  type TemplateLike,
} from "../rhythm";

const defaults = { wakeMinute: 7 * 60, sleepMinute: 23 * 60, dailyFocusLimitMin: 300, dailyTaskLimit: 8 };

const tpl = (over: Partial<TemplateLike>): TemplateLike => ({
  id: Math.random().toString(36).slice(2),
  name: "Template",
  daysOfWeek: [],
  wakeMinute: 6 * 60,
  sleepMinute: 22 * 60,
  focusLimitMin: 240,
  taskLimit: 6,
  restDay: false,
  sortOrder: 0,
  ...over,
});

// 2026-11-16 is a Monday, 2026-11-21 a Saturday.
const MON = "2026-11-16";
const SAT = "2026-11-21";

describe("resolveDayRhythm", () => {
  it("falls back to settings defaults when no template applies", () => {
    const r = resolveDayRhythm(defaults, [], new Map(), MON);
    expect(r).toMatchObject({ templateId: null, templateName: null, source: "default", wake: 420, sleep: 1380, focusLimit: 300, taskLimit: 8, restDay: false });
  });

  it("uses the template whose weekdays contain the date", () => {
    const college = tpl({ id: "college", name: "College day", daysOfWeek: [1, 2, 3, 4, 5], focusLimitMin: 180 });
    const weekend = tpl({ id: "weekend", name: "Weekend", daysOfWeek: [0, 6], restDay: true, wakeMinute: 8 * 60 });
    expect(resolveDayRhythm(defaults, [college, weekend], new Map(), MON)).toMatchObject({ templateId: "college", source: "template", focusLimit: 180, restDay: false });
    expect(resolveDayRhythm(defaults, [college, weekend], new Map(), SAT)).toMatchObject({ templateId: "weekend", templateName: "Weekend", wake: 480, restDay: true });
  });

  it("picks the lowest sortOrder when several templates share a weekday", () => {
    const a = tpl({ id: "a", name: "A", daysOfWeek: [1], sortOrder: 5 });
    const b = tpl({ id: "b", name: "B", daysOfWeek: [1], sortOrder: 1 });
    expect(resolveDayRhythm(defaults, [a, b], new Map(), MON).templateId).toBe("b");
  });

  it("a date override beats the weekday template", () => {
    const college = tpl({ id: "college", daysOfWeek: [1, 2, 3, 4, 5] });
    const exam = tpl({ id: "exam", name: "Exam day", daysOfWeek: [], focusLimitMin: 420, taskLimit: 4 });
    const overrides = new Map([[MON, "exam"]]);
    expect(resolveDayRhythm(defaults, [college, exam], overrides, MON)).toMatchObject({ templateId: "exam", source: "override", focusLimit: 420, taskLimit: 4 });
    // Other days are unaffected.
    expect(resolveDayRhythm(defaults, [college, exam], overrides, "2026-11-17").templateId).toBe("college");
    // Arrays and records work too.
    expect(resolveDayRhythm(defaults, [college, exam], [{ date: MON, templateId: "exam" }], MON).templateId).toBe("exam");
    expect(resolveDayRhythm(defaults, [college, exam], { [MON]: "exam" }, MON).templateId).toBe("exam");
  });

  it("ignores an override pointing at a missing template", () => {
    const college = tpl({ id: "college", daysOfWeek: [1] });
    expect(resolveDayRhythm(defaults, [college], new Map([[MON, "gone"]]), MON).templateId).toBe("college");
  });
});

describe("per-date blocks", () => {
  it("returns protected blocks for the weekday with labels", () => {
    const blocks = [
      { label: "Family dinner", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startMinute: 20 * 60, endMinute: 21 * 60 },
      { label: "Commute", daysOfWeek: [1, 2, 3, 4, 5], startMinute: 8 * 60, endMinute: 9 * 60 },
    ];
    expect(protectedBlocksForDate(blocks, MON)).toHaveLength(2);
    expect(protectedBlocksForDate(blocks, SAT)).toEqual([{ start: 1200, end: 1260, label: "Family dinner" }]);
  });

  it("returns energy windows for the weekday and drops invalid ones", () => {
    const windows = [
      { categoryKey: "ACADEMICS" as const, kind: "PREFER", daysOfWeek: [1], startMinute: 6 * 60, endMinute: 9 * 60, label: "Fresh mind" },
      { categoryKey: null, kind: "AVOID", daysOfWeek: [1, 6], startMinute: 14 * 60, endMinute: 15 * 60 },
      { categoryKey: null, kind: "WHATEVER", daysOfWeek: [1], startMinute: 0, endMinute: 60 },
      { categoryKey: null, kind: "AVOID", daysOfWeek: [1], startMinute: 600, endMinute: 600 },
    ];
    expect(energyWindowsForDate(windows, MON)).toEqual([
      { categoryKey: "ACADEMICS", kind: "PREFER", start: 360, end: 540, label: "Fresh mind" },
      { categoryKey: null, kind: "AVOID", start: 840, end: 900, label: undefined },
    ]);
    expect(energyWindowsForDate(windows, SAT)).toHaveLength(1);
  });
});

describe("validation helpers", () => {
  it("enforces an 8–20 hour awake window", () => {
    expect(awakeWindowError(7 * 60, 23 * 60)).toBeNull();
    expect(awakeWindowError(9 * 60, 16 * 60)).toMatch(/8 hours/);
    expect(awakeWindowError(2 * 60, 23 * 60)).toMatch(/4 hours/);
  });

  it("detects a weekday used by another template", () => {
    const ts = [tpl({ id: "a", name: "College day", daysOfWeek: [1, 2, 3, 4, 5] }), tpl({ id: "b", name: "Weekend", daysOfWeek: [0, 6] })];
    expect(findWeekdayClash(ts, [5, 6])).toEqual({ day: 5, templateName: "College day" });
    expect(findWeekdayClash(ts, [1, 2], "a")).toBeNull();
    expect(findWeekdayClash(ts, [])).toBeNull();
  });

  it("formats weekday lists Monday-first", () => {
    expect(formatDays([1, 2, 3, 4, 5])).toBe("Mon–Fri");
    expect(formatDays([0, 6])).toBe("Sat, Sun");
    expect(formatDays([1, 3, 5])).toBe("Mon, Wed, Fri");
    expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(formatDays([])).toBe("No default days");
  });
});
