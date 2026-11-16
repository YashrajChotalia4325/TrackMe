"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, CalendarPlus, Lightbulb, RefreshCcw, SkipForward, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { applyProposal, discardProposal, proposeRescheduleDay, proposeWeekPlan, undoVersion, type StoredProposal } from "@/server/actions/schedule";
import { useAction } from "@/components/common/use-action";
import { CATEGORY_META } from "@/lib/domain/constants";
import { formatDate, formatDuration, formatMinute } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CategorySwatch, ON_BLOCK } from "./category-style";

export interface OpenProposal {
  versionId: string;
  proposal: StoredProposal;
}

function slot(p: { date: string; start: number | null } | null) {
  if (!p) return "—";
  return `${formatDate(p.date, "weekday")} · ${p.start != null ? formatMinute(p.start) : "unscheduled"}`;
}

const TITLES: Record<string, string> = {
  RESCHEDULE_DAY: "Reschedule my day",
  RECOVERY: "Recovery plan",
  WEEKLY_PLAN: "Proposed weekly plan",
  CONFLICT_RESOLUTION: "Resolve schedule conflicts",
  MANUAL: "Schedule changes",
};

/**
 * Before/after review of an engine proposal. Nothing changes until the user
 * approves; individual changes can be excluded. Applying shows an Undo toast.
 */
