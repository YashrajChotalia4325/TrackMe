"use client";

import { useState } from "react";
import { Briefcase, CalendarDays, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, NativeSelect, TimeInput } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { ProposalDialog, type OpenProposal } from "@/components/tasks/proposal-dialog";
import { acceptInsight, dismissInsight } from "@/server/actions/google";
import { INSIGHT_KIND_META } from "@/lib/domain/email-classifier";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ApplicationOption, InsightView } from "@/server/integrations/google";

const TONE: Record<string, string> = {
  accent: "border-primary/30 bg-primary/10 text-primary",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  muted: "border-border bg-muted text-muted-foreground",
};

export function KindBadge({ kind }: { kind: InsightView["kind"] }) {
  const meta = INSIGHT_KIND_META[kind];
  return <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11px] font-medium", TONE[meta.tone])}>{meta.label}</span>;
}

export function InsightList({ insights, applications, today }: { insights: InsightView[]; applications: ApplicationOption[]; today: string }) {
  const [active, setActive] = useState<InsightView | null>(null);
  const [proposal, setProposal] = useState<OpenProposal | null>(null);
  const { run, pending } = useAction();

  return (
    <>
      <ul className="divide-y divide-border">
        {insights.map((i) => (
          <li key={i.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <KindBadge kind={i.kind} />
                <p className="truncate text-sm font-medium" title={i.subject}>
                  {i.subject}
                </p>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {i.company && (
                  <span className="inline-flex items-center gap-1">
                    <Briefcase className="size-3" aria-hidden /> {i.company}
                  </span>
                )}
                {i.suggestedDate && (
                  <span className="inline-flex items-center gap-1 text-foreground/80">
                    <CalendarDays className="size-3" aria-hidden /> {formatDate(i.suggestedDate, "weekday")}
                  </span>
                )}
                <span className="truncate">
                  {i.sender} · received {formatDate(i.receivedDate, "dm")}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => setActive(i)} aria-label={`Accept: ${i.subject}`}>
                <Check className="size-3.5" aria-hidden /> Accept
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => dismissInsight(i.id))} aria-label={`Dismiss: ${i.subject}`}>
                <X className="size-3.5" aria-hidden /> Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {active && (
        <AcceptInsightDialog
          key={active.id}
          insight={active}
          applications={applications}
          today={today}
          onClose={() => setActive(null)}
          onConflict={(p) => setProposal(p)}
        />
      )}
      <ProposalDialog value={proposal} onClose={() => setProposal(null)} />
    </>
  );
}

const SCHEDULABLE = new Set(["INTERVIEW", "ASSESSMENT", "COLLEGE", "DEADLINE"]);

function matchApplication(apps: ApplicationOption[], company: string | null): string {
  if (!company) return "";
  const c = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!c) return "";
  const hit = apps.find((a) => {
    const n = a.company.toLowerCase().replace(/[^a-z0-9]/g, "");
    return n === c || (n.length >= 3 && (n.includes(c) || c.includes(n)));
  });
  return hit?.id ?? "";
}

