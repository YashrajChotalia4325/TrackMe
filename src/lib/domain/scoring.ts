/**
 * Daily scoring.
 *
 * Rules (from the product spec):
 * - Score is 0–100, built from per-category weights for the active mode.
 * - Only categories with eligible tasks that day participate; the weights of
 *   inactive categories are redistributed proportionally to active ones.
 * - Completed tasks earn their share; partially completed tasks earn partial
 *   credit (completionPct); skipped tasks with an approved reason are removed
 *   from the denominator — they are not failures.
 * - Optional tasks only count if they were done (they never drag the score down).
 * - Rescheduled tasks belong to the day they were moved to.
 * - The weights used are snapshotted so historic scores never change when the
 *   user edits weights later.
 */
import { SCORED_CATEGORIES, type CategoryKeyT, type Weights } from "./constants";

export interface ScoreTask {
  categoryKey: CategoryKeyT;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "RESCHEDULED" | "MISSED";
  kind: "FIXED" | "HIGH_PRIORITY" | "RECURRING" | "FLEXIBLE" | "OPTIONAL";
  durationMin: number;
  completionPct: number;
  skipApproved: boolean;
}

export interface CategoryBreakdown {
  key: CategoryKeyT;
  weight: number; // effective (redistributed) weight
  credit: number; // 0..1
  points: number; // weight * credit
  done: number;
  total: number;
}

export interface DailyScoreResult {
  score: number;
  breakdown: CategoryBreakdown[];
  tasksDone: number;
  tasksTotal: number;
  activeWeightTotal: number;
}

function taskCredit(t: ScoreTask): number {
  if (t.status === "COMPLETED") return t.completionPct > 0 ? Math.min(t.completionPct, 100) / 100 : 1;
  if (t.status === "IN_PROGRESS") return Math.min(t.completionPct, 100) / 100;
  if (t.status === "SKIPPED" || t.status === "MISSED" || t.status === "PENDING") {
    return Math.min(t.completionPct, 100) / 100; // partial credit if recorded
  }
  return 0;
}

/** Whether a task is part of the day's denominator. */
export function isEligible(t: ScoreTask): boolean {
  if (t.status === "RESCHEDULED") return false;
  if (t.status === "SKIPPED" && t.skipApproved) return false;
  if (t.kind === "OPTIONAL" && t.status !== "COMPLETED" && t.completionPct === 0) return false;
  return true;
}

export function computeDailyScore(tasks: ScoreTask[], weights: Weights): DailyScoreResult {
  const byCat = new Map<CategoryKeyT, ScoreTask[]>();
  for (const t of tasks) {
    if (!SCORED_CATEGORIES.includes(t.categoryKey)) continue;
    if (!isEligible(t)) continue;
    const list = byCat.get(t.categoryKey) ?? [];
    list.push(t);
    byCat.set(t.categoryKey, list);
  }

  const active = [...byCat.keys()].filter((k) => (weights[k] ?? 0) > 0);
  const activeWeightTotal = active.reduce((s, k) => s + (weights[k] ?? 0), 0);

  const breakdown: CategoryBreakdown[] = [];
  let score = 0;
  let tasksDone = 0;
  let tasksTotal = 0;

  for (const key of active) {
    const list = byCat.get(key)!;
    // Weight tasks by duration so a 2h exam block matters more than a 10m check-in.
    const totalW = list.reduce((s, t) => s + Math.max(t.durationMin, 15), 0);
    const earned = list.reduce((s, t) => s + Math.max(t.durationMin, 15) * taskCredit(t), 0);
    const credit = totalW > 0 ? earned / totalW : 0;
    const weight = activeWeightTotal > 0 ? ((weights[key] ?? 0) / activeWeightTotal) * 100 : 0;
    const points = weight * credit;
    const done = list.filter((t) => t.status === "COMPLETED").length;
    score += points;
    tasksDone += done;
    tasksTotal += list.length;
    breakdown.push({ key, weight: round1(weight), credit: round2(credit), points: round1(points), done, total: list.length });
  }

  return {
    score: Math.round(Math.min(100, Math.max(0, score))),
    breakdown: breakdown.sort((a, b) => b.weight - a.weight),
    tasksDone,
    tasksTotal,
    activeWeightTotal,
  };
}

/** XP: 10 per completed task (scaled by duration, capped), plus achievement XP. */
export function taskXp(durationMin: number, completionPct: number): number {
  const base = Math.min(30, Math.max(5, Math.round(durationMin / 6)));
  return Math.round(base * (completionPct > 0 ? completionPct / 100 : 1));
}

/** Level curve: each level needs 15% more XP than the previous, starting at 250. */
export function levelFor(xp: number): { level: number; current: number; next: number; progress: number } {
  let level = 1;
  let need = 250;
  let remaining = xp;
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = Math.round(need * 1.15);
  }
  return { level, current: remaining, next: need, progress: remaining / need };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