export function ProposalDialog({ value, onClose, onApplied }: { value: OpenProposal | null; onClose: () => void; onApplied?: () => void }) {
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const { run, pending } = useAction();
  const open = value != null;
  const p = value?.proposal;
  const isWeekly = p?.kind === "WEEKLY_PLAN";

  const close = (discard: boolean) => {
    if (discard && value) void discardProposal(value.versionId);
    setExcluded(new Set());
    onClose();
  };

  const apply = () => {
    if (!value) return;
    const versionId = value.versionId;
    run(() => applyProposal(versionId, [...excluded]), {
      success: false,
      onSuccess: (d) => {
        close(false);
        onApplied?.();
        toast.success(`${d.applied} change${d.applied === 1 ? "" : "s"} applied`, {
          description: d.skipped.length ? `Skipped (changed since): ${d.skipped.join(", ")}` : undefined,
          duration: 10000,
          action: {
            label: "Undo",
            onClick: async () => {
              const r = await undoVersion(versionId);
              if (r.ok) toast.success(r.message ?? "Reverted");
              else toast.error(r.error);
            },
          },
        });
      },
    });
  };

  const included = p ? p.changes.filter((_, i) => !excluded.has(i)).length : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close(true)}>
      <DialogContent className="max-h-[90dvh] overflow-hidden p-0 sm:max-w-2xl">
        {p && (
          <div className="flex max-h-[90dvh] flex-col">
            <DialogHeader className="border-b-2 border-ink px-5 pt-5 pb-4">
              <DialogTitle className="flex items-center gap-2.5">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-[8px] border-2 border-ink bg-block-lime shadow-brutal-sm", ON_BLOCK)} aria-hidden>
                  <Sparkles className="size-4" />
                </span>
                {TITLES[p.kind] ?? "Proposed changes"}
              </DialogTitle>
              <DialogDescription>{p.summary} Review the changes — nothing is applied until you confirm.</DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {p.warnings.length > 0 && (
                <div className={cn("space-y-1.5 rounded-[8px] border-2 border-ink bg-block-sun p-3", ON_BLOCK)}>
                  {p.warnings.map((w, i) => (
                    <p key={i} className="flex gap-2 text-xs font-medium">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w}
                    </p>
                  ))}
                </div>
              )}
              {p.suggestions.length > 0 && (
                <div className="space-y-1.5 rounded-[8px] border-2 border-ink bg-muted p-3">
                  {p.suggestions.map((s, i) => (
                    <p key={i} className="flex gap-2 text-xs text-foreground">
                      <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {s}
                    </p>
                  ))}
                </div>
              )}

              {p.changes.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nothing needs to change.</p>
              ) : (
                <div className="overflow-hidden rounded-[10px] border-2 border-ink bg-card shadow-brutal-sm">
                  <div className="hidden grid-cols-[auto_1fr_1fr_auto_1fr] gap-3 border-b-2 border-ink bg-muted px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-foreground uppercase sm:grid">
                    <span className="w-4" />
                    <span>Task</span>
                    <span>Before</span>
                    <span />
                    <span>After</span>
                  </div>
                  <ul>
                    {p.changes.map((c, i) => {
                      const off = excluded.has(i);
                      const Icon = c.action === "CREATE" ? CalendarPlus : c.action === "SKIP" ? SkipForward : RefreshCcw;
                      return (
                        <li key={i} className={cn("grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-b-2 border-ink px-3 py-3 text-sm last:border-0 sm:grid-cols-[auto_1fr_1fr_auto_1fr] sm:items-center", off && "bg-muted")}>
                          <Checkbox
                            checked={!off}
                            onCheckedChange={(v) =>
                              setExcluded((s) => {
                                const n = new Set(s);
                                if (v) n.delete(i);
                                else n.add(i);
                                return n;
                              })
                            }
                            aria-label={`Include change for ${c.title}`}
                          />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate font-semibold">
                              <Icon className="size-3.5 shrink-0 text-foreground" aria-hidden />
                              <CategorySwatch categoryKey={c.categoryKey} color={CATEGORY_META[c.categoryKey]?.color} />
                              <span className={cn("truncate", off && "text-muted-foreground line-through decoration-2")}>{c.title}</span>
                              {off && <span className="sr-only"> (excluded)</span>}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              <span className="font-mono font-medium tabular-nums">{formatDuration(c.durationMin)}</span> · {c.reason}
                            </p>
                          </div>
                          <span className={cn("col-start-2 justify-self-start font-mono text-xs font-medium text-muted-foreground tabular-nums sm:col-start-auto", c.action !== "CREATE" && "line-through decoration-muted-foreground/60")}>
                            <span className="sr-only">Before: </span>
                            {c.action === "CREATE" ? "New" : slot(c.from)}
                          </span>
                          <ArrowRight className="hidden size-4 text-foreground sm:block" strokeWidth={2.5} aria-hidden />
                          <span
                            className={cn(
                              "col-start-2 inline-flex max-w-full justify-self-start rounded-[6px] border-2 border-ink px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums sm:col-start-auto",
                              off ? "border-dashed bg-card text-muted-foreground" : c.action === "SKIP" ? "bg-muted text-muted-foreground" : cn("bg-block-lime", ON_BLOCK),
                            )}
                          >
                            <span className="sr-only">After: </span>
                            <span className="truncate">{c.action === "SKIP" ? "Skipped (no backlog)" : slot(c.to)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter className="m-0 border-t-2 border-ink px-5 py-4">
              <Button variant="outline" onClick={() => close(true)}>
                {isWeekly ? "Discard plan" : "Cancel"}
              </Button>
              <Button onClick={apply} disabled={pending || included === 0}>
                {pending ? "Applying…" : `Apply ${included} change${included === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RescheduleDayButton({ className, size = "default", variant = "default" }: { className?: string; size?: "default" | "sm" | "lg"; variant?: "default" | "outline" | "secondary" }) {
  const [value, setValue] = useState<OpenProposal | null>(null);
  const { run, pending } = useAction();
  return (
    <>
      <Button className={className} size={size} variant={variant} disabled={pending} onClick={() => run(() => proposeRescheduleDay(), { success: false, onSuccess: setValue })}>
        <RefreshCcw className={cn("size-4", pending && "animate-spin")} /> Reschedule My Day
      </Button>
      <ProposalDialog value={value} onClose={() => setValue(null)} />
    </>
  );
}

export function PlanWeekButton({ weekStart, label = "Plan next week", variant = "outline", size = "default" }: { weekStart?: string; label?: string; variant?: "default" | "outline" | "secondary"; size?: "default" | "sm" }) {
  const [value, setValue] = useState<OpenProposal | null>(null);
  const { run, pending } = useAction();
  return (
    <>
      <Button variant={variant} size={size} disabled={pending} onClick={() => run(() => proposeWeekPlan(weekStart), { success: false, onSuccess: setValue })}>
        <Sparkles className="size-4" /> {pending ? "Planning…" : label}
      </Button>
      <ProposalDialog value={value} onClose={() => setValue(null)} />
    </>
  );
}
