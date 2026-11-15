import "server-only";
import { db } from "./db";
import type { UserContext } from "./context";
import { addDays, type ISODate } from "@/lib/time";
import type { CategoryKeyT, ModeT } from "@/lib/domain/constants";
import type { WeeklyTarget } from "@/generated/prisma/client";

export interface TargetProgress {
  id: string;
  key: string;
  label: string;
  categoryKey: CategoryKeyT;
  unit: "MINUTES" | "SESSIONS";
  target: number;
  done: number;
  scheduled: number; // pending (not yet done) planned this week
  blockMin: number;
  preferredStart: number | null;
  autoPlan: boolean;
  optional: boolean;
}

export function targetFor(t: WeeklyTarget, mode: ModeT) {
  return mode === "EXAM" ? t.examTarget : mode === "RECOVERY" ? t.recoveryTarget : t.normalTarget;
}

const MBA_TYPES: Record<string, "BUSINESS_READING" | "GENERAL_AWARENESS" | "COMMUNICATION" | "LEADERSHIP"> = {
  "mba-reading": "BUSINESS_READING",
  "mba-awareness": "GENERAL_AWARENESS",
  "mba-communication": "COMMUNICATION",
  "mba-leadership": "LEADERSHIP",
};

/**
 * Actual progress toward each weekly target, measured from tracker logs
 * (real time spent), not from scheduled blocks.
 */
export async function weeklyTargetProgress(ctx: UserContext, start: ISODate, mode: ModeT = ctx.mode): Promise<TargetProgress[]> {
  const end = addDays(start, 6);
  const range = { gte: start, lte: end };
  const uid = ctx.userId;
  const [targets, learning, gym, mba, creative, side, pro, tasks] = await Promise.all([
    db.weeklyTarget.findMany({ where: { userId: uid, active: true }, orderBy: { sortOrder: "asc" } }),
    db.learningSession.aggregate({ where: { userId: uid, date: range, status: "COMPLETED" }, _sum: { durationMin: true } }),
    db.gymSession.groupBy({ by: ["type"], where: { userId: uid, date: range }, _count: true }),
    db.mBAActivity.groupBy({ by: ["type"], where: { userId: uid, date: range }, _count: true }),
    db.creativeSession.aggregate({ where: { userId: uid, date: range }, _sum: { durationMin: true } }),
    db.sideProjectLog.aggregate({ where: { userId: uid, date: range }, _sum: { durationMin: true } }),
    db.professionalAchievement.count({ where: { userId: uid, date: range } }),
    db.task.findMany({ where: { userId: uid, date: range, weeklyTargetId: { not: null } }, select: { weeklyTargetId: true, status: true, durationMin: true, actualMin: true, completionPct: true } }),
  ]);

  const gymCount = (types: string[]) => gym.filter((g) => types.includes(g.type)).reduce((s, g) => s + g._count, 0);

  return targets.map((t) => {
    const linked = tasks.filter((x) => x.weeklyTargetId === t.id);
    const pending = linked.filter((x) => x.status === "PENDING" || x.status === "IN_PROGRESS");
    const scheduled = t.unit === "MINUTES" ? pending.reduce((s, x) => s + x.durationMin, 0) : pending.length;
    let done: number;
    switch (t.key) {
      case "ai-learning":
        done = learning._sum.durationMin ?? 0;
        break;
      case "gym":
        done = gymCount(["STRENGTH", "SPORT", "MOBILITY", "OTHER"]);
        break;
      case "cardio":
        done = gymCount(["CARDIO"]);
        break;
      case "creative-writing":
        done = creative._sum.durationMin ?? 0;
        break;
      case "side-project":
        done = side._sum.durationMin ?? 0;
        break;
      case "career-achievement":
        done = pro;
        break;
      default:
        if (MBA_TYPES[t.key]) {
          done = mba.find((m) => m.type === MBA_TYPES[t.key])?._count ?? 0;
        } else {
          const completed = linked.filter((x) => x.status === "COMPLETED");
          done =
            t.unit === "MINUTES"
              ? completed.reduce((s, x) => s + (x.actualMin ?? Math.round((x.durationMin * (x.completionPct || 100)) / 100)), 0)
              : completed.length;
        }
    }
    return {
      id: t.id,
      key: t.key,
      label: t.label,
      categoryKey: (ctx.catById.get(t.categoryId)?.key ?? "PERSONAL") as CategoryKeyT,
      unit: t.unit,
      target: targetFor(t, mode),
      done,
      scheduled,
      blockMin: t.blockMin,
      preferredStart: t.preferredStart,
      autoPlan: t.autoPlan,
      optional: mode === "EXAM" ? t.optionalInExam : false,
    };
  });
}
