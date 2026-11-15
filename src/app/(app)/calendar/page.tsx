import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { taskFormOptions, weekData } from "@/server/queries";
import { PageHeader } from "@/components/common/ui";
import { EventTypeLegend, MonthGrid, WeekTimeGrid, type MonthCell } from "@/components/calendar/calendar-view";
import { AddEventButton } from "@/components/calendar/event-form-dialog";
import { Button } from "@/components/ui/button";
import { addDays, addMonths, datesBetween, formatDate, formatMonth, isISODate, monthKey, monthRange, weekStart } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : "month";
  const anchor = typeof sp.date === "string" && isISODate(sp.date) ? sp.date : ctx.today;

  const tabs = (
    <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Calendar view">
      {(["month", "week"] as const).map((v) => (
        <Link key={v} role="tab" aria-selected={view === v} href={`/calendar?view=${v}&date=${anchor}`} className={cn("rounded-md px-3 py-1 text-sm capitalize", view === v ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
          {v}
        </Link>
      ))}
    </div>
  );

  if (view === "week") {
    const ws = weekStart(anchor);
    const [days, options] = await Promise.all([weekData(ctx, ws), taskFormOptions(ctx)]);
    return (
      <div className="space-y-5">
        <PageHeader
          title="Calendar"
          description={`${formatDate(ws, "dm")} – ${formatDate(addDays(ws, 6))}`}
          actions={
            <>
              {tabs}
              <Nav prev={`/calendar?view=week&date=${addDays(ws, -7)}`} next={`/calendar?view=week&date=${addDays(ws, 7)}`} today="/calendar?view=week" />
              <AddEventButton today={ctx.today} />
            </>
          }
        />
        <WeekTimeGrid
          columns={days.map((d) => ({ date: d.date, tasks: d.tasks, fixed: d.fixed, events: d.events.map((e) => ({ ...e, date: d.date })) }))}
          today={ctx.today}
          wake={ctx.settings.wakeMinute}
          sleep={ctx.settings.sleepMinute}
          options={options}
          nowMinute={ctx.nowMinute}
        />
      </div>
    );
  }

  const month = monthKey(anchor);
  const { start, end } = monthRange(month);
  const gridStart = weekStart(start);
  const gridEnd = addDays(weekStart(end), 6);
  const dates = datesBetween(gridStart, gridEnd);
  const [events, tasks, periods, scores] = await Promise.all([
    db.event.findMany({ where: { userId: ctx.userId, date: { lte: gridEnd }, OR: [{ date: { gte: gridStart } }, { endDate: { gte: gridStart } }] }, orderBy: [{ date: "asc" }, { startMinute: "asc" }] }),
    db.task.groupBy({ by: ["date", "status"], where: { userId: ctx.userId, date: { gte: gridStart, lte: gridEnd }, status: { notIn: ["RESCHEDULED"] } }, _count: true }),
    db.examPeriod.findMany({ where: { userId: ctx.userId, endDate: { gte: gridStart }, startDate: { lte: gridEnd } } }),
    db.dailyScore.findMany({ where: { userId: ctx.userId, date: { gte: gridStart, lte: gridEnd } } }),
  ]);
  const cells: MonthCell[] = dates.map((date) => ({
    date,
    inMonth: date >= start && date <= end,
    events: events
      .filter((e) => e.date <= date && (e.endDate ?? e.date) >= date)
      .map((e) => ({ id: e.id, title: e.title, type: e.type, date: e.date, endDate: e.endDate, startMinute: e.startMinute, endMinute: e.endMinute, allDay: e.allDay, location: e.location, notes: e.notes, blocksTime: e.blocksTime, source: e.source })),
    taskCount: tasks.filter((t) => t.date === date).reduce((s, t) => s + t._count, 0),
    doneCount: tasks.filter((t) => t.date === date && t.status === "COMPLETED").reduce((s, t) => s + t._count, 0),
    inExam: periods.some((p) => p.startDate <= date && p.endDate >= date),
    score: scores.find((s) => s.date === date)?.score ?? null,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description={formatMonth(month)}
        actions={
          <>
            {tabs}
            <Nav prev={`/calendar?date=${addMonths(month, -1)}-01`} next={`/calendar?date=${addMonths(month, 1)}-01`} today="/calendar" />
            <AddEventButton today={ctx.today} />
          </>
        }
      />
      <EventTypeLegend />
      <MonthGrid cells={cells} today={ctx.today} />
    </div>
  );
}

function Nav({ prev, next, today }: { prev: string; next: string; today: string }) {
  return (
    <div className="flex items-center rounded-lg border border-border">
      <Button variant="ghost" size="icon" aria-label="Previous" nativeButton={false} render={<Link href={prev} />}>
        <ChevronLeft className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={today} />}>
        Today
      </Button>
      <Button variant="ghost" size="icon" aria-label="Next" nativeButton={false} render={<Link href={next} />}>
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
