import Link from "next/link";
import { BookOpen, Code2, MessageSquareText, NotebookPen } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { taskFormOptions, toTaskView } from "@/server/queries";
import { Bar, PageHeader, Panel, Stat } from "@/components/common/ui";
import { JournalForm, JournalList, ReadingTracker, SideProjectLog } from "@/components/trackers/personal";
import { AddTaskButton } from "@/components/tasks/task-board";
import { TaskItem } from "@/components/tasks/task-item";
import { addDays, formatDuration } from "@/lib/time";
import { habitsOverview } from "@/server/habits";
import { HabitsManager } from "@/components/habits/habits-manager";
import { BLOCK, dashed, num } from "@/components/config/bold";

export const metadata = { title: "Personal" };

export default async function PersonalPage() {
  const ctx = await getContext();
  const personal = ctx.catByKey.get("PERSONAL")!;
  const weekEnd = addDays(ctx.weekStart, 6);
  const [journal, reading, side, comms, target, tasks, options, habits] = await Promise.all([
    db.journalEntry.findMany({ where: { userId: ctx.userId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 10 }),
    db.readingItem.findMany({ where: { userId: ctx.userId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    db.sideProjectLog.findMany({ where: { userId: ctx.userId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 15 }),
    db.mBAActivity.count({ where: { userId: ctx.userId, type: "COMMUNICATION" } }),
    db.weeklyTarget.findFirst({ where: { userId: ctx.userId, key: "side-project" } }),
    db.task.findMany({ where: { userId: ctx.userId, categoryId: personal.id, date: { gte: ctx.today, lte: addDays(ctx.today, 14) }, status: { in: ["PENDING", "IN_PROGRESS"] } }, orderBy: [{ date: "asc" }, { startMinute: "asc" }], take: 8 }),
    taskFormOptions(ctx),
    habitsOverview(ctx),
  ]);
  const sideWeek = side.filter((s) => s.date >= ctx.weekStart && s.date <= weekEnd).reduce((a, s) => a + s.durationMin, 0);
  const sideTarget = target?.normalTarget ?? 180;
  const booksDone = reading.filter((r) => r.status === "DONE").length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Personal development" title="The rest of your life matters too" description="Journal, reading, communication practice, family and the side project — without crowding out the essentials." actions={<AddTaskButton options={options} label="Personal task" variant="outline" categoryKey="PERSONAL" />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Side project this week" value={formatDuration(sideWeek)} hint={`Flexible 2–4h · target ${formatDuration(sideTarget)}`} icon={Code2} />
        <Stat label="Books finished" value={booksDone} hint={`${reading.filter((r) => r.status === "READING").length} in progress`} icon={BookOpen} />
        <Stat label="Journal entries" value={journal.length >= 10 ? "10+" : journal.length} hint="Recent" icon={NotebookPen} />
        <Stat label="Communication practice" value={comms} hint={<Link href="/mba" className="underline-offset-4 hover:underline">Logged under MBA</Link>} icon={MessageSquareText} />
      </div>

      <Panel id="habits" title="Habits" className="scroll-mt-24">
        <HabitsManager habits={habits} today={ctx.today} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Journal">
          <JournalForm today={ctx.today} />
          <div className="mt-5">
            <JournalList items={journal.map((j) => ({ id: j.id, date: j.date, mood: j.mood, body: j.body }))} />
          </div>
        </Panel>
        <div className="space-y-6">
          <Panel title="Side project" description="Never allowed to displace critical academic or career work">
            <div className="mb-4">
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="font-semibold">This week</span>
                <span className={`${num} text-muted-foreground`}>
                  {formatDuration(sideWeek)} / {formatDuration(sideTarget)}
                </span>
              </div>
              <Bar value={sideWeek} max={sideTarget} color={sideWeek >= sideTarget ? BLOCK.lime : BLOCK.teal} label="Side project weekly time" />
            </div>
            <SideProjectLog today={ctx.today} items={side.map((s) => ({ id: s.id, date: s.date, durationMin: s.durationMin, notes: s.notes }))} />
          </Panel>
          <Panel title="Personal & family commitments" description="Next 14 days">
            {tasks.length === 0 ? <p className={`${dashed} px-4 py-5 text-center text-sm text-muted-foreground`}>Nothing scheduled.</p> : tasks.map((t) => <TaskItem key={t.id} task={toTaskView(t, ctx)} showDate compact />)}
          </Panel>
        </div>
      </div>

      <Panel title="Reading tracker">
        <ReadingTracker items={reading.map((r) => ({ id: r.id, title: r.title, author: r.author, status: r.status, kind: r.kind, notes: r.notes }))} />
      </Panel>
    </div>
  );
}
