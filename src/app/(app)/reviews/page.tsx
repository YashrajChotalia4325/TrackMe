import Link from "next/link";
import { CheckCircle2, Lightbulb, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { monthlyReport, weeklyReport, type WeeklyReport } from "@/server/reports";
import { Bar, PageHeader, Panel, Stat } from "@/components/common/ui";
import { MonthlyReflectionForm, WeeklyReflectionForm } from "@/components/reviews/review-forms";
import { PlanWeekButton } from "@/components/tasks/proposal-dialog";
import { addDays, addMonths, formatDate, formatDuration, formatMonth, isISODate, monthKey, weekStart } from "@/lib/time";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reviews" };

export default async function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const tab = sp.tab === "monthly" ? "monthly" : "weekly";

  const nav = (
    <nav className="flex w-fit rounded-lg border border-border p-0.5" aria-label="Review type">
      {(["weekly", "monthly"] as const).map((t) => (
        <Link key={t} href={`/reviews?tab=${t}`} aria-current={tab === t ? "page" : undefined} className={cn("rounded-md px-3 py-1 text-sm capitalize", tab === t ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
          {t}
        </Link>
      ))}
    </nav>
  );

  if (tab === "monthly") {
    const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthKey(ctx.today);
    const [r, saved, history] = await Promise.all([
      monthlyReport(ctx, month),
      db.monthlyReview.findUnique({ where: { userId_month: { userId: ctx.userId, month } } }),
      db.monthlyReview.findMany({ where: { userId: ctx.userId }, orderBy: { month: "desc" }, take: 24, select: { month: true, completedAt: true } }),
    ]);
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Monthly review" title={formatMonth(month)} description="Your personal performance report. Saved reports stay in history." actions={nav} />
        <MonthNav month={month} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Average score" value={r.avgScore ?? "—"} hint={r.grade ?? undefined} tone="accent" />
          <Stat label="Learning" value={formatDuration(r.learningMinutes)} />
          <Stat label="Gym sessions" value={r.gymSessions} />
          <Stat label="Saved" value={inr(r.saved)} hint={`Income ${inr(r.income)} · spent ${inr(r.expense)}`} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Monthly achievements">
            <List items={[...r.milestones.map((m) => `Milestone: ${m.title} (${m.goal})`), ...r.proAchievements.map((p) => `Career: ${p}`)]} empty="Complete milestones and record achievements to see them here." />
          </Panel>
          <Panel title="Progress by area">
            <ul className="space-y-2 text-sm">
              <li>Career: {r.proAchievements.length} achievement(s), {r.jobApplications} application(s)</li>
              <li>Academics: {r.categoryStats.find((c) => c.key === "ACADEMICS")?.done ?? 0} study task(s) completed</li>
              <li>AI learning: {formatDuration(r.learningMinutes)} across {r.learningSessions} session(s)</li>
              <li>Fitness: {r.gymSessions} gym · {r.cardioSessions} cardio{r.avgSleep != null && ` · avg sleep ${r.avgSleep}h`}{r.weightChange != null && ` · weight ${r.weightChange > 0 ? "+" : ""}${r.weightChange} kg`}</li>
              <li>MBA profile: {r.mbaActivities.length} activit{r.mbaActivities.length === 1 ? "y" : "ies"}</li>
              <li>Creative: {formatDuration(r.creativeMinutes)} · {r.words.toLocaleString("en-IN")} words</li>
              <li>Finance: earned {inr(r.income)}, saved {inr(r.saved)}</li>
            </ul>
          </Panel>
        </div>
        <Panel title="Reflection" description={saved?.completedAt ? `Saved ${saved.completedAt.toLocaleDateString("en-IN")}` : "Write your reflection to complete this month's review"}>
          <MonthlyReflectionForm month={month} initial={{ reflection: saved?.reflection ?? null, challenges: saved?.challenges ?? null, lessons: saved?.lessons ?? null, priorities: saved?.priorities ?? null }} />
        </Panel>
        {history.length > 0 && (
          <Panel title="History">
            <div className="flex flex-wrap gap-2">
              {history.map((h) => (
                <Link key={h.month} href={`/reviews?tab=monthly&month=${h.month}`} className={cn("rounded-full border px-3 py-1 text-xs", h.month === month ? "border-primary/50 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                  {formatMonth(h.month)}
                </Link>
              ))}
            </div>
          </Panel>
        )}
      </div>
    );
  }

  const ws = typeof sp.week === "string" && isISODate(sp.week) ? weekStart(sp.week) : ctx.weekStart;
  const isCurrent = ws === ctx.weekStart;
  const [r, saved, history] = await Promise.all([
    weeklyReport(ctx, ws),
    db.weeklyReview.findUnique({ where: { userId_weekStart: { userId: ctx.userId, weekStart: ws } } }),
    db.weeklyReview.findMany({ where: { userId: ctx.userId }, orderBy: { weekStart: "desc" }, take: 12, select: { weekStart: true } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Weekly review"
        title={`${formatDate(ws, "dm")} – ${formatDate(addDays(ws, 6))}`}
        description="Ten minutes on Sunday: review, reflect, approve next week."
        actions={
          <>
            {nav}
            {isCurrent && <PlanWeekButton label="Generate next week's plan" variant="default" />}
          </>
        }
      />
      <div className="flex gap-2 text-sm">
        <Link className="text-muted-foreground hover:text-foreground" href={`/reviews?week=${addDays(ws, -7)}`}>
          ← Previous week
        </Link>
        {!isCurrent && (
          <Link className="text-muted-foreground hover:text-foreground" href={`/reviews?week=${addDays(ws, 7)}`}>
            Next week →
          </Link>
        )}
      </div>
      <WeeklyAnswers r={r} />
      <Panel title="9. What should I improve next week?" description="Suggestions from your completion history — approve or edit next week's plan above.">
        {r.improvements.length > 0 && (
          <ul className="mb-5 space-y-1.5">
            {r.improvements.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" /> {s}
              </li>
            ))}
          </ul>
        )}
        <WeeklyReflectionForm weekStart={ws} reflection={saved?.reflection ?? null} improvements={saved?.improvements ?? null} />
      </Panel>
      {history.length > 0 && (
        <Panel title="Past reviews">
          <div className="flex flex-wrap gap-2">
            {history.map((h) => (
              <Link key={h.weekStart} href={`/reviews?week=${h.weekStart}`} className={cn("rounded-full border px-3 py-1 text-xs", h.weekStart === ws ? "border-primary/50 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                Week of {formatDate(h.weekStart, "dm")}
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function WeeklyAnswers({ r }: { r: WeeklyReport }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="1. What did I accomplish?" description={`${r.tasksCompleted} task(s) · average score ${r.avgScore ?? "—"}${r.grade ? ` (${r.grade})` : ""}`}>
        <List items={r.completed.slice(0, 12).map((c) => c.title)} empty="Nothing completed yet this week." icon={<CheckCircle2 className="size-3.5 text-success" />} more={r.completed.length - 12} />
      </Panel>
      <Panel title="2. What did I fail to complete?" description="Approved skips aren't counted">
        <List items={r.failed.slice(0, 12).map((c) => `${c.title} · ${formatDate(c.date, "weekday")}`)} empty="Nothing missed. 🎉" icon={<XCircle className="size-3.5 text-muted-foreground" />} more={r.failed.length - 12} />
      </Panel>
      <Panel title="3 & 4. Best category · needs attention">
        <div className="space-y-3">
          {r.best ? (
            <p className="flex items-center gap-2 text-sm">
              <TrendingUp className="size-4 text-success" /> <span className="font-medium">{r.best.name}</span> — {Math.round(r.best.rate! * 100)}% complete
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not enough data yet.</p>
          )}
          {r.attention && (
            <p className="flex items-center gap-2 text-sm">
              <TrendingDown className="size-4 text-warning" /> <span className="font-medium">{r.attention.name}</span> — {Math.round(r.attention.rate! * 100)}% complete
            </p>
          )}
          <div className="space-y-2 pt-2">
            {r.categoryStats
              .filter((c) => c.total > 0)
              .map((c) => (
                <div key={c.key} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-xs">
                  <span className="truncate text-muted-foreground">{c.name}</span>
                  <Bar value={c.done} max={c.total} color={c.color} label={c.name} />
                  <span className="tabular text-right">
                    {c.done}/{c.total}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </Panel>
      <Panel title="5–8. Learning, gym, career, MBA">
        <ul className="space-y-2.5 text-sm">
          <li>
            <span className="text-muted-foreground">5. Learning:</span> <span className="font-medium">{formatDuration(r.learningMinutes)}</span> in {r.learningSessions} session(s)
          </li>
          <li>
            <span className="text-muted-foreground">6. Gym:</span> <span className="font-medium">{r.gymSessions} session(s)</span> + {r.cardioSessions} cardio
          </li>
          <li>
            <span className="text-muted-foreground">7. Professional progress:</span> {r.proAchievements.length ? r.proAchievements.join("; ") : "No achievements recorded"}
            {r.jobApplications > 0 && ` · ${r.jobApplications} application(s)`}
          </li>
          <li>
            <span className="text-muted-foreground">8. MBA profile:</span> {r.mbaActivities.length ? r.mbaActivities.map((m) => m.title).slice(0, 5).join("; ") : "Nothing logged"}
          </li>
        </ul>
        {r.targets.filter((t) => t.target > 0).length > 0 && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            {r.targets
              .filter((t) => t.target > 0)
              .map((t) => (
                <div key={t.id} className="grid grid-cols-[1fr_auto] gap-2 text-xs">
                  <span>{t.label}</span>
                  <span className={cn("tabular", t.done >= t.target ? "text-success" : "text-muted-foreground")}>{t.unit === "MINUTES" ? `${formatDuration(t.done)} / ${formatDuration(t.target)}` : `${t.done}/${t.target}`}</span>
                </div>
              ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function List({ items, empty, icon, more = 0 }: { items: string[]; empty: string; icon?: React.ReactNode; more?: number }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex items-center gap-2 text-sm">
          {icon}
          <span className="truncate">{t}</span>
        </li>
      ))}
      {more > 0 && <li className="text-xs text-muted-foreground">+{more} more</li>}
    </ul>
  );
}

function MonthNav({ month }: { month: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <Link className="text-muted-foreground hover:text-foreground" href={`/reviews?tab=monthly&month=${addMonths(month, -1)}`}>
        ← {formatMonth(addMonths(month, -1))}
      </Link>
      <Link className="text-muted-foreground hover:text-foreground" href={`/reviews?tab=monthly&month=${addMonths(month, 1)}`}>
        {formatMonth(addMonths(month, 1))} →
      </Link>
    </div>
  );
}
