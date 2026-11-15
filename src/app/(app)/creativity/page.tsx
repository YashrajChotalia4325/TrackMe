import Link from "next/link";
import { BookOpen, Clapperboard, Clock, PenLine } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { Bar, EmptyState, PageHeader, Panel, Stat } from "@/components/common/ui";
import { Milestones, NewProjectButton, ProjectHeader, StoryNotes, WritingSessionForm, WritingSessions } from "@/components/trackers/creativity";
import { addDays, formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";
import { BLOCK, num, pill } from "@/components/config/bold";

export const metadata = { title: "Creativity" };

export default async function CreativityPage({ searchParams }: PageProps<"/creativity">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const [projects, sessions, target] = await Promise.all([
    db.creativeProject.findMany({ where: { userId: ctx.userId }, include: { milestones: { orderBy: { order: "asc" } }, notes: { orderBy: { updatedAt: "desc" } } }, orderBy: { createdAt: "asc" } }),
    db.creativeSession.findMany({ where: { userId: ctx.userId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    db.weeklyTarget.findFirst({ where: { userId: ctx.userId, key: "creative-writing" } }),
  ]);
  const project = projects.find((p) => p.id === sp.project) ?? projects.find((p) => p.status === "ACTIVE") ?? projects[0];
  const weekMin = sessions.filter((s) => s.date >= ctx.weekStart && s.date <= addDays(ctx.weekStart, 6)).reduce((a, s) => a + s.durationMin, 0);
  const projectSessions = project ? sessions.filter((s) => s.projectId === project.id) : [];
  const words = projectSessions.reduce((a, s) => a + s.wordCount, 0);
  const weeklyTarget = target?.normalTarget ?? 150;
  const msDone = project?.milestones.filter((m) => m.doneAt).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Creativity"
        title={ctx.profile?.creativeAmbition ?? "Creative work"}
        description="Important, and secondary to academics and career right now. Record progress whenever you write — no daily pressure."
        actions={<NewProjectButton />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="This week" value={formatDuration(weekMin)} hint={`Suggested ${formatDuration(weeklyTarget)}`} icon={Clock} tone={weekMin >= weeklyTarget ? "success" : undefined} />
        <Stat label="Sessions" value={sessions.length} hint="Storyteller at 10" icon={PenLine} tone={sessions.length >= 10 ? "success" : undefined} />
        <Stat label="Words written" value={words.toLocaleString("en-IN")} hint={project?.wordGoal ? `Goal ${project.wordGoal.toLocaleString("en-IN")}` : "On this project"} icon={BookOpen} />
        <Stat label="Milestones" value={`${msDone}/${project?.milestones.length ?? 0}`} hint="Story progress" icon={Clapperboard} />
      </div>

      {projects.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="Story projects">
          {projects.map((p) => (
            <Link key={p.id} href={`/creativity?project=${p.id}`} aria-current={p.id === project?.id ? "page" : undefined} className={cn(pill(p.id === project?.id), "text-sm")}>
              {p.title}
            </Link>
          ))}
        </nav>
      )}

      {!project ? (
        <EmptyState icon={Clapperboard} title="No story project yet" description="Create a project to hold your characters, plot, scenes and milestones." action={<NewProjectButton />} />
      ) : (
        <>
          {(() => {
            const view = {
              id: project.id,
              title: project.title,
              logline: project.logline,
              synopsis: project.synopsis,
              status: project.status,
              wordGoal: project.wordGoal,
              milestones: project.milestones.map((m) => ({ id: m.id, title: m.title, doneAt: m.doneAt?.toISOString() ?? null })),
              notes: project.notes.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body })),
            };
            return (
              <>
                <Panel>
                  <ProjectHeader project={view} />
                  {project.wordGoal ? (
                    <div className="mt-4 max-w-md">
                      <div className="mb-1.5 flex justify-between text-xs">
                        <span className="font-semibold">Word goal</span>
                        <span className={cn(num, "text-muted-foreground")}>
                          {words.toLocaleString("en-IN")} / {project.wordGoal.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <Bar value={words} max={project.wordGoal} color={words >= project.wordGoal ? BLOCK.lime : BLOCK.orange} label="Word goal progress" />
                    </div>
                  ) : null}
                </Panel>
                <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
                  <Panel title="Story milestones">
                    <Milestones project={view} />
                  </Panel>
                  <Panel title="Story workspace" description="Characters, plot, scenes, ideas and notes">
                    <StoryNotes project={view} />
                  </Panel>
                </div>
              </>
            );
          })()}
          <Panel title="Writing sessions">
            <WritingSessionForm today={ctx.today} projectId={project.id} />
            <div className="mt-5">
              <WritingSessions items={projectSessions.slice(0, 20).map((s) => ({ id: s.id, date: s.date, durationMin: s.durationMin, wordCount: s.wordCount, notes: s.notes }))} />
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
