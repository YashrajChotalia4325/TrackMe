"use client";

import { useState } from "react";
import { ArrowDownToLine, HeartPulse, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/common/use-action";
import { moveTask, setTaskStatus } from "@/server/actions/tasks";
import { setMode } from "@/server/actions/settings";
import { proposeRescheduleDay } from "@/server/actions/schedule";
import { ProposalDialog, type OpenProposal } from "@/components/tasks/proposal-dialog";
import { formatDate, formatDuration } from "@/lib/time";
import type { TaskView } from "@/server/queries";
import type { ModeT } from "@/lib/domain/constants";
import { CategorySwatch } from "@/components/tasks/category-style";

const nextSlot = (now: number) => Math.min(23 * 60, Math.ceil((now + 5) / 15) * 15);

export function MissedList({ tasks, today, nowMinute }: { tasks: TaskView[]; today: string; nowMinute: number }) {
  const { run, pending } = useAction();
  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center gap-2.5 rounded-[8px] border-2 border-ink bg-card px-2.5 py-2 text-sm">
          <CategorySwatch categoryKey={t.categoryKey} color={t.color} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{t.title}</span>
            <span className="text-xs text-muted-foreground">
              <span className="sr-only">{t.categoryName}, </span>
              {formatDate(t.date, "weekday")} · <span className="font-mono font-medium tabular-nums">{formatDuration(t.durationMin)}</span>
            </span>
          </span>
          <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => moveTask({ id: t.id, date: today, startMinute: nextSlot(nowMinute) }), { success: "Moved to today" })} aria-label={`Do ${t.title} today`}>
            Today
          </Button>
          <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => setTaskStatus({ id: t.id, status: "SKIPPED", skipReason: "Let go after missing", skipApproved: t.canSkip || t.kind === "OPTIONAL" }), { success: "Let go" })} aria-label={`Let go of ${t.title}`}>
            Let go
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function FreeTimePanel({
  suggestions,
  behind,
  today,
  nowMinute,
}: {
  suggestions: TaskView[];
  behind: { label: string; unit: "MINUTES" | "SESSIONS"; done: number; target: number; scheduled: number }[];
  today: string;
  nowMinute: number;
}) {
  const { run, pending } = useAction();
  if (suggestions.length === 0 && behind.length === 0) return <p className="text-sm text-muted-foreground">You&apos;re ahead of the week. Enjoy the time — rest counts too.</p>;
  return (
    <div className="space-y-4">
      {suggestions.length > 0 && (
        <ul className="space-y-2">
          {suggestions.map((t) => (
            <li key={t.id} className="flex items-center gap-2.5 rounded-[8px] border-2 border-ink bg-card px-2.5 py-2 text-sm">
              <CategorySwatch categoryKey={t.categoryKey} color={t.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{t.title}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="sr-only">{t.categoryName}, </span>
                  Planned {formatDate(t.date, "weekday")} · <span className="font-mono font-medium tabular-nums">{formatDuration(t.durationMin)}</span>
                  {t.deadline && ` · due ${formatDate(t.deadline, "dm")}`}
                </span>
              </span>
              <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => moveTask({ id: t.id, date: today, startMinute: nextSlot(nowMinute) }), { success: `Pulled “${t.title}” into today` })}>
                <ArrowDownToLine className="size-3" /> Now
              </Button>
            </li>
          ))}
        </ul>
      )}
      {behind.length > 0 && (
        <div className="space-y-1.5 rounded-[8px] border-2 border-ink bg-muted p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
            <Sparkles className="size-3.5" aria-hidden /> Weekly targets with room to grow
          </p>
          {behind.map((b) => (
            <p key={b.label} className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span className="truncate">{b.label}</span>
              <span className="shrink-0 font-mono font-medium text-foreground tabular-nums">{b.unit === "MINUTES" ? `${formatDuration(b.done)} of ${formatDuration(b.target)}` : `${b.done}/${b.target}`}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecoveryToggle({ mode }: { mode: ModeT }) {
  const { run, pending } = useAction();
  const [proposal, setProposal] = useState<OpenProposal | null>(null);
  if (mode === "RECOVERY") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Recovery mode is on. Expectations are reduced and rest is protected — nothing here counts against you.</p>
        <Button variant="outline" disabled={pending} onClick={() => run(() => setMode("NORMAL"))}>
          I&apos;m feeling better
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Recovery mode pauses non-essential work without penalty and only re-plans what&apos;s truly important.</p>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(() => setMode("RECOVERY"), {
            onSuccess: () => run(() => proposeRescheduleDay(), { success: false, onSuccess: setProposal }),
          })
        }
      >
        <HeartPulse className="size-4" aria-hidden /> Activate Recovery mode
      </Button>
      <ProposalDialog value={proposal} onClose={() => setProposal(null)} />
    </div>
  );
}
