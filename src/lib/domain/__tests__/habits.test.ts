import { describe, expect, it } from "vitest";
import { bestStreak, completionRate, currentStreak, describeDays, habitGrid, isExpectedOn, isHabitColor, isHabitIcon } from "../habits";
import { addDays, dayOfWeek } from "@/lib/time";

// 2026-11-16 is a Monday.
const MON = "2026-11-16";
const d = (offset: number) => addDays(MON, offset);
const EVERY = [0, 1, 2, 3, 4, 5, 6];
const MWF = [1, 3, 5];

describe("fixtures", () => {
  it("uses a Monday anchor", () => {
    expect(dayOfWeek(MON)).toBe(1);
  });
});

describe("currentStreak", () => {
  it("counts consecutive done days including today", () => {
    expect(currentStreak({ daysOfWeek: EVERY, done: [d(-2), d(-1), d(0)], asOf: d(0) })).toBe(3);
  });

  it("does not break when today is not done yet — counts from yesterday", () => {
    expect(currentStreak({ daysOfWeek: EVERY, done: [d(-3), d(-2), d(-1)], asOf: d(0) })).toBe(3);
  });

  it("breaks on a missed expected day", () => {
    expect(currentStreak({ daysOfWeek: EVERY, done: [d(-4), d(-3), d(-1)], asOf: d(0) })).toBe(1);
    expect(currentStreak({ daysOfWeek: EVERY, done: [d(-3), d(-2)], asOf: d(0) })).toBe(0);
  });

  it("ignores non-expected days (Mon/Wed/Fri habit)", () => {
    // Fri (-3), Mon (0) done; Sat/Sun are not expected and don't break the streak.
    expect(currentStreak({ daysOfWeek: MWF, done: [d(-7), d(-5), d(-3), d(0)], asOf: d(0) })).toBe(4);
  });

  it("non-expected days neither extend nor break", () => {
    // Done on Saturday and Sunday (not expected) — they don't add to the count.
    expect(currentStreak({ daysOfWeek: MWF, done: [d(-3), d(-2), d(-1), d(0)], asOf: d(0) })).toBe(2);
  });

  it("an unticked non-expected asOf day counts back to the last expected day", () => {
    // asOf Tuesday (not expected), Mon & Fri done.
    expect(currentStreak({ daysOfWeek: MWF, done: [d(-3), d(0)], asOf: d(1) })).toBe(2);
  });

  it("breaks on a missed expected day even across gaps", () => {
    // Wed (-5) missed.
    expect(currentStreak({ daysOfWeek: MWF, done: [d(-7), d(-3), d(0)], asOf: d(0) })).toBe(2);
  });

  it("stops at `since`", () => {
    expect(currentStreak({ daysOfWeek: EVERY, done: [d(-5), d(-4), d(-3), d(-2), d(-1)], asOf: d(0), since: d(-2) })).toBe(2);
  });

  it("returns 0 with no expected days", () => {
    expect(currentStreak({ daysOfWeek: [], done: [d(0)], asOf: d(0) })).toBe(0);
  });

  it("accepts a Set", () => {
    expect(currentStreak({ daysOfWeek: EVERY, done: new Set([d(0)]), asOf: d(0) })).toBe(1);
  });
});

describe("bestStreak", () => {
  it("finds the longest run of expected days", () => {
    const done = [d(-10), d(-9), d(-8), d(-7), d(-5), d(-4)];
    expect(bestStreak({ daysOfWeek: EVERY, done, asOf: d(0) })).toBe(4);
  });

  it("only counts expected days", () => {
    // Mon/Wed/Fri over two weeks with one Wed missed.
    const done = [d(-14), d(-12), d(-10), d(-7), d(-3), d(-1), d(0)];
    expect(bestStreak({ daysOfWeek: MWF, done, asOf: d(0) })).toBe(4);
  });

  it("is at least the current streak", () => {
    const done = [d(-2), d(-1), d(0)];
    expect(bestStreak({ daysOfWeek: EVERY, done, asOf: d(0) })).toBe(3);
  });

  it("is 0 with no logs", () => {
    expect(bestStreak({ daysOfWeek: EVERY, done: [], asOf: d(0) })).toBe(0);
  });
});

