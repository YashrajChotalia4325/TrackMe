import { describe, expect, it } from "vitest";
import {
  examModeSuggestion,
  findSlot,
  freeSlots,
  learnLateHourPattern,
  planWeek,
  rescheduleDay,
  resolveConflicts,
  type DayContext,
  type SchedTask,
} from "../scheduler";
import { addDays } from "../../time";

const ctx = (date: string, over: Partial<DayContext> = {}): DayContext => ({
  date,
  wake: 7 * 60,
  sleep: 23 * 60,
  busy: [],
  placed: [],
  focusUsed: 0,
  tasksCount: 0,
  focusLimit: 300,
  taskLimit: 8,
  ...over,
});

const task = (over: Partial<SchedTask>): SchedTask => ({
  id: Math.random().toString(36).slice(2),
  title: "Task",
  kind: "FLEXIBLE",
  priority: "MEDIUM",
  categoryKey: "AI",
  date: "2026-11-17",
  startMinute: 18 * 60,
  durationMin: 60,
  deadline: null,
  status: "PENDING",
  ...over,
});

describe("freeSlots / findSlot", () => {
  it("never schedules outside the wake → sleep window", () => {
    const d = ctx("2026-11-17", { busy: [{ start: 9 * 60, end: 17 * 60 }] });
    const slots = freeSlots(d, 10);
    for (const s of slots) {
      expect(s.start).toBeGreaterThanOrEqual(7 * 60);
      expect(s.end).toBeLessThanOrEqual(23 * 60);
    }
    // Late preference still lands before sleep
    const start = findSlot(d, 60, { preferred: 23 * 60, gap: 10 });
    expect(start).not.toBeNull();
    expect(start! + 60).toBeLessThanOrEqual(23 * 60);
  });

  it("keeps a rest gap around busy blocks", () => {
    const d = ctx("2026-11-17", { wake: 9 * 60, sleep: 12 * 60, busy: [{ start: 10 * 60, end: 11 * 60 }] });
    const start = findSlot(d, 30, { preferred: 11 * 60, gap: 15 });
    expect(start).toBe(11 * 60 + 15);
  });

  it("respects the daily focus cap and task cap", () => {
    expect(findSlot(ctx("2026-11-17", { focusUsed: 280 }), 30, { gap: 10 })).toBeNull();
    expect(findSlot(ctx("2026-11-17", { tasksCount: 8 }), 30, { gap: 10 })).toBeNull();
  });
});

