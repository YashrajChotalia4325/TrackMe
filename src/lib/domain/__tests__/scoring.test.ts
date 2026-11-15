import { describe, expect, it } from "vitest";
import { computeDailyScore, levelFor, type ScoreTask } from "../scoring";
import { DEFAULT_WEIGHTS } from "../constants";

const t = (over: Partial<ScoreTask>): ScoreTask => ({
  categoryKey: "AI",
  status: "PENDING",
  kind: "FLEXIBLE",
  durationMin: 60,
  completionPct: 0,
  skipApproved: false,
  ...over,
});

describe("computeDailyScore", () => {
  it("scores 100 when every eligible task is complete", () => {
    const r = computeDailyScore(
      [t({ categoryKey: "AI", status: "COMPLETED" }), t({ categoryKey: "FITNESS", status: "COMPLETED" })],
      DEFAULT_WEIGHTS.NORMAL,
    );
    expect(r.score).toBe(100);
  });

  it("redistributes weight of categories with no tasks", () => {
    // Only AI (15) and FITNESS (15) active → each becomes 50.
    const r = computeDailyScore(
      [t({ categoryKey: "AI", status: "COMPLETED" }), t({ categoryKey: "FITNESS", status: "PENDING" })],
      DEFAULT_WEIGHTS.NORMAL,
    );
    expect(r.score).toBe(50);
    expect(r.breakdown.find((b) => b.key === "AI")!.weight).toBe(50);
  });

  it("gives partial credit", () => {
    const r = computeDailyScore([t({ status: "COMPLETED", completionPct: 50 })], DEFAULT_WEIGHTS.NORMAL);
    expect(r.score).toBe(50);
  });

  it("does not punish approved skips", () => {
    const r = computeDailyScore(
      [t({ status: "COMPLETED" }), t({ categoryKey: "CREATIVITY", status: "SKIPPED", skipApproved: true })],
      DEFAULT_WEIGHTS.NORMAL,
    );
    expect(r.score).toBe(100);
  });

  it("counts unapproved skips as missed", () => {
    const r = computeDailyScore(
      [t({ status: "COMPLETED" }), t({ categoryKey: "CREATIVITY", status: "SKIPPED" })],
      { AI: 50, CREATIVITY: 50 },
    );
    expect(r.score).toBe(50);
  });

  it("ignores pending optional tasks", () => {
    const r = computeDailyScore([t({ status: "COMPLETED" }), t({ kind: "OPTIONAL", categoryKey: "MBA" })], DEFAULT_WEIGHTS.NORMAL);
    expect(r.score).toBe(100);
  });

  it("uses exam-mode weights (creativity excluded)", () => {
    const r = computeDailyScore(
      [t({ categoryKey: "ACADEMICS", status: "COMPLETED" }), t({ categoryKey: "CREATIVITY" })],
      DEFAULT_WEIGHTS.EXAM,
    );
    expect(r.score).toBe(100);
  });

  it("returns 0 with no tasks", () => {
    expect(computeDailyScore([], DEFAULT_WEIGHTS.NORMAL).score).toBe(0);
  });
});

describe("levelFor", () => {
  it("levels up progressively", () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(250).level).toBe(2);
    expect(levelFor(249).progress).toBeCloseTo(249 / 250);
  });
});
