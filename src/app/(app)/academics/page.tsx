import { BookOpenCheck, CalendarClock, GraduationCap, ListChecks } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { taskFormOptions, toTaskView } from "@/server/queries";
import { PageHeader, Panel, Stat } from "@/components/common/ui";
import { ExamEditor, TimetableEditor } from "@/components/config/editors";
import { ExamModeToggle, SubjectList } from "@/components/trackers/academics";
import { AddEventButton } from "@/components/calendar/event-form-dialog";
import { AddTaskButton } from "@/components/tasks/task-board";
import { TaskItem } from "@/components/tasks/task-item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDays, diffDays, formatDate, formatMinute } from "@/lib/time";
import { EVENT_TYPE_META } from "@/lib/domain/constants";

export const metadata = { title: "Academics" };

const EXAM_TYPES = ["EXAM", "INTERNAL_EXAM", "PRACTICAL_EXAM", "VIVA"] as const;
const DEADLINE_TYPES = ["ASSIGNMENT", "PROJECT_SUBMISSION", "COLLEGE_EVENT", "HOLIDAY"] as const;

export default async function AcademicsPage() {
  const ctx = await getContext();
  const academics = ctx.catByKey.get("ACADEMICS")!;
  const [subjects, slots, periods, exams, deadlines, tasks, options] = await Promise.all([
    db.universitySubject.findMany({ where: { userId: ctx.userId }, include: { _count: { select: { slots: true } } }, orderBy: { name: "asc" } }),
    db.timetableSlot.findMany({ where: { userId: ctx.userId }, orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] }),
    db.examPeriod.findMany({ where: { userId: ctx.userId }, orderBy: { startDate: "asc" } }),
    db.event.findMany({ where: { userId: ctx.userId, type: { in: [...EXAM_TYPES] } }, orderBy: [{ date: "asc" }, { startMinute: "asc" }] }),
    db.event.findMany({ where: { userId: ctx.userId, type: { in: [...DEADLINE_TYPES] }, date: { gte: ctx.today } }, orderBy: { date: "asc" }, take: 15 }),
    db.task.findMany({ where: { userId: ctx.userId, categoryId: academics.id, date: { gte: ctx.today, lte: addDays(ctx.today, 14) }, status: { in: ["PENDING", "IN_PROGRESS"] } }, orderBy: [{ date: "asc" }, { startMinute: "asc" }], take: 12 }),
    taskFormOptions(ctx),
  ]);
  const nextPeriod = periods.find((p) => p.endDate >= ctx.today);
  const nextExam = exams.find((e) => e.date >= ctx.today);
  const gradDays = ctx.profile?.graduationTarget ? diffDays(`${ctx.profile.graduationTarget}-30`.slice(0, 10), ctx.today) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ctx.profile?.college ?? "Academics"}
        title={ctx.profile?.education ?? "Academics"}
        description="Lectures, practicals, exams and deadlines. University exams are fixed — they are never moved automatically."
        actions={
          <>
            <AddEventButton today={ctx.today} label="Add deadline" defaultType="ASSIGNMENT" />
            <AddTaskButton options={options} label="Study task" variant="outline" categoryKey="ACADEMICS" />
            <ExamModeToggle mode={ctx.mode} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={nextPeriod ? nextPeriod.name : "Exam period"} value={nextPeriod ? (diffDays(nextPeriod.startDate, ctx.today) > 0 ? `${diffDays(nextPeriod.startDate, ctx.today)} days` : "In progress") : "—"} hint={nextPeriod ? `${formatDate(nextPeriod.startDate, "dm")} – ${formatDate(nextPeriod.endDate, "dm")}` : "None upcoming"} icon={CalendarClock} tone="accent" />
        <Stat label="Next paper" value={nextExam ? `${diffDays(nextExam.date, ctx.today)}d` : "—"} hint={nextExam ? nextExam.title : "Add papers when announced"} icon={BookOpenCheck} />
        <Stat label="Subjects" value={subjects.length} hint={`${slots.length} weekly slots`} icon={ListChecks} />
        <Stat label="Graduation" value={gradDays != null ? `${gradDays} days` : "—"} hint={ctx.profile?.graduationTarget ? `Target ${ctx.profile.graduationTarget}` : "Set in Settings"} icon={GraduationCap} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Study tasks" description="Next 14 days">
          {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No study tasks scheduled. In Examination mode the weekly planner adds preparation blocks automatically.</p> : <div className="space-y-2">{tasks.map((t) => <TaskItem key={t.id} task={toTaskView(t, ctx)} showDate />)}</div>}
        </Panel>
        <Panel title="Upcoming deadlines">
          {deadlines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments or submissions added.</p>
          ) : (
            <ul className="space-y-2">
              {deadlines.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-[8px] border-2 border-ink bg-card px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{e.title}</span>
                    <span className="text-xs text-muted-foreground">{EVENT_TYPE_META[e.type]?.label}</span>
                  </span>
                  <span className="shrink-0 rounded-[6px] border-2 border-ink bg-block-sky px-1.5 py-px font-mono text-[11px] leading-4 font-medium text-ink tabular-nums">
                    {formatDate(e.date, "weekday")}
                    {e.startMinute != null && ` · ${formatMinute(e.startMinute)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Tabs defaultValue="timetable">
        <TabsList>
          <TabsTrigger value="timetable">Timetable</TabsTrigger>
          <TabsTrigger value="exams">Examinations</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
        </TabsList>
        <TabsContent value="timetable" className="mt-4">
          <Panel description="Weekly lectures and practicals appear in your calendar and are protected from scheduling. Holidays automatically free up the day.">
            <TimetableEditor slots={slots.map((s) => ({ id: s.id, dayOfWeek: s.dayOfWeek, startMinute: s.startMinute, endMinute: s.endMinute, title: s.title, location: s.location }))} />
          </Panel>
        </TabsContent>
        <TabsContent value="exams" className="mt-4">
          <Panel>
            <ExamEditor periods={periods.map((p) => ({ id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate, leadDays: p.leadDays }))} exams={exams.map((e) => ({ id: e.id, title: e.title, date: e.date, startMinute: e.startMinute }))} />
          </Panel>
        </TabsContent>
        <TabsContent value="subjects" className="mt-4">
          <Panel description="Drag to update how much of each syllabus you've covered.">
            <SubjectList subjects={subjects.map((s) => ({ id: s.id, name: s.name, code: s.code, progress: s.progress, slots: s._count.slots }))} />
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
