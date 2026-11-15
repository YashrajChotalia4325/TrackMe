import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const ctx = await getContext();
  const [slots, work, targets, periods, exams] = await Promise.all([
    db.timetableSlot.findMany({ where: { userId: ctx.userId }, orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] }),
    db.workBlock.findMany({ where: { userId: ctx.userId }, orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] }),
    db.weeklyTarget.findMany({ where: { userId: ctx.userId }, orderBy: { sortOrder: "asc" } }),
    db.examPeriod.findMany({ where: { userId: ctx.userId }, orderBy: { startDate: "asc" } }),
    db.event.findMany({ where: { userId: ctx.userId, type: { in: ["EXAM", "INTERNAL_EXAM", "PRACTICAL_EXAM", "VIVA"] } }, orderBy: { date: "asc" } }),
  ]);
  const s = ctx.settings;
  return (
    <OnboardingWizard
      today={ctx.today}
      profile={{
        displayName: ctx.profile?.displayName ?? ctx.name,
        location: ctx.profile?.location ?? "",
        education: ctx.profile?.education ?? "",
        college: ctx.profile?.college ?? "",
        graduationTarget: ctx.profile?.graduationTarget ?? "",
        currentRole: ctx.profile?.currentRole ?? "",
        company: ctx.profile?.company ?? "",
      }}
      settings={{
        wakeMinute: s.wakeMinute,
        sleepMinute: s.sleepMinute,
        dailyFocusLimitMin: s.dailyFocusLimitMin,
        dailyTaskLimit: s.dailyTaskLimit,
        gymDays: s.gymDays,
        gymPreferredStart: s.gymPreferredStart,
        gymDurationMin: s.gymDurationMin,
        aiDailyMin: s.aiDailyMin,
        aiWeeklyMin: s.aiWeeklyMin,
        aiMonthlyMin: s.aiMonthlyMin,
      }}
      slots={slots.map((x) => ({ id: x.id, dayOfWeek: x.dayOfWeek, startMinute: x.startMinute, endMinute: x.endMinute, title: x.title, location: x.location }))}
      work={work.map((w) => ({ id: w.id, dayOfWeek: w.dayOfWeek, startMinute: w.startMinute, endMinute: w.endMinute, label: w.label }))}
      targets={targets.map((t) => ({ id: t.id, key: t.key, label: t.label, unit: t.unit, normalTarget: t.normalTarget, examTarget: t.examTarget, recoveryTarget: t.recoveryTarget, blockMin: t.blockMin, preferredStart: t.preferredStart, autoPlan: t.autoPlan, active: t.active }))}
      periods={periods.map((p) => ({ id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate, leadDays: p.leadDays }))}
      exams={exams.map((e) => ({ id: e.id, title: e.title, date: e.date, startMinute: e.startMinute }))}
    />
  );
}