describe("rescheduleDay", () => {
  const today = "2026-11-17"; // Tuesday
  const later = [1, 2, 3, 4, 5].map((i) => ctx(addDays(today, i)));

  it("moves a missed task later today when there is room", () => {
    const missed = task({ title: "AI learning", startMinute: 10 * 60 });
    const p = rescheduleDay({
      today,
      nowMinute: 14 * 60,
      todayTasks: [missed],
      todayCtx: ctx(today),
      laterDays: later,
      weekEnd: "2026-11-22",
      gap: 10,
      mode: "NORMAL",
    });
    expect(p.changes).toHaveLength(1);
    expect(p.changes[0].action).toBe("MOVE");
    expect(p.changes[0].to!.date).toBe(today);
    expect(p.changes[0].to!.start).toBeGreaterThanOrEqual(14 * 60);
  });

  it("never moves fixed commitments and warns about missed ones", () => {
    const lecture = task({ title: "Lecture", kind: "FIXED", startMinute: 9 * 60 });
    const p = rescheduleDay({ today, nowMinute: 12 * 60, todayTasks: [lecture], todayCtx: ctx(today), laterDays: later, weekEnd: "2026-11-22", gap: 10, mode: "NORMAL" });
    expect(p.changes).toHaveLength(0);
    expect(p.warnings[0]).toMatch(/fixed commitment/);
  });

  it("spreads overflow across the week instead of piling onto tomorrow", () => {
    const full = ctx(today, { focusUsed: 300 });
    const tasks = [1, 2, 3].map((i) => task({ title: `Block ${i}`, startMinute: 9 * 60 + i * 60 }));
    const days = later.map((d, i) => (i === 0 ? { ...d, focusUsed: 200 } : d)); // tomorrow already busy
    const p = rescheduleDay({ today, nowMinute: 22 * 60, todayTasks: tasks, todayCtx: full, laterDays: days, weekEnd: "2026-11-22", gap: 10, mode: "NORMAL" });
    const dates = p.changes.map((c) => c.to?.date);
    expect(new Set(dates).size).toBe(3);
    expect(dates).not.toContain(addDays(today, 1));
  });

  it("skips optional work without creating backlog", () => {
    const opt = task({ kind: "OPTIONAL", title: "Extra reading", startMinute: 9 * 60 });
    const p = rescheduleDay({ today, nowMinute: 22 * 60 + 50, todayTasks: [opt], todayCtx: ctx(today), laterDays: later, weekEnd: "2026-11-22", gap: 10, mode: "NORMAL" });
    expect(p.changes[0].action).toBe("SKIP");
  });

  it("pauses non-essential work in recovery mode", () => {
    const t1 = task({ title: "Creative writing", categoryKey: "CREATIVITY", startMinute: 9 * 60 });
    const t2 = task({ title: "Assignment", kind: "HIGH_PRIORITY", deadline: "2026-11-18", startMinute: 9 * 60 });
    const p = rescheduleDay({ today, nowMinute: 12 * 60, todayTasks: [t1, t2], todayCtx: ctx(today), laterDays: later, weekEnd: "2026-11-22", gap: 10, mode: "RECOVERY" });
    expect(p.changes.find((c) => c.title === "Creative writing")!.action).toBe("SKIP");
    expect(p.changes.find((c) => c.title === "Assignment")!.action).toBe("MOVE");
  });

  it("reports (does not delete) work that cannot fit anywhere", () => {
    const big = task({ title: "Huge", durationMin: 240, startMinute: 8 * 60 });
    const tiny = (d: string) => ctx(d, { focusLimit: 60 });
    const p = rescheduleDay({ today, nowMinute: 22 * 60, todayTasks: [big], todayCtx: tiny(today), laterDays: later.map((d) => tiny(d.date)), weekEnd: "2026-11-22", gap: 10, mode: "NORMAL" });
    expect(p.changes[0].action).toBe("UNSCHEDULE");
    expect(p.warnings.length).toBeGreaterThan(0);
  });
});

describe("resolveConflicts", () => {
  it("moves flexible tasks around a new 3-hour event and protects fixed ones", () => {
    const date = "2026-11-18";
    const flex = task({ title: "AI learning", date, startMinute: 18 * 60 });
    const fixed = task({ title: "Interview", date, kind: "FIXED", startMinute: 17 * 60 });
    const block = { start: 16 * 60 + 30, end: 19 * 60 + 30 };
    const p = resolveConflicts({
      date,
      newBlock: block,
      tasksOnDate: [flex, fixed],
      dayCtx: ctx(date, { busy: [block] }),
      laterDays: [ctx("2026-11-19")],
      weekEnd: "2026-11-22",
      gap: 10,
    });
    const mv = p.changes.find((c) => c.title === "AI learning")!;
    expect(mv.action).toBe("MOVE");
    expect(mv.to!.start! >= block.end || mv.to!.start! + 60 <= block.start).toBe(true);
    expect(p.changes.find((c) => c.title === "Interview")).toBeUndefined();
    expect(p.warnings[0]).toMatch(/fixed commitment/);
  });
});

