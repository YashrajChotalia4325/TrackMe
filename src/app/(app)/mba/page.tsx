import { CalendarClock, Info } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { weeklyTargetProgress } from "@/server/targets";
import { Bar, PageHeader, Panel, Stat } from "@/components/common/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MbaList, MbaLogForm } from "@/components/trackers/mba";
import { diffDays, formatDate, formatMonth } from "@/lib/time";
import { MBA_TIMELINE } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";
import { BLOCK, chip, inset, num, tabsList, tabsTrigger } from "@/components/config/bold";

export const metadata = { title: "MBA Preparation" };

const SECTIONS = [
  { key: "PROFILE", label: "MBA Profile", blurb: "2027 focus: reading, awareness, communication, leadership and documented achievements." },
  { key: "CAT", label: "CAT Preparation", blurb: "CAT foundation begins January 2028. Intensive preparation is deliberately not scheduled in 2027 — log occasional practice here if you choose." },
  { key: "ENTRANCE", label: "Entrance Exams", blurb: "CAT, XAT, SNAP and others in 2028–2029. Track research on formats, dates and cut-offs." },
  { key: "RESEARCH", label: "MBA Research", blurb: "Programmes, schools, outcomes and fit." },
  { key: "INTERVIEW", label: "Interview Prep", blurb: "WAT/PI preparation for the 2029 admission cycle." },
];

export default async function MbaPage() {
  const ctx = await getContext();
  const [activities, targets] = await Promise.all([
    db.mBAActivity.findMany({ where: { userId: ctx.userId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    weeklyTargetProgress(ctx, ctx.weekStart),
  ]);
  const mbaTargets = targets.filter((t) => t.categoryKey === "MBA" || t.key === "career-achievement");
  const catDays = diffDays(ctx.settings.catTargetDate, ctx.today);
  const currentMonth = ctx.today.slice(0, 7);
  const profileCount = activities.filter((a) => a.section === "PROFILE").length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="MBA Preparation" title="Building an MBA-ready profile" description={ctx.profile?.mbaObjective ?? "CAT, XAT, SNAP in 2028–2029 · admission target 2029."} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="CAT target" value={`${catDays} days`} hint={`${formatDate(ctx.settings.catTargetDate)} · editable in Settings`} icon={CalendarClock} tone="accent" />
        <Stat label="Profile activities" value={profileCount} hint="All-time" />
        <Stat label="This week" value={mbaTargets.reduce((s, t) => s + t.done, 0)} hint={`of ${mbaTargets.reduce((s, t) => s + t.target, 0)} target sessions`} />
        <Stat label="Phase" value="Profile" hint="Nov 2026 – Dec 2027" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="This week's profile targets" description="Suggested: 3 reading · 2 awareness · 2 communication · 1 leadership · 1 achievement update">
          <div className="space-y-3">
            {mbaTargets.map((t) => (
              <div key={t.id}>
                <div className="mb-1.5 flex justify-between gap-3 text-sm">
                  <span className="font-medium">{t.label}</span>
                  <span className={cn(num, "text-xs text-muted-foreground")}>
                    {t.done}/{t.target}
                  </span>
                </div>
                <Bar value={t.done} max={Math.max(1, t.target)} color={t.target > 0 && t.done >= t.target ? BLOCK.lime : BLOCK.pink} label={t.label} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Timeline">
          <ol className="relative ml-2 space-y-4 border-l-2 border-border pl-6">
            {MBA_TIMELINE.map((p) => {
              const current = currentMonth >= p.from && currentMonth <= p.to;
              const done = currentMonth > p.to;
              return (
                <li key={p.label} className="relative">
                  <span className={cn("absolute top-0.5 -left-[33px] size-4 rounded-[4px] border-2 border-border", current ? "bg-block-pink" : done ? "bg-block-lime" : "bg-card")} aria-hidden />
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {p.label}
                    {current && <span className={cn(chip, "bg-block-pink")}>Now</span>}
                    {done && <span className="sr-only">(done)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMonth(p.from)} – {formatMonth(p.to)} · {p.detail}
                  </p>
                </li>
              );
            })}
          </ol>
        </Panel>
      </div>

      <Tabs defaultValue="PROFILE">
        <TabsList className={tabsList}>
          {SECTIONS.map((s) => (
            <TabsTrigger key={s.key} value={s.key} className={tabsTrigger}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SECTIONS.map((s) => (
          <TabsContent key={s.key} value={s.key} className="mt-4">
            <Panel>
              <p className={cn(inset, "mb-4 flex gap-2 p-3 text-sm text-muted-foreground")}>
                <Info className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden /> {s.blurb}
              </p>
              <MbaLogForm today={ctx.today} section={s.key} />
              <div className="mt-5">
                <MbaList items={activities.filter((a) => a.section === s.key).slice(0, 30).map((a) => ({ id: a.id, date: a.date, type: a.type, title: a.title, durationMin: a.durationMin, notes: a.notes }))} />
              </div>
            </Panel>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
