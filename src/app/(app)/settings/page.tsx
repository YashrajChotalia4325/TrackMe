import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { PageHeader, Panel } from "@/components/common/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewTargetForm, NotificationPrefs, ProfileForm, RecurringList, ScheduleForm, UndoVersionButton, WeightsForm } from "@/components/settings/settings-forms";
import { TargetRow, TimetableEditor, WorkEditor } from "@/components/config/editors";
import { ExportButtons } from "@/components/analytics/export-buttons";
import { RhythmTab } from "@/components/settings/rhythm-tab";
import { PersonalizeTab } from "@/components/settings/personalize-tab";
import { formatDate, formatMinute } from "@/lib/time";
import type { CategoryKeyT, ModeT } from "@/lib/domain/constants";

export const metadata = { title: "Settings" };

const ACTION_LABEL: Record<string, string> = { CREATE: "Created", MOVE: "Moved", SKIP: "Skipped", STATUS: "Status", UNSCHEDULE: "Unscheduled", RESTORE: "Restored" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const TABS = ["schedule", "rhythm", "personalize", "targets", "scoring", "commitments", "profile", "notifications", "history"];
  const initialTab = typeof sp.tab === "string" && TABS.includes(sp.tab) ? sp.tab : "schedule";
  const ctx = await getContext();
  const s = ctx.settings;
  const [user, targets, slots, work, recurring, versions, changes] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: ctx.userId } }),
    db.weeklyTarget.findMany({ where: { userId: ctx.userId }, orderBy: { sortOrder: "asc" } }),
    db.timetableSlot.findMany({ where: { userId: ctx.userId } }),
    db.workBlock.findMany({ where: { userId: ctx.userId } }),
    db.recurringTask.findMany({ where: { userId: ctx.userId }, include: { category: true }, orderBy: [{ active: "desc" }, { createdAt: "desc" }] }),
    db.scheduleVersion.findMany({ where: { userId: ctx.userId, status: { in: ["APPLIED", "UNDONE"] } }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.scheduleChange.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  const p = ctx.profile;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Change any target or preference — no rebuild needed." actions={<ExportButtons />} />
      <Tabs defaultValue={initialTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="rhythm">Day rhythm</TabsTrigger>
          <TabsTrigger value="personalize">Personalize</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="commitments">Commitments</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-4">
          <Panel>
            <ScheduleForm
              initial={{
                timezone: s.timezone,
                wakeMinute: s.wakeMinute,
                sleepMinute: s.sleepMinute,
                dailyFocusLimitMin: s.dailyFocusLimitMin,
                dailyTaskLimit: s.dailyTaskLimit,
                breakMinutes: s.breakMinutes,
                minRestBetweenMin: s.minRestBetweenMin,
                preferEarlierHours: s.preferEarlierHours,
                planningStart: s.planningStart,
                planningEnd: s.planningEnd,
                catTargetDate: s.catTargetDate,
                gymDays: s.gymDays,
                gymPreferredStart: s.gymPreferredStart,
                gymDurationMin: s.gymDurationMin,
                aiDailyMin: s.aiDailyMin,
                aiWeeklyMin: s.aiWeeklyMin,
                aiMonthlyMin: s.aiMonthlyMin,
                sleepTargetHours: s.sleepTargetHours,
                waterTargetMl: s.waterTargetMl,
              }}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="rhythm" className="mt-4">
          <RhythmTab />
        </TabsContent>

        <TabsContent value="personalize" className="mt-4">
          <PersonalizeTab />
        </TabsContent>

        <TabsContent value="targets" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">Weekly targets per mode. “Auto-plan” lets the weekly planner create sessions toward a target; progress is always measured from what you actually log.</p>
          {targets.map((t) => (
            <TargetRow key={t.id} target={{ id: t.id, key: t.key, label: t.label, unit: t.unit, normalTarget: t.normalTarget, examTarget: t.examTarget, recoveryTarget: t.recoveryTarget, blockMin: t.blockMin, preferredStart: t.preferredStart, autoPlan: t.autoPlan, active: t.active }} />
          ))}
          <NewTargetForm categories={ctx.categories.map((c) => ({ id: c.id, name: c.name }))} />
        </TabsContent>

        <TabsContent value="scoring" className="mt-4">
          <Panel title="Daily score weights" description="Per mode, must total 100">
            <WeightsForm weights={{ NORMAL: s.weightsNormal, EXAM: s.weightsExam, RECOVERY: s.weightsRecovery } as Record<ModeT, Partial<Record<CategoryKeyT, number>>>} />
          </Panel>
        </TabsContent>

        <TabsContent value="commitments" className="mt-4 space-y-6">
          <Panel title="Internship / work hours">
            <WorkEditor blocks={work.map((w) => ({ id: w.id, dayOfWeek: w.dayOfWeek, startMinute: w.startMinute, endMinute: w.endMinute, label: w.label }))} />
          </Panel>
          <Panel title="College timetable">
            <TimetableEditor slots={slots.map((x) => ({ id: x.id, dayOfWeek: x.dayOfWeek, startMinute: x.startMinute, endMinute: x.endMinute, title: x.title, location: x.location }))} />
          </Panel>
          <Panel title="Recurring tasks">
            <RecurringList items={recurring.map((r) => ({ id: r.id, title: r.title, daysOfWeek: r.daysOfWeek, preferredStart: r.preferredStart, durationMin: r.durationMin, active: r.active, category: r.category.name }))} />
          </Panel>
        </TabsContent>

        <TabsContent value="profile" className="mt-4">
          <Panel description={user.email}>
            <ProfileForm
              initial={{
                displayName: p?.displayName ?? ctx.name,
                location: p?.location ?? "",
                education: p?.education ?? "",
                college: p?.college ?? "",
                graduationTarget: p?.graduationTarget ?? "",
                currentRole: p?.currentRole ?? "",
                company: p?.company ?? "",
                currentFocus: p?.currentFocus ?? "",
                mbaObjective: p?.mbaObjective ?? "",
                mbaAdmissionTarget: p?.mbaAdmissionTarget ?? "",
                creativeAmbition: p?.creativeAmbition ?? "",
                creativeObjective: p?.creativeObjective ?? "",
                sideProject: p?.sideProject ?? "",
                image: user.image ?? "",
              }}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Panel title="In-app notifications">
            <NotificationPrefs prefs={s.notificationPrefs as Record<string, boolean>} />
          </Panel>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-6">
          <Panel title="Schedule versions" description="Automatic re-plans you approved. Undo restores tasks that haven't changed since.">
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No automatic changes applied yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{v.kind.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
                      <span className="block text-xs text-muted-foreground">
                        {v.summary} · {v.createdAt.toLocaleString("en-IN", { timeZone: ctx.tz, dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </span>
                    {v.status === "APPLIED" ? <UndoVersionButton id={v.id} /> : <span className="text-xs text-muted-foreground">Undone</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Audit trail" description="Every schedule change, manual or automatic">
            <ul className="divide-y divide-border text-sm">
              {changes.length === 0 && <li className="py-2 text-muted-foreground">No changes recorded yet.</li>}
              {changes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{c.createdAt.toLocaleString("en-IN", { timeZone: ctx.tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{ACTION_LABEL[c.action]}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.taskTitle}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.fromDate && `${formatDate(c.fromDate, "dm")}${c.fromStart != null ? ` ${formatMinute(c.fromStart)}` : ""}`}
                    {c.fromDate && c.toDate && " → "}
                    {c.toDate && `${formatDate(c.toDate, "dm")}${c.toStart != null ? ` ${formatMinute(c.toStart)}` : ""}`}
                    {c.toStatus && !c.toDate && ` → ${c.toStatus.toLowerCase()}`}
                    {c.automatic && " · auto"}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