describe("planWeek", () => {
  const weekStart = "2026-11-16"; // Monday
  const days = () => Array.from({ length: 7 }, (_, i) => ctx(addDays(weekStart, i)));

  it("plans weekly targets without overfilling days", () => {
    const p = planWeek({
      weekStart,
      mode: "NORMAL",
      days: days(),
      targets: [
        { key: "ai-learning", label: "AI learning", categoryKey: "AI", unit: "MINUTES", target: 360, covered: 0, blockMin: 60, preferredStart: null, autoPlan: true, optional: false },
        { key: "gym", label: "Gym", categoryKey: "FITNESS", unit: "SESSIONS", target: 4, covered: 0, blockMin: 60, preferredStart: 7 * 60, autoPlan: true, optional: false, daysOfWeek: [1, 2, 4, 5] },
      ],
      recurring: [],
      existingDedupeKeys: new Set(),
      carryover: [],
      gap: 10,
    });
    const creates = p.changes.filter((c) => c.action === "CREATE");
    const aiMinutes = creates.filter((c) => c.categoryKey === "AI").reduce((s, c) => s + c.durationMin, 0);
    expect(aiMinutes).toBe(360);
    const gymDays = creates.filter((c) => c.categoryKey === "FITNESS").map((c) => new Date(c.to!.date).getUTCDay());
    expect(gymDays.sort()).toEqual([1, 2, 4, 5]);
    // At most one AI block per day
    const aiPerDay = new Map<string, number>();
    creates.filter((c) => c.categoryKey === "AI").forEach((c) => aiPerDay.set(c.to!.date, (aiPerDay.get(c.to!.date) ?? 0) + 1));
    expect(Math.max(...aiPerDay.values())).toBe(1);
    expect(p.warnings).toHaveLength(0);
  });

  it("warns explicitly when a target cannot be met", () => {
    const tight = days().map((d) => ({ ...d, focusLimit: 30 }));
    const p = planWeek({
      weekStart,
      mode: "NORMAL",
      days: tight,
      targets: [{ key: "ai-learning", label: "AI learning", categoryKey: "AI", unit: "MINUTES", target: 600, covered: 0, blockMin: 60, preferredStart: null, autoPlan: true, optional: false }],
      recurring: [],
      existingDedupeKeys: new Set(),
      carryover: [],
      gap: 10,
    });
    expect(p.warnings.some((w) => w.includes("short of the weekly target"))).toBe(true);
  });

  it("does not duplicate recurring tasks that already exist", () => {
    const rec = { id: "r1", title: "Gym", categoryKey: "FITNESS" as const, kind: "RECURRING" as const, priority: "MEDIUM" as const, durationMin: 60, daysOfWeek: [1], preferredStart: 7 * 60, startDate: "2026-11-01", endDate: null, modes: ["NORMAL" as const], canSkip: false };
    const p = planWeek({ weekStart, mode: "NORMAL", days: days(), targets: [], recurring: [rec], existingDedupeKeys: new Set(["rec:r1:2026-11-16"]), carryover: [], gap: 10 });
    expect(p.changes).toHaveLength(0);
  });

  it("does not schedule optional non-fitness work on exam days", () => {
    const p = planWeek({
      weekStart,
      mode: "EXAM",
      days: days(),
      targets: [{ key: "creative", label: "Writing", categoryKey: "CREATIVITY", unit: "MINUTES", target: 90, covered: 0, blockMin: 45, preferredStart: null, autoPlan: true, optional: true }],
      recurring: [],
      existingDedupeKeys: new Set(),
      carryover: [],
      gap: 10,
      examDates: new Set(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))),
    });
    expect(p.changes).toHaveLength(0);
  });
});

describe("history + exam suggestion", () => {
  it("learns that late tasks are often missed", () => {
    const h = [
      ...Array.from({ length: 6 }, () => ({ startMinute: 22 * 60, completed: false })),
      { startMinute: 22 * 60, completed: true },
      ...Array.from({ length: 8 }, () => ({ startMinute: 18 * 60, completed: true })),
    ];
    const r = learnLateHourPattern(h);
    expect(r.softLatestStart).toBe(21 * 60);
    expect(r.suggestion).toMatch(/after 9 PM/);
  });

  it("suggests exam mode within lead days", () => {
    const periods = [{ name: "End-sem", startDate: "2026-11-23", endDate: "2026-12-03", leadDays: 10 }];
    expect(examModeSuggestion("2026-11-13", periods)?.daysUntil).toBe(10);
    expect(examModeSuggestion("2026-11-01", periods)).toBeNull();
    expect(examModeSuggestion("2026-12-04", periods)).toBeNull();
  });
});