describe("completionRate", () => {
  it("computes the rate over the last N expected days", () => {
    const r = completionRate({ daysOfWeek: EVERY, done: [d(-1), d(-2), d(-4)], asOf: d(0) }, 4);
    // today not done → window is -1..-4: 3 of 4.
    expect(r).toEqual({ done: 3, expected: 4, rate: 0.75 });
  });

  it("includes today once it's done", () => {
    const r = completionRate({ daysOfWeek: EVERY, done: [d(0), d(-1)], asOf: d(0) }, 4);
    expect(r).toEqual({ done: 2, expected: 4, rate: 0.5 });
  });

  it("only looks at expected days", () => {
    // Last 3 expected MWF days before Monday: Fri -3, Wed -5, Mon -7.
    const r = completionRate({ daysOfWeek: MWF, done: [d(-3), d(-7), d(-2)], asOf: d(0) }, 3);
    expect(r).toEqual({ done: 2, expected: 3, rate: 2 / 3 });
  });

  it("doesn't penalise days before the habit existed", () => {
    const r = completionRate({ daysOfWeek: EVERY, done: [d(-1)], asOf: d(0), since: d(-1) }, 30);
    expect(r).toEqual({ done: 1, expected: 1, rate: 1 });
  });

  it("returns null rate with no expected days yet", () => {
    expect(completionRate({ daysOfWeek: EVERY, done: [], asOf: d(0), since: d(0) }).rate).toBeNull();
  });
});

describe("habitGrid", () => {
  it("returns oldest-first days ending at asOf", () => {
    const g = habitGrid(MWF, [d(0), d(-1)], d(0), 7);
    expect(g).toHaveLength(7);
    expect(g[0].date).toBe(d(-6));
    expect(g[6]).toEqual({ date: d(0), expected: true, done: true, beforeStart: false });
    expect(g[5]).toEqual({ date: d(-1), expected: false, done: true, beforeStart: false });
  });

  it("never marks days before the habit started as expected", () => {
    const g = habitGrid(EVERY, [d(0)], d(0), 5, d(-1));
    expect(g.map((x) => x.expected)).toEqual([false, false, false, true, true]);
    expect(g.map((x) => x.beforeStart)).toEqual([true, true, true, false, false]);
  });
});

describe("edge cases", () => {
  it("a habit created today and not yet ticked has no streak and a null rate", () => {
    expect(currentStreak({ daysOfWeek: EVERY, done: [], asOf: d(0), since: d(0) })).toBe(0);
    expect(completionRate({ daysOfWeek: EVERY, done: [], asOf: d(0), since: d(0) })).toEqual({ done: 0, expected: 0, rate: null });
  });

  it("a bonus tick on a non-expected today neither adds nor breaks", () => {
    // Tuesday (not expected) ticked; Mon done.
    expect(currentStreak({ daysOfWeek: MWF, done: [d(0), d(1)], asOf: d(1) })).toBe(1);
  });

  it("caps the completion window at n expected days", () => {
    const done = Array.from({ length: 60 }, (_, i) => d(-i));
    expect(completionRate({ daysOfWeek: EVERY, done, asOf: d(0) }, 30)).toEqual({ done: 30, expected: 30, rate: 1 });
  });

  it("best streak ignores runs before since", () => {
    const done = [d(-10), d(-9), d(-8), d(-7), d(-1), d(0)];
    expect(bestStreak({ daysOfWeek: EVERY, done, asOf: d(0), since: d(-2) })).toBe(2);
  });
});

describe("helpers", () => {
  it("describes days", () => {
    expect(describeDays(EVERY)).toBe("Every day");
    expect(describeDays([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(describeDays([6, 0])).toBe("Weekends");
    expect(describeDays([5, 1, 3])).toBe("Mon, Wed, Fri");
    expect(describeDays([0, 1])).toBe("Mon, Sun");
  });

  it("checks expected days and icons", () => {
    expect(isExpectedOn(MWF, MON)).toBe(true);
    expect(isExpectedOn(MWF, d(1))).toBe(false);
    expect(isHabitIcon("Droplets")).toBe(true);
    expect(isHabitIcon("Skull")).toBe(false);
    expect(isHabitColor("#22C55E")).toBe(true);
    expect(isHabitColor("#000000")).toBe(false);
  });
});