function AcceptInsightDialog({
  insight,
  applications,
  today,
  onClose,
  onConflict,
}: {
  insight: InsightView;
  applications: ApplicationOption[];
  today: string;
  onClose: () => void;
  onConflict: (p: OpenProposal) => void;
}) {
  const meta = INSIGHT_KIND_META[insight.kind];
  const { run, pending } = useAction();
  const canUpdateApp = meta.status != null;
  const [addCal, setAddCal] = useState(SCHEDULABLE.has(insight.kind) || Boolean(insight.suggestedDate));
  const [title, setTitle] = useState(insight.company && insight.kind !== "COLLEGE" && insight.kind !== "DEADLINE" ? `${meta.label}: ${insight.company}` : insight.subject.slice(0, 200));
  const [date, setDate] = useState(insight.suggestedDate ?? today);
  const [timed, setTimed] = useState(insight.suggestedStart != null);
  const [start, setStart] = useState<number | null>(insight.suggestedStart ?? 10 * 60);
  const [end, setEnd] = useState<number | null>(Math.min((insight.suggestedStart ?? 10 * 60) + 60, 24 * 60));
  const [updateApp, setUpdateApp] = useState(canUpdateApp);
  const [appId, setAppId] = useState(() => matchApplication(applications, insight.company));
  const [company, setCompany] = useState(insight.company ?? "");
  const [role, setRole] = useState("");

  const submit = () => {
    const payload = {
      addToCalendar: addCal ? { date, title: title.trim(), startMinute: timed ? start : null, endMinute: timed ? end : null } : null,
      updateApplication: canUpdateApp && updateApp ? (appId ? { applicationId: appId } : { createCompany: company.trim(), role: role.trim() || null }) : null,
    };
    run(() => acceptInsight(insight.id, payload), {
      onSuccess: (d) => {
        onClose();
        if (d.conflict) onConflict(d.conflict);
      },
    });
  };

  const nothingChosen = !addCal && !(canUpdateApp && updateApp);
  const invalid = nothingChosen || (addCal && (!title.trim() || !date || (timed && (start == null || (end != null && end <= start))))) || (canUpdateApp && updateApp && !appId && !company.trim());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Accept suggestion</DialogTitle>
          <DialogDescription className="line-clamp-2">{insight.subject}</DialogDescription>
        </DialogHeader>
        {insight.snippet && <p className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">&ldquo;{insight.snippet}&rdquo;</p>}

        <div className="grid gap-4">
          <section className="grid gap-3 rounded-xl border border-border p-3">
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden /> Add to calendar
              </span>
              <Switch checked={addCal} onCheckedChange={setAddCal} aria-label="Add to calendar" />
            </label>
            {addCal && (
              <>
                <Field label="Title" htmlFor={`ins-title-${insight.id}`}>
                  <Input id={`ins-title-${insight.id}`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Date" htmlFor={`ins-date-${insight.id}`} hint={insight.suggestedDate ? "Taken from the email — please double-check." : "No date found in the email; pick one."}>
                  <Input id={`ins-date-${insight.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="dark:[color-scheme:dark]" />
                </Field>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    Has a time
                    <span className="block text-xs text-muted-foreground">Timed events block your schedule; all-day ones don&apos;t.</span>
                  </span>
                  <Switch checked={timed} onCheckedChange={setTimed} aria-label="Has a time" />
                </label>
                {timed && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Start" htmlFor={`ins-start-${insight.id}`}>
                      <TimeInput id={`ins-start-${insight.id}`} value={start} onChange={setStart} />
                    </Field>
                    <Field label="End" htmlFor={`ins-end-${insight.id}`} error={start != null && end != null && end <= start ? "End must be after start" : undefined}>
                      <TimeInput id={`ins-end-${insight.id}`} value={end} onChange={setEnd} />
                    </Field>
                  </div>
                )}
              </>
            )}
          </section>

          {canUpdateApp && (
            <section className="grid gap-3 rounded-xl border border-border p-3">
              <label className="flex items-center justify-between gap-3 text-sm font-medium">
                <span className="inline-flex items-center gap-2">
                  <Briefcase className="size-4 text-muted-foreground" aria-hidden /> Update job application
                </span>
                <Switch checked={updateApp} onCheckedChange={setUpdateApp} aria-label="Update job application" />
              </label>
              {updateApp && (
                <>
                  <Field label="Application" htmlFor={`ins-app-${insight.id}`} hint={`Status will become “${meta.status?.toLowerCase()}”. TrackMe never moves an application backwards.`}>
                    <NativeSelect id={`ins-app-${insight.id}`} value={appId} onChange={(e) => setAppId(e.target.value)}>
                      <option value="">Create a new application…</option>
                      {applications.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.company} — {a.role} ({a.status.toLowerCase()})
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  {!appId && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Company" htmlFor={`ins-co-${insight.id}`}>
                        <Input id={`ins-co-${insight.id}`} value={company} maxLength={120} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Razorpay" />
                      </Field>
                      <Field label="Role (optional)" htmlFor={`ins-role-${insight.id}`}>
                        <Input id={`ins-role-${insight.id}`} value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} placeholder="e.g. SDE Intern" />
                      </Field>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending || Boolean(invalid)} onClick={submit}>
            {pending ? "Saving…" : "Accept"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
