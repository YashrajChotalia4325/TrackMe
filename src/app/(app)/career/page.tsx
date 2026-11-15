import { Award, Briefcase, Send, Users } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { taskFormOptions, toTaskView } from "@/server/queries";
import { PageHeader, Panel, Stat } from "@/components/common/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AchievementLog, JobTracker, NetworkingLog } from "@/components/trackers/career";
import { AddTaskButton } from "@/components/tasks/task-board";
import { TaskItem } from "@/components/tasks/task-item";
import { addDays } from "@/lib/time";

export const metadata = { title: "Career" };

export default async function CareerPage() {
  const ctx = await getContext();
  const career = ctx.catByKey.get("CAREER")!;
  const [jobs, achievements, network, tasks, options] = await Promise.all([
    db.jobApplication.findMany({ where: { userId: ctx.userId }, orderBy: { updatedAt: "desc" } }),
    db.professionalAchievement.findMany({ where: { userId: ctx.userId }, orderBy: { date: "desc" } }),
    db.networkingLog.findMany({ where: { userId: ctx.userId }, orderBy: { date: "desc" }, take: 50 }),
    db.task.findMany({ where: { userId: ctx.userId, categoryId: career.id, date: { gte: ctx.today, lte: addDays(ctx.today, 14) }, status: { in: ["PENDING", "IN_PROGRESS"] } }, orderBy: [{ date: "asc" }, { startMinute: "asc" }], take: 10 }),
    taskFormOptions(ctx),
  ]);
  const active = jobs.filter((j) => !["REJECTED", "ACCEPTED", "INTERESTED"].includes(j.status)).length;
  const interviews = jobs.filter((j) => j.status === "INTERVIEW").length;
  const role = [ctx.profile?.currentRole, ctx.profile?.company].filter(Boolean).join(" at ");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Career" title={role || "Career"} description="Excel at the internship, document measurable wins, and build toward a full-time role." actions={<AddTaskButton options={options} label="Internship task" variant="outline" categoryKey="CAREER" />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Applications" value={jobs.length} hint={`${active} in progress`} icon={Send} />
        <Stat label="Interviews" value={interviews} hint="Currently interviewing" icon={Briefcase} tone={interviews ? "accent" : undefined} />
        <Stat label="Achievements" value={achievements.length} hint="Career Builder at 10" icon={Award} tone={achievements.length >= 10 ? "success" : undefined} />
        <Stat label="Network" value={network.length} hint="Contacts logged" icon={Users} />
      </div>

      <Panel title="Upcoming internship & career tasks" description="Next 14 days">
        {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No career tasks scheduled. Add internship deliverables so the scheduler can protect time for them.</p> : tasks.map((t) => <TaskItem key={t.id} task={toTaskView(t, ctx)} showDate />)}
      </Panel>

      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">Job applications</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
          <TabsTrigger value="network">Networking</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs" className="mt-4">
          <JobTracker jobs={jobs.map((j) => ({ id: j.id, company: j.company, role: j.role, status: j.status, appliedOn: j.appliedOn, salary: j.salary, location: j.location, url: j.url, nextStep: j.nextStep, notes: j.notes, source: j.source }))} />
        </TabsContent>
        <TabsContent value="achievements" className="mt-4">
          <Panel>
            <AchievementLog items={achievements.map((a) => ({ id: a.id, date: a.date, title: a.title, kind: a.kind, impact: a.impact }))} today={ctx.today} />
          </Panel>
        </TabsContent>
        <TabsContent value="network" className="mt-4">
          <Panel>
            <NetworkingLog items={network.map((n) => ({ id: n.id, date: n.date, person: n.person, company: n.company, channel: n.channel, notes: n.notes, followUp: n.followUp }))} today={ctx.today} />
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
