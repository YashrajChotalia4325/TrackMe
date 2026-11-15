import "server-only";
import { db } from "./db";
import { CATEGORY_KEYS, CATEGORY_META, DEFAULT_WEEKLY_TARGETS, DEFAULT_WEIGHTS } from "@/lib/domain/constants";
import { ACHIEVEMENTS } from "@/lib/domain/achievements";
import { INITIAL_EXAM_PERIOD, INITIAL_GOALS, INITIAL_PROFILE } from "@/lib/domain/initial-context";
import { todayIn } from "@/lib/time";

export const DEFAULT_NOTIFICATION_PREFS = {
  deadlines: true,
  exams: true,
  pendingImportant: true,
  weeklyReview: true,
  monthlyReview: true,
  milestones: true,
  weeklyTargets: true,
};

export async function ensureAchievementCatalog() {
  for (const a of ACHIEVEMENTS) {
    await db.achievement.upsert({
      where: { key: a.key },
      update: { title: a.title, description: a.description, icon: a.icon, xp: a.xp },
      create: { key: a.key, title: a.title, description: a.description, icon: a.icon, xp: a.xp },
    });
  }
}

/**
 * Create default settings, categories and weekly targets for a new user.
 * The first account on an instance also receives the initial personal context
 * (profile, known exam period, long-term goals). Idempotent.
 */
export async function bootstrapUser(userId: string, name: string) {
  const isOwner = (await db.user.count()) <= 1;

  await db.userSettings.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      weightsNormal: DEFAULT_WEIGHTS.NORMAL,
      weightsExam: DEFAULT_WEIGHTS.EXAM,
      weightsRecovery: DEFAULT_WEIGHTS.RECOVERY,
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    },
  });

  const profile = isOwner ? { ...INITIAL_PROFILE, displayName: name || INITIAL_PROFILE.displayName } : { displayName: name };
  await db.profile.upsert({ where: { userId }, update: {}, create: { userId, ...profile } });

  for (const [i, key] of CATEGORY_KEYS.entries()) {
    const meta = CATEGORY_META[key];
    await db.category.upsert({
      where: { userId_key: { userId, key } },
      update: {},
      create: { userId, key, name: meta.name, color: meta.color, icon: meta.icon, priority: 10 - i },
    });
  }
  const categories = await db.category.findMany({ where: { userId } });
  const catId = (k: string) => categories.find((c) => c.key === k)!.id;

  for (const [i, t] of DEFAULT_WEEKLY_TARGETS.entries()) {
    await db.weeklyTarget.upsert({
      where: { userId_key: { userId, key: t.key } },
      update: {},
      create: {
        userId,
        key: t.key,
        label: t.label,
        categoryId: catId(t.category),
        unit: t.unit,
        normalTarget: t.normal,
        examTarget: t.exam,
        recoveryTarget: t.recovery,
        blockMin: t.blockMin,
        autoPlan: t.autoPlan,
        optionalInExam: t.optionalInExam,
        sortOrder: i,
      },
    });
  }

  await ensureAchievementCatalog();

  if (isOwner) {
    const hasExam = await db.examPeriod.count({ where: { userId } });
    if (!hasExam) await db.examPeriod.create({ data: { userId, ...INITIAL_EXAM_PERIOD } });

    const hasGoals = await db.goal.count({ where: { userId } });
    if (!hasGoals) {
      const today = todayIn();
      for (const [i, g] of INITIAL_GOALS.entries()) {
        await db.goal.create({
          data: {
            userId,
            title: g.title,
            description: g.description,
            categoryId: catId(g.category),
            startDate: today < "2026-11-01" ? today : "2026-11-01",
            targetDate: g.targetDate,
            priority: g.priority,
            status: "IN_PROGRESS",
            sortOrder: i,
            milestones: { create: g.milestones.map((m, j) => ({ title: m.title, targetDate: m.targetDate, order: j })) },
          },
        });
      }
    }

    const hasStory = await db.creativeProject.count({ where: { userId } });
    if (!hasStory) {
      await db.creativeProject.create({
        data: {
          userId,
          title: "My story",
          logline: "Rename this and add your logline.",
          milestones: {
            create: [
              { title: "Re-read existing material", order: 0 },
              { title: "Outline the plot", order: 1 },
              { title: "Develop main characters", order: 2 },
              { title: "Write the treatment", order: 3 },
              { title: "First screenplay draft", order: 4 },
            ],
          },
        },
      });
    }
  }
}