describe("energy windows", () => {
  it("never places work inside a matching AVOID window", () => {
    const d = ctx("2026-11-17", {
      wake: 9 * 60,
      sleep: 14 * 60,
      windows: [{ categoryKey: "AI", kind: "AVOID", start: 9 * 60, end: 12 * 60 }],
    });
    // Preferred time is inside the avoid window, so the block is pushed out of it.
    const start = findSlot(d, 60, { preferred: 9 * 60, gap: 10, categoryKey: "AI" });
    expect(start).not.toBeNull();
    expect(start!).toBeGreaterThanOrEqual(12 * 60);
    // Other categories are unaffected.
    expect(findSlot(d, 60, { preferred: 9 * 60, gap: 10, categoryKey: "FITNESS" })).toBe(9 * 60);
  });

  it("returns null rather than overlapping an AVOID window", () => {
    const d = ctx("2026-11-17", { wake: 9 * 60, sleep: 12 * 60, windows: [{ categoryKey: null, kind: "AVOID", start: 10 * 60, end: 11 * 60 }] });
    // 90 min cannot fit in 9-10 or 11-12 without touching 10-11.
    expect(findSlot(d, 90, { gap: 0, categoryKey: "ACADEMICS" })).toBeNull();
    // An all-category window also applies when no category is given.
    expect(findSlot(d, 90, { gap: 0 })).toBeNull();
    expect(findSlot(d, 60, { gap: 0, preferred: 10 * 60 })).not.toBe(10 * 60);
  });

  it("prefers a matching PREFER window when it has room", () => {
    const d = ctx("2026-11-17", { windows: [{ categoryKey: "ACADEMICS", kind: "PREFER", start: 6 * 60, end: 10 * 60 }] });
    // Preferred start (18:00) is outside the window, but the window wins.
    const start = findSlot(d, 60, { preferred: 18 * 60, gap: 10, categoryKey: "ACADEMICS" });
    expect(start).not.toBeNull();
    expect(start!).toBeGreaterThanOrEqual(7 * 60);
    expect(start! + 60).toBeLessThanOrEqual(10 * 60);
    // Within the window, the slot closest to the preferred time is chosen.
    expect(start).toBe(9 * 60);
    // Non-matching categories ignore the window.
    expect(findSlot(d, 60, { preferred: 18 * 60, gap: 10, categoryKey: "AI" })).toBe(18 * 60);
  });

  it("falls back outside a PREFER window when it is full", () => {
    const d = ctx("2026-11-17", {
      busy: [{ start: 7 * 60, end: 10 * 60, label: "Lecture" }],
      windows: [{ categoryKey: "ACADEMICS", kind: "PREFER", start: 7 * 60, end: 10 * 60 }],
    });
    const start = findSlot(d, 60, { preferred: 18 * 60, gap: 10, categoryKey: "ACADEMICS" });
    expect(start).toBe(18 * 60);
  });

  it("treats protected blocks in busy as untouchable", () => {
    const d = ctx("2026-11-17", { wake: 19 * 60, sleep: 23 * 60, busy: [{ start: 20 * 60, end: 21 * 60, label: "Family dinner" }] });
    const start = findSlot(d, 60, { preferred: 20 * 60, gap: 10, categoryKey: "PERSONAL" });
    expect(start).not.toBeNull();
    expect(start! + 60 <= 20 * 60 || start! >= 21 * 60).toBe(true);
  });

  it("threads the task category through planWeek", () => {
    const weekStart = "2026-11-16";
    const days = Array.from({ length: 7 }, (_, i) =>
      ctx(addDays(weekStart, i), { windows: [{ categoryKey: "AI", kind: "AVOID", start: 17 * 60, end: 23 * 60 }] }),
    );
    const p = planWeek({
      weekStart,
      mode: "NORMAL",
      days,
      targets: [{ key: "ai-learning", label: "AI learning", categoryKey: "AI", unit: "MINUTES", target: 180, covered: 0, blockMin: 60, preferredStart: 19 * 60, autoPlan: true, optional: false }],
      recurring: [],
      existingDedupeKeys: new Set(),
      carryover: [],
      gap: 10,
    });
    const creates = p.changes.filter((c) => c.action === "CREATE");
    expect(creates.length).toBeGreaterThan(0);
    for (const c of creates) expect(c.to!.start! + c.durationMin).toBeLessThanOrEqual(17 * 60);
  });

  it("threads the task category through rescheduleDay", () => {
    const today = "2026-11-17";
    const t = task({ date: today, startMinute: 9 * 60, categoryKey: "CREATIVITY" });
    const p = rescheduleDay({
      today,
      nowMinute: 10 * 60,
      todayTasks: [t],
      todayCtx: ctx(today, { windows: [{ categoryKey: "CREATIVITY", kind: "AVOID", start: 10 * 60, end: 20 * 60 }] }),
      laterDays: [],
      weekEnd: today,
      gap: 10,
      mode: "NORMAL",
    });
    expect(p.changes[0].to!.start).toBeGreaterThanOrEqual(20 * 60);
  });
});

