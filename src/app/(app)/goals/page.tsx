import { Flag, Hourglass, Target, Trophy } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { goalProgress } from "@/server/queries";
import { EmptyState, PageHeader, Stat } from "@/components/common/ui";
import { GoalCard, NewGoalButton } from "@/components/goals/goals";
import { diffDays } from "@/lib/time";
import { FINAL_MILESTONE } from "@/lib/domain/constants";

export const metadata = { title: "Goals & Milestones" };

export default async function GoalsPage() {
  const ctx = await getContext();
  const goals = await db.goal.findMany({
    where: { userId: ctx.userId },
    include: { milestones: { orderBy: [{ order: "asc" }] }, category: true, tasks: { select: { status: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const views = goals.map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    categoryId: g.categoryId,
    color: g.category?.color ?? "#A1A1AA",
    categoryName: g.category?.name ?? null,
    startDate: g.startDate,
    targetDate: g.targetDate,
    priority: g.priority,
    status: g.status,
    progressMode: g.progressMode,
    manualProgress: g.manualProgress,
    progress: goalProgress(g),
    milestones: g.milestones.map((m) => ({ id: m.id, title: m.title, targetDate: m.targetDate, doneAt: m.doneAt?.toISOString() ?? null })),
    relatedTasks: g.tasks.length,
    relatedDone: g.tasks.filter((t) => t.status === "COMPLETED").length,
  }));
  const active = views.filter((g) => g.status !== "DROPPED");
  const avg = active.length ? Math.round(active.reduce((s, g) => s + g.progress, 0) / active.length) : 0;
  const totalMs = goals.reduce((s, g) => s + g.milestones.length, 0);
  const doneMs = goals.reduce((s, g) => s + g.milestones.filter((m) => m.doneAt).length, 0);
  const categories = ctx.categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Goals & Milestones" title="31 December 2027" description="Long-term goals, broken into milestones. Progress is never assigned arbitrarily." actions={<NewGoalButton categories={categories} today={ctx.today} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Days remaining" value={diffDays(FINAL_MILESTONE, ctx.today)} icon={Hourglass} tone="accent" />
        <Stat label="Overall progress" value={`${avg}%`} hint="Average across active goals" icon={Target} />
        <Stat label="Milestones" value={`${doneMs}/${totalMs}`} icon={Flag} />
        <Stat label="Goals achieved" value={`${views.filter((g) => g.status === "ACHIEVED").length}/${active.length}`} icon={Trophy} tone="success" />
      </div>
      {views.length === 0 ? (
        <EmptyState icon={Target} title="No goals yet" description="Add your first long-term goal and break it into milestones." action={<NewGoalButton categories={categories} today={ctx.today} />} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {views.map((g) => (
            <GoalCard key={g.id} goal={g} today={ctx.today} categories={categories} />
          ))}
        </div>
      )}
    </div>
  );
}
