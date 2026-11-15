import "server-only";
import { db } from "./db";
import type { UserContext } from "./context";
import type { Task } from "@/generated/prisma/client";

/**
 * When a task that feeds a weekly target is completed, record the matching
 * tracker log (learning session, gym session, MBA activity …) so trackers and
 * targets reflect actual time. Removing completion removes only logs that
 * were created from this task.
 */
export async function syncTrackerLog(ctx: UserContext, task: Task, completed: boolean) {
  const uid = ctx.userId;
  const minutes = task.actualMin ?? Math.round((task.durationMin * (task.completionPct || 100)) / 100);

  // Always clear logs previously created from this task.
  await db.$transaction([
    db.learningSession.deleteMany({ where: { userId: uid, taskId: task.id, manual: true } }),
    db.gymSession.deleteMany({ where: { userId: uid, taskId: task.id } }),
    db.mBAActivity.deleteMany({ where: { userId: uid, taskId: task.id } }),
    db.creativeSession.deleteMany({ where: { userId: uid, taskId: task.id } }),
    db.sideProjectLog.deleteMany({ where: { userId: uid, taskId: task.id } }),
    db.professionalAchievement.deleteMany({ where: { userId: uid, taskId: task.id } }),
  ]);
  if (!completed) return;

  const target = task.weeklyTargetId ? await db.weeklyTarget.findUnique({ where: { id: task.weeklyTargetId } }) : null;
  // Only tasks explicitly tied to a target create logs; category alone is not enough.
  const key = target?.key;
  if (!key) return;

  // A timer session already linked to this task counts as the log.
  if (key === "ai-learning") {
    const timer = await db.learningSession.findFirst({ where: { userId: uid, taskId: task.id, manual: false, status: "COMPLETED" } });
    if (timer) return;
  }

  const base = { userId: uid, date: task.date, notes: task.notes ?? undefined, taskId: task.id };
  switch (key) {
    case "ai-learning":
      await db.learningSession.create({
        data: { ...base, status: "COMPLETED", startedAt: new Date(), endedAt: new Date(), durationMin: minutes, manual: true, topic: task.description ?? undefined },
      });
      break;
    case "gym":
      await db.gymSession.create({ data: { ...base, type: "STRENGTH", durationMin: minutes } });
      break;
    case "cardio":
      await db.gymSession.create({ data: { ...base, type: "CARDIO", durationMin: minutes } });
      break;
    case "mba-reading":
    case "mba-awareness":
    case "mba-communication":
    case "mba-leadership": {
      const type = ({ "mba-reading": "BUSINESS_READING", "mba-awareness": "GENERAL_AWARENESS", "mba-communication": "COMMUNICATION", "mba-leadership": "LEADERSHIP" } as const)[key];
      await db.mBAActivity.create({ data: { ...base, type, title: task.title, durationMin: minutes } });
      break;
    }
    case "creative-writing":
      await db.creativeSession.create({ data: { ...base, durationMin: minutes } });
      break;
    case "side-project":
      await db.sideProjectLog.create({ data: { ...base, durationMin: minutes } });
      break;
    case "career-achievement":
      // Documentation sessions don't create an achievement automatically — the user records it.
      break;
  }
}

