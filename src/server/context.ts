import "server-only";
import { cache } from "react";
import { db } from "./db";
import { requireUserId } from "./auth";
import { nowIn, weekStart } from "@/lib/time";
import type { CategoryKeyT, ModeT, Weights } from "@/lib/domain/constants";
import { bootstrapUser } from "./bootstrap";

export type UserContext = Awaited<ReturnType<typeof loadContext>>;

async function loadContext(userId: string) {
  let settings = await db.userSettings.findUnique({ where: { userId } });
  if (!settings) {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await bootstrapUser(userId, user.name);
    settings = await db.userSettings.findUniqueOrThrow({ where: { userId } });
  }
  const [profile, categories] = await Promise.all([
    db.profile.findUnique({ where: { userId } }),
    db.category.findMany({ where: { userId }, orderBy: { priority: "desc" } }),
  ]);
  const tz = settings.timezone;
  const now = nowIn(tz);
  const mode = settings.mode as ModeT;
  const weights = (mode === "EXAM" ? settings.weightsExam : mode === "RECOVERY" ? settings.weightsRecovery : settings.weightsNormal) as Weights;
  const catById = new Map(categories.map((c) => [c.id, c]));
  const catByKey = new Map(categories.map((c) => [c.key as CategoryKeyT, c]));
  return {
    userId,
    settings,
    profile,
    categories,
    catById,
    catByKey,
    tz,
    today: now.date,
    nowMinute: now.minute,
    weekStart: weekStart(now.date),
    mode,
    weights,
    name: profile?.displayName ?? "there",
  };
}

/** Signed-in user's context (settings, categories, today in their TZ). */
export const getContext = cache(async () => {
  const userId = await requireUserId();
  return loadContext(userId);
});
