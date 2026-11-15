import { Moon } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { Panel } from "@/components/common/ui";
import { resolveDayRhythm } from "@/lib/domain/rhythm";
import type { CategoryKeyT } from "@/lib/domain/constants";
import { addDays, DAY_LABELS, dayOfWeek, formatDuration, formatMinute } from "@/lib/time";
import { cn } from "@/lib/utils";
import { NewTemplateButton, OverrideControl, TemplatesManager, type OverrideView, type TemplateView } from "./rhythm-templates";
import { ProtectedBlocksManager } from "./rhythm-protected";
import { EnergyWindowsManager } from "./rhythm-energy";

/** Settings → Day rhythm: day templates, protected personal time and energy windows. */
export async function RhythmTab() {
  const ctx = await getContext();
  const s = ctx.settings;
  const [templateRows, overrideRows, blockRows, windowRows] = await Promise.all([
    db.dayTemplate.findMany({ where: { userId: ctx.userId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.dayOverride.findMany({ where: { userId: ctx.userId, date: { gte: ctx.today } }, orderBy: { date: "asc" }, take: 30, include: { template: true } }),
    db.protectedBlock.findMany({ where: { userId: ctx.userId }, orderBy: [{ startMinute: "asc" }, { createdAt: "asc" }] }),
    db.energyWindow.findMany({ where: { userId: ctx.userId }, orderBy: [{ startMinute: "asc" }, { createdAt: "asc" }] }),
  ]);

  const templates: TemplateView[] = templateRows.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    daysOfWeek: t.daysOfWeek,
    wakeMinute: t.wakeMinute,
    sleepMinute: t.sleepMinute,
    focusLimitMin: t.focusLimitMin,
    taskLimit: t.taskLimit,
    restDay: t.restDay,
  }));
  const overrides: OverrideView[] = overrideRows.map((o) => ({ date: o.date, templateId: o.templateId, templateName: o.template.name, color: o.template.color }));
  const defaults = { wakeMinute: s.wakeMinute, sleepMinute: s.sleepMinute, dailyFocusLimitMin: s.dailyFocusLimitMin, dailyTaskLimit: s.dailyTaskLimit };

  const overrideMap = new Map(overrideRows.map((o) => [o.date, o.templateId]));
  const week = Array.from({ length: 7 }, (_, i) => addDays(ctx.today, i)).map((date) => ({ date, r: resolveDayRhythm(s, templateRows, overrideMap, date) }));

  return (
    <div className="space-y-6">
      <Panel
        title="Day templates"
        description="Different kinds of days get their own hours and workload. Dates without a template use Settings → Schedule."
        action={templates.length > 0 ? <NewTemplateButton templates={templates} defaults={defaults} /> : undefined}
      >
        <div className="space-y-5">
          <section aria-label="Your next 7 days">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Next 7 days</p>
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {week.map(({ date, r }) => (
                <li key={date} className={cn("rounded-xl border p-2.5", date === ctx.today ? "border-primary/40 bg-primary/5" : "border-border")}>
                  <p className="text-[11px] text-muted-foreground">
                    {date === ctx.today ? "Today" : DAY_LABELS[dayOfWeek(date)]} · {Number(date.slice(8))}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-medium">
                    {r.color && <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />}
                    <span className="truncate">{r.templateName ?? "Default"}</span>
                    {r.restDay && <Moon className="size-3 shrink-0 text-success" role="img" aria-label="Rest day" />}
                  </p>
                  <p className="tabular mt-0.5 text-[11px] text-muted-foreground">
                    {formatMinute(r.wake)} – {formatMinute(r.sleep)}
                  </p>
                  <p className="tabular text-[11px] text-muted-foreground">
                    {formatDuration(r.focusLimit)} · {r.taskLimit} tasks{r.source === "override" ? " · one-off" : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <TemplatesManager templates={templates} overrides={overrides} defaults={defaults} />

          {templates.length > 0 && (
            <section aria-label="Use a template on a specific date" className="rounded-xl border border-border p-3">
              <p className="text-sm font-medium">Use a template on a specific date</p>
              <p className="mb-3 text-xs text-muted-foreground">E.g. an internship day on a Saturday, or an exam day mid-week.</p>
              <OverrideControl templates={templates} overrides={overrides} today={ctx.today} />
            </section>
          )}
        </div>
      </Panel>

      <Panel title="Protected time" description="Personal time the planner never touches. It also shows as a fixed commitment on your day.">
        <ProtectedBlocksManager
          blocks={blockRows.map((b) => ({ id: b.id, label: b.label, daysOfWeek: b.daysOfWeek, startMinute: b.startMinute, endMinute: b.endMinute }))}
        />
      </Panel>

      <Panel title="Energy windows" description="Tell the planner when kinds of work suit you best — and when they don't.">
        <EnergyWindowsManager
          windows={windowRows
            .filter((w) => w.kind === "PREFER" || w.kind === "AVOID")
            .map((w) => ({
              id: w.id,
              kind: w.kind as "PREFER" | "AVOID",
              categoryKey: (w.categoryKey ?? null) as CategoryKeyT | null,
              daysOfWeek: w.daysOfWeek,
              startMinute: w.startMinute,
              endMinute: w.endMinute,
              label: w.label,
            }))}
        />
      </Panel>
    </div>
  );
}