describe("rest days", () => {
  const weekStart = "2026-11-16"; // Monday
  // Saturday + Sunday are rest days.
  const days = () => Array.from({ length: 7 }, (_, i) => ctx(addDays(weekStart, i), { restDay: i >= 5 }));

  it("planWeek keeps non-essential targets and recurring items off rest days", () => {
    const rec = (id: string, kind: "RECURRING" | "FIXED" | "HIGH_PRIORITY") => ({
      id,
      title: `Rec ${kind}`,
      categoryKey: "PERSONAL" as const,
      kind,
      priority: "MEDIUM" as const,
      durationMin: 30,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      preferredStart: 8 * 60,
      startDate: "2026-11-01",
      endDate: null,
      modes: ["NORMAL" as const],
      canSkip: false,
    });
    const p = planWeek({
      weekStart,
      mode: "NORMAL",
      days: days(),
      targets: [{ key: "ai-learning", label: "AI learning", categoryKey: "AI", unit: "MINUTES", target: 420, covered: 0, blockMin: 60, preferredStart: null, autoPlan: true, optional: false }],
      recurring: [rec("plain", "RECURRING"), rec("fixed", "FIXED"), rec("hp", "HIGH_PRIORITY")],
      existingDedupeKeys: new Set(),
      carryover: [],
      gap: 10,
    });
    const weekend = new Set([addDays(weekStart, 5), addDays(weekStart, 6)]);
    const onRest = p.changes.filter((c) => c.to && weekend.has(c.to.date));
    expect(onRest.length).toBe(4); // fixed + high-priority recurring on Sat and Sun
    for (const c of onRest) expect(["FIXED", "HIGH_PRIORITY"]).toContain(c.create?.kind);
    expect(p.changes.some((c) => c.categoryKey === "AI" && weekend.has(c.to!.date))).toBe(false);
    expect(p.suggestions.some((s) => s.includes("rest day"))).toBe(true);
  });

  it("planWeek may still place essential targets on rest days, but only after other days", () => {
    const p = planWeek({
      weekStart,
      mode: "NORMAL",
      days: days(),
      targets: [{ key: "study", label: "Study", categoryKey: "ACADEMICS", unit: "SESSIONS", target: 5, covered: 0, blockMin: 60, preferredStart: null, autoPlan: true, optional: false }],
      recurring: [],
      existingDedupeKeys: new Set(),
      carryover: [],
      gap: 10,
    });
    const dates = p.changes.map((c) => c.to!.date).sort();
    expect(dates).toEqual(Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)));
  });

  it("planWeek keeps non-essential carry-over off rest days", () => {
    const carry = task({ date: "2026-11-12", status: "MISSED", kind: "FLEXIBLE" });
    const restAllWeekButSunday = Array.from({ length: 7 }, (_, i) => ctx(addDays(weekStart, i), { restDay: i !== 6 }));
    const p = planWeek({ weekStart, mode: "NORMAL", days: restAllWeekButSunday, targets: [], recurring: [], existingDedupeKeys: new Set(), carryover: [carry], gap: 10 });
    expect(p.changes[0].to!.date).toBe(addDays(weekStart, 6));
  });

  it("rescheduleDay does not move non-essential overflow onto a rest day", () => {
    const today = "2026-11-20"; // Friday (full)
    const todayCtx = ctx(today, { focusLimit: 60, focusUsed: 60, tasksCount: 1 });
    const later = [ctx("2026-11-21", { restDay: true }), ctx("2026-11-22", { restDay: true }), ctx("2026-11-23")];
    const flexible = task({ date: today, startMinute: 9 * 60, kind: "FLEXIBLE" });
    const urgent = task({ date: today, startMinute: 9 * 60, kind: "FLEXIBLE", deadline: "2026-11-21" });
    const p = rescheduleDay({ today, nowMinute: 10 * 60, todayTasks: [flexible, urgent], todayCtx, laterDays: later, weekEnd: "2026-11-23", gap: 10, mode: "NORMAL" });
    const moveOf = (id: string) => p.changes.find((c) => c.taskId === id);
    expect(moveOf(flexible.id)?.to?.date).toBe("2026-11-23");
    expect(moveOf(urgent.id)?.to?.date).toBe("2026-11-21");
  });

  it("rescheduleDay does not pull earlier missed work into a rest day", () => {
    const today = "2026-11-21"; // Saturday, rest day
    const missed = task({ date: "2026-11-19", startMinute: 9 * 60, status: "MISSED", kind: "FLEXIBLE" });
    const p = rescheduleDay({
      today,
      nowMinute: 8 * 60,
      todayTasks: [missed],
      todayCtx: ctx(today, { restDay: true }),
      laterDays: [ctx("2026-11-22", { restDay: true }), ctx("2026-11-23")],
      weekEnd: "2026-11-23",
      gap: 10,
      mode: "NORMAL",
    });
    expect(p.changes[0]?.to?.date).toBe("2026-11-23");
  });

  it("resolveConflicts does not move non-essential work onto a rest day", () => {
    const date = "2026-11-20";
    const t = task({ date, startMinute: 18 * 60, durationMin: 60 });
    const p = resolveConflicts({
      date,
      newBlock: { start: 7 * 60, end: 23 * 60, label: "Wedding" },
      tasksOnDate: [t],
      dayCtx: ctx(date, { busy: [{ start: 7 * 60, end: 23 * 60 }] }),
      laterDays: [ctx("2026-11-21", { restDay: true }), ctx("2026-11-22", { restDay: true })],
      weekEnd: "2026-11-22",
      gap: 10,
    });
    expect(p.changes[0].action).toBe("UNSCHEDULE");
  });
});

