"use client";

import { useState } from "react";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { addNetworking, addProAchievement, deleteJob, deleteNetworking, deleteProAchievement, setJobStatus, upsertJob } from "@/server/actions/trackers";
import { JOB_STATUSES } from "@/lib/domain/constants";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const JOB_LABEL: Record<string, string> = {
  INTERESTED: "Interested",
  TO_APPLY: "To apply",
  APPLIED: "Applied",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  ACCEPTED: "Accepted",
};
const JOB_TONE: Record<string, string> = {
  OFFER: "text-success",
  ACCEPTED: "text-success",
  REJECTED: "text-muted-foreground",
  INTERVIEW: "text-primary",
  ASSESSMENT: "text-primary",
};

export interface JobView {
  id: string;
  company: string;
  role: string;
  status: string;
  appliedOn: string | null;
  salary: string | null;
  location: string | null;
  url: string | null;
  nextStep: string | null;
  notes: string | null;
  source: string | null;
}

export function JobTracker({ jobs }: { jobs: JobView[] }) {
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<JobView | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<string>("ACTIVE");
  const shown = jobs.filter((j) => (filter === "ALL" ? true : filter === "ACTIVE" ? !["REJECTED", "ACCEPTED"].includes(j.status) : j.status === filter));
  const counts = Object.fromEntries(JOB_STATUSES.map((s) => [s, jobs.filter((j) => j.status === s).length]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {["ACTIVE", "ALL", ...JOB_STATUSES].map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
            className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", filter === s ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {s === "ACTIVE" ? "Active" : s === "ALL" ? `All (${jobs.length})` : `${JOB_LABEL[s]} (${counts[s]})`}
          </button>
        ))}
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Add application
        </Button>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No applications here yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Company · Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Applied</th>
                <th className="px-3 py-2 font-medium">Salary</th>
                <th className="px-3 py-2 font-medium">Next step</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {shown.map((j) => (
                <tr key={j.id} className="border-t border-border">
                  <td className="px-3 py-2.5">
                    <p className="font-medium">
                      {j.company}
                      {j.url && (
                        <a href={j.url} target="_blank" rel="noreferrer noopener" className="ml-1 inline-flex text-muted-foreground hover:text-foreground" aria-label={`Open ${j.company} posting`}>
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{j.role}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <NativeSelect aria-label={`Status for ${j.company}`} value={j.status} disabled={pending} onChange={(e) => run(() => setJobStatus(j.id, e.target.value as (typeof JOB_STATUSES)[number]))} className={cn("h-8 w-36 text-xs", JOB_TONE[j.status])}>
                      {JOB_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {JOB_LABEL[s]}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{j.appliedOn ? formatDate(j.appliedOn, "dm") : "—"}</td>
                  <td className="px-3 py-2.5 text-xs">{j.salary ?? "—"}</td>
                  <td className="max-w-48 truncate px-3 py-2.5 text-xs text-muted-foreground">{j.nextStep ?? "—"}</td>
                  <td className="px-2 py-2.5 text-right">
                    <button type="button" onClick={() => setEditing(j)} className="rounded p-1.5 text-muted-foreground hover:text-foreground" aria-label={`Edit ${j.company}`}>
                      <Pencil className="size-3.5" />
                    </button>
                    <button type="button" disabled={pending} onClick={() => run(() => deleteJob(j.id))} className="rounded p-1.5 text-muted-foreground hover:text-destructive" aria-label={`Delete ${j.company}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <JobDialog open={creating || !!editing} job={editing} onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }} />
    </div>
  );
}

function JobDialog({ open, job, onOpenChange }: { open: boolean; job: JobView | null; onOpenChange: (v: boolean) => void }) {
  const { run, pending } = useAction();
  const blank = { company: "", role: "", status: "INTERESTED", appliedOn: "", salary: "", location: "", url: "", source: "", nextStep: "", notes: "" };
  const [v, setV] = useState(blank);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (job?.id ?? "new") : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) setV(job ? { company: job.company, role: job.role, status: job.status, appliedOn: job.appliedOn ?? "", salary: job.salary ?? "", location: job.location ?? "", url: job.url ?? "", source: job.source ?? "", nextStep: job.nextStep ?? "", notes: job.notes ?? "" } : blank);
  }
  const f = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value }) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{job ? "Edit application" : "Add application"}</DialogTitle>
          <DialogDescription>Track every opportunity, from interest to offer.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company" htmlFor="j-co"><Input id="j-co" {...f("company")} /></Field>
          <Field label="Role" htmlFor="j-role"><Input id="j-role" {...f("role")} /></Field>
          <Field label="Status" htmlFor="j-status">
            <NativeSelect id="j-status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>
              {JOB_STATUSES.map((s) => <option key={s} value={s}>{JOB_LABEL[s]}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Applied on" htmlFor="j-date"><Input id="j-date" type="date" {...f("appliedOn")} className="dark:[color-scheme:dark]" /></Field>
          <Field label="Salary / CTC" htmlFor="j-sal"><Input id="j-sal" {...f("salary")} placeholder="e.g. ₹12 LPA" /></Field>
          <Field label="Location" htmlFor="j-loc"><Input id="j-loc" {...f("location")} /></Field>
          <Field label="Posting URL" htmlFor="j-url" className="sm:col-span-2"><Input id="j-url" type="url" {...f("url")} placeholder="https://" /></Field>
          <Field label="Source" htmlFor="j-src"><Input id="j-src" {...f("source")} placeholder="Referral, LinkedIn…" /></Field>
          <Field label="Next step" htmlFor="j-next"><Input id="j-next" {...f("nextStep")} /></Field>
          <Field label="Notes" htmlFor="j-notes" className="sm:col-span-2"><Textarea id="j-notes" rows={2} {...f("notes")} /></Field>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !v.company.trim() || !v.role.trim()}
            onClick={() =>
              run(
                () =>
                  upsertJob(job?.id ?? null, {
                    ...v,
                    appliedOn: v.appliedOn || null,
                    salary: v.salary || undefined,
                    location: v.location || undefined,
                    source: v.source || undefined,
                    nextStep: v.nextStep || undefined,
                    notes: v.notes || undefined,
                  }),
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AchievementLog({ items, today }: { items: { id: string; date: string; title: string; kind: string; impact: string | null }[]; today: string }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({ date: today, title: "", kind: "INTERNSHIP", impact: "" });
  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addProAchievement({ ...v, impact: v.impact || undefined }), { onSuccess: () => setV({ ...v, title: "", impact: "" }) });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="What did you achieve?" htmlFor="a-title" className="sm:col-span-2"><Input id="a-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Shipped onboarding flow for…" /></Field>
          <Field label="Type" htmlFor="a-kind">
            <NativeSelect id="a-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
              {["INTERNSHIP", "PROJECT", "CERTIFICATION", "RESUME", "LINKEDIN", "OTHER"].map((k) => <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Date" htmlFor="a-date"><Input id="a-date" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="dark:[color-scheme:dark]" /></Field>
          <Field label="Measurable impact (optional)" htmlFor="a-impact" className="sm:col-span-4"><Input id="a-impact" value={v.impact} onChange={(e) => setV({ ...v, impact: e.target.value })} placeholder="e.g. Cut manual review time by 30%" /></Field>
        </div>
        <Button type="submit" disabled={pending || !v.title.trim()} className="self-end">Record</Button>
      </form>
      <ul className="divide-y divide-border">
        {items.length === 0 && <li className="py-4 text-sm text-muted-foreground">No achievements recorded yet. Small wins count — write them down while they&apos;re fresh.</li>}
        {items.map((a) => (
          <li key={a.id} className="group flex items-start gap-3 py-2.5 text-sm">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">{formatDate(a.date, "dm")}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{a.title}</span>
              {a.impact && <span className="block text-xs text-success">{a.impact}</span>}
            </span>
            <span className="text-[11px] text-muted-foreground capitalize">{a.kind.toLowerCase()}</span>
            <button type="button" disabled={pending} onClick={() => run(() => deleteProAchievement(a.id))} className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100" aria-label="Delete achievement"><Trash2 className="size-3.5" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NetworkingLog({ items, today }: { items: { id: string; date: string; person: string; company: string | null; channel: string | null; notes: string | null; followUp: string | null }[]; today: string }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({ date: today, person: "", company: "", channel: "", notes: "", followUp: "" });
  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addNetworking({ date: v.date, person: v.person, company: v.company || undefined, channel: v.channel || undefined, notes: v.notes || undefined, followUp: v.followUp || undefined }), { onSuccess: () => setV({ ...v, person: "", company: "", notes: "", followUp: "" }) });
        }}
      >
        <Field label="Person" htmlFor="n-p"><Input id="n-p" value={v.person} onChange={(e) => setV({ ...v, person: e.target.value })} /></Field>
        <Field label="Company" htmlFor="n-c"><Input id="n-c" value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} /></Field>
        <Field label="Channel" htmlFor="n-ch"><Input id="n-ch" value={v.channel} onChange={(e) => setV({ ...v, channel: e.target.value })} placeholder="Coffee chat, LinkedIn…" /></Field>
        <Field label="Date" htmlFor="n-d"><Input id="n-d" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="dark:[color-scheme:dark]" /></Field>
        <Field label="Notes" htmlFor="n-notes" className="sm:col-span-2"><Input id="n-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        <Field label="Follow-up" htmlFor="n-f"><Input id="n-f" value={v.followUp} onChange={(e) => setV({ ...v, followUp: e.target.value })} /></Field>
        <Button type="submit" disabled={pending || !v.person.trim()} className="self-end">Log contact</Button>
      </form>
      <ul className="divide-y divide-border">
        {items.length === 0 && <li className="py-4 text-sm text-muted-foreground">No contacts logged yet.</li>}
        {items.map((n) => (
          <li key={n.id} className="group flex items-start gap-3 py-2.5 text-sm">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">{formatDate(n.date, "dm")}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{n.person}</span>
              {n.company && <span className="text-muted-foreground"> · {n.company}</span>}
              {n.channel && <span className="text-xs text-muted-foreground"> · {n.channel}</span>}
              {(n.notes || n.followUp) && <span className="block truncate text-xs text-muted-foreground">{[n.notes, n.followUp && `Follow up: ${n.followUp}`].filter(Boolean).join(" · ")}</span>}
            </span>
            <button type="button" disabled={pending} onClick={() => run(() => deleteNetworking(n.id))} className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100" aria-label="Delete contact"><Trash2 className="size-3.5" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