describe("rhythm edge cases", () => {
  it("essential overflow uses a regular day before a roomier rest day", () => {
    const today = "2026-11-20"; // Friday (full)
    const todayCtx = ctx(today, { focusLimit: 60, focusUsed: 60, tasksCount: 1 });
    // Saturday is an empty rest day; Monday already has some work planned.
    const later = [ctx("2026-11-21", { restDay: true }), ctx("2026-11-23", { focusUsed: 120, tasksCount: 2 })];
    const critical = task({ date: today, startMinute: 9 * 60, priority: "CRITICAL" });
    const p = rescheduleDay({ today, nowMinute: 10 * 60, todayTasks: [critical], todayCtx, laterDays: later, weekEnd: "2026-11-23", gap: 10, mode: "NORMAL" });
    expect(p.changes[0].to?.date).toBe("2026-11-23");
  });

  it("essential overflow still lands on a rest day when it is the only option", () => {
    const today = "2026-11-20";
    const todayCtx = ctx(today, { focusLimit: 60, focusUsed: 60, tasksCount: 1 });
    const later = [ctx("2026-11-21", { restDay: true }), ctx("2026-11-23", { focusLimit: 60, focusUsed: 60, tasksCount: 1 })];
    const critical = task({ date: today, startMinute: 9 * 60, priority: "CRITICAL" });
    const p = rescheduleDay({ today, nowMinute: 10 * 60, todayTasks: [critical], todayCtx, laterDays: later, weekEnd: "2026-11-23", gap: 10, mode: "NORMAL" });
    expect(p.changes[0].to?.date).toBe("2026-11-21");
  });

  it("planWeek keeps FIXED recurring commitments at their chosen time despite energy windows", () => {
    const weekStart = "2026-11-16";
    const days = Array.from({ length: 7 }, (_, i) =>
      ctx(addDays(weekStart, i), { windows: [{ categoryKey: null, kind: "AVOID", start: 7 * 60, end: 9 * 60 }] }),
    );
    const p = planWeek({
      weekStart,
      mode: "NORMAL",
      days,
      targets: [],
      recurring: [
        { id: "class", title: "Morning class", categoryKey: "ACADEMICS", kind: "FIXED", priority: "HIGH", durationMin: 60, daysOfWeek: [1], preferredStart: 8 * 60, startDate: "2026-11-01", endDate: null, modes: ["NORMAL"], canSkip: false },
        { id: "read", title: "Reading", categoryKey: "PERSONAL", kind: "RECURRING", priority: "MEDIUM", durationMin: 30, daysOfWeek: [1], preferredStart: 8 * 60, startDate: "2026-11-01", endDate: null, modes: ["NORMAL"], canSkip: false },
      ],
      existingDedupeKeys: new Set(),
      carryover: [],
      gap: 10,
    });
    const byTitle = (t: string) => p.changes.find((c) => c.title === t)!;
    expect(byTitle("Morning class").to!.start).toBe(8 * 60);
    const reading = byTitle("Reading").to!.start!;
    expect(reading >= 9 * 60).toBe(true);
  });

  it("rescheduleDay leaves work that still fits in place instead of pulling it into a PREFER window", () => {
    const today = "2026-11-17";
    const fits = task({ date: today, startMinute: 18 * 60, categoryKey: "ACADEMICS" });
    const avoided = task({ date: today, startMinute: 15 * 60, categoryKey: "ACADEMICS" });
    const p = rescheduleDay({
      today,
      nowMinute: 10 * 60,
      todayTasks: [fits, avoided],
      todayCtx: ctx(today, {
        windows: [
          { categoryKey: "ACADEMICS", kind: "PREFER", start: 20 * 60, end: 22 * 60 },
          { categoryKey: "ACADEMICS", kind: "AVOID", start: 14 * 60, end: 16 * 60 },
        ],
      }),
      laterDays: [],
      weekEnd: today,
      gap: 10,
      mode: "NORMAL",
    });
    // The 18:00 task already fits: no change proposed for it.
    expect(p.changes.find((c) => c.taskId === fits.id)).toBeUndefined();
    // The task inside an AVOID window is moved, and into the PREFER window.
    const moved = p.changes.find((c) => c.taskId === avoided.id)!;
    expect(moved.action).toBe("MOVE");
    expect(moved.to!.start!).toBeGreaterThanOrEqual(20 * 60);
    expect(moved.to!.start! + 60).toBeLessThanOrEqual(22 * 60);
  });

  it("falls back outside a PREFER window when an AVOID window covers it, never inside the AVOID window", () => {
    const d = ctx("2026-11-17", {
      windows: [
        { categoryKey: "FITNESS", kind: "PREFER", start: 6 * 60, end: 8 * 60 },
        { categoryKey: "FITNESS", kind: "AVOID", start: 7 * 60, end: 8 * 60 },
      ],
    });
    // 07:00 wake + AVOID 07:00–08:00 leaves no room inside the PREFER window → falls back, never inside AVOID.
    const start = findSlot(d, 45, { preferred: 7 * 60, gap: 10, categoryKey: "FITNESS" });
    expect(start).not.toBeNull();
    expect(start!).toBeGreaterThanOrEqual(8 * 60);
  });
});
