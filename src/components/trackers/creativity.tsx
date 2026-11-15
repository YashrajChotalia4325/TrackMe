"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { addCreativeMilestone, deleteCreativeNote, deleteCreativeSession, logCreativeSession, toggleCreativeMilestone, upsertCreativeNote, upsertProject } from "@/server/actions/trackers";
import { formatDate, formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";
import { chip, dashed, display, divide, focusRing, num, pill, reveal, rowIconBtn, subCard } from "@/components/config/bold";

const STATUS_BLOCK: Record<string, string> = { ACTIVE: "bg-block-lime", PAUSED: "bg-block-sun", DONE: "bg-block-sky" };

export interface ProjectView {
  id: string;
  title: string;
  logline: string | null;
  synopsis: string | null;
  status: string;
  wordGoal: number | null;
  milestones: { id: string; title: string; doneAt: string | null }[];
  notes: { id: string; kind: string; title: string; body: string | null }[];
}

export function ProjectHeader({ project }: { project: ProjectView }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useAction();
  const [v, setV] = useState({ title: project.title, logline: project.logline ?? "", synopsis: project.synopsis ?? "", status: project.status, wordGoal: project.wordGoal?.toString() ?? "" });
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={cn(display, "text-2xl leading-tight sm:text-[28px]")}>{project.title}</h2>
          <span className={cn(chip, STATUS_BLOCK[project.status] ?? "bg-block-stone", "tracking-[0.06em] uppercase")}>{project.status.toLowerCase()}</span>
        </div>
        {project.logline && <p className="mt-1.5 text-sm font-medium text-muted-foreground italic">{project.logline}</p>}
        {project.synopsis && <p className="mt-3 max-w-3xl text-sm whitespace-pre-line text-muted-foreground">{project.synopsis}</p>}
      </div>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" /> Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Story details</DialogTitle>
            <DialogDescription>Private to you.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Title" htmlFor="cp-title"><Input id="cp-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
            <Field label="Logline" htmlFor="cp-log"><Input id="cp-log" value={v.logline} onChange={(e) => setV({ ...v, logline: e.target.value })} /></Field>
            <Field label="Synopsis" htmlFor="cp-syn"><Textarea id="cp-syn" rows={6} value={v.synopsis} onChange={(e) => setV({ ...v, synopsis: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status" htmlFor="cp-status">
                <NativeSelect id="cp-status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="DONE">Done</option>
                </NativeSelect>
              </Field>
              <Field label="Word goal" htmlFor="cp-goal"><Input id="cp-goal" inputMode="numeric" value={v.wordGoal} onChange={(e) => setV({ ...v, wordGoal: e.target.value })} /></Field>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={pending || !v.title.trim()} onClick={() => run(() => upsertProject(project.id, { title: v.title, logline: v.logline || undefined, synopsis: v.synopsis || undefined, status: v.status, wordGoal: v.wordGoal ? Number(v.wordGoal) : null }), { onSuccess: () => setOpen(false) })}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Milestones({ project }: { project: ProjectView }) {
  const { run, pending } = useAction();
  const [title, setTitle] = useState("");
  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {project.milestones.map((m) => (
          <li key={m.id}>
            <button type="button" disabled={pending} onClick={() => run(() => toggleCreativeMilestone(m.id))} className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted", focusRing)} aria-pressed={!!m.doneAt}>
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-[5px] border-2 border-border", m.doneAt ? "bg-block-lime text-ink" : "bg-card")} aria-hidden>{m.doneAt && <Check className="size-3" strokeWidth={3.5} />}</span>
              <span className={cn(m.doneAt && "text-muted-foreground line-through")}>{m.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addCreativeMilestone(project.id, title), { onSuccess: () => setTitle("") });
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a milestone" aria-label="New milestone" />
        <Button type="submit" variant="outline" size="icon" className="size-9" disabled={pending || !title.trim()} aria-label="Add milestone">
          <Plus className="size-4" />
        </Button>
      </form>
    </div>
  );
}

const KINDS = [
  { key: "CHARACTER", label: "Characters" },
  { key: "PLOT", label: "Plot" },
  { key: "SCENE", label: "Scenes" },
  { key: "IDEA", label: "Ideas" },
  { key: "NOTE", label: "Notes" },
];

export function StoryNotes({ project }: { project: ProjectView }) {
  const [kind, setKind] = useState("CHARACTER");
  const [editing, setEditing] = useState<{ id: string | null; title: string; body: string } | null>(null);
  const { run, pending } = useAction();
  const list = project.notes.filter((n) => n.kind === kind);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Story notes">
        {KINDS.map((k) => (
          <button key={k.key} role="tab" aria-selected={kind === k.key} type="button" onClick={() => setKind(k.key)} className={pill(kind === k.key)}>
            {k.label} <span className={cn(num, "ml-1 text-[10px] opacity-80")}>{project.notes.filter((n) => n.kind === k.key).length}</span>
          </button>
        ))}
        <Button size="xs" variant="outline" className="ml-auto" onClick={() => setEditing({ id: null, title: "", body: "" })}>
          <Plus className="size-3" /> New
        </Button>
      </div>
      {list.length === 0 ? (
        <p className={cn(dashed, "py-6 text-center text-sm text-muted-foreground")}>Nothing here yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {list.map((n) => (
            <div key={n.id} className={cn(subCard, "group p-3")}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{n.title}</p>
                <div className={cn("-mt-1 -mr-1 flex gap-0.5", reveal)}>
                  <button type="button" onClick={() => setEditing({ id: n.id, title: n.title, body: n.body ?? "" })} className={cn(rowIconBtn, "hover:bg-block-sky")} aria-label={`Edit ${n.title}`}><Pencil className="size-3.5" /></button>
                  <button type="button" disabled={pending} onClick={() => run(() => deleteCreativeNote(n.id))} className={rowIconBtn} aria-label={`Delete ${n.title}`}><Trash2 className="size-3.5" /></button>
                </div>
              </div>
              {n.body && <p className="mt-1 line-clamp-4 text-xs whitespace-pre-line text-muted-foreground">{n.body}</p>}
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit" : "New"} {KINDS.find((k) => k.key === kind)?.label.toLowerCase().replace(/s$/, "")}</DialogTitle>
            <DialogDescription>{project.title}</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <Field label="Title" htmlFor="cn-title"><Input id="cn-title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
              <Field label="Details" htmlFor="cn-body"><Textarea id="cn-body" rows={8} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} /></Field>
            </div>
          )}
          <DialogFooter>
            <Button disabled={pending || !editing?.title.trim()} onClick={() => editing && run(() => upsertCreativeNote(editing.id, { projectId: project.id, kind, title: editing.title, body: editing.body || undefined }), { onSuccess: () => setEditing(null) })}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function WritingSessionForm({ today, projectId }: { today: string; projectId: string | null }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({ date: today, durationMin: 45, wordCount: 0, notes: "" });
  return (
    <form
      className="grid gap-3 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => logCreativeSession({ ...v, projectId, notes: v.notes || undefined }), { onSuccess: () => setV({ ...v, wordCount: 0, notes: "" }) });
      }}
    >
      <Field label="Date" htmlFor="cs-date"><Input id="cs-date" type="date" max={today} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="dark:[color-scheme:dark]" /></Field>
      <Field label="Minutes" htmlFor="cs-min"><Input id="cs-min" type="number" min={1} value={v.durationMin} onChange={(e) => setV({ ...v, durationMin: Number(e.target.value) })} /></Field>
      <Field label="Words" htmlFor="cs-words"><Input id="cs-words" type="number" min={0} value={v.wordCount} onChange={(e) => setV({ ...v, wordCount: Number(e.target.value) })} /></Field>
      <Field label="What did you work on?" htmlFor="cs-notes"><Input id="cs-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
      <Button type="submit" disabled={pending} className="self-end">Log session</Button>
    </form>
  );
}

export function WritingSessions({ items }: { items: { id: string; date: string; durationMin: number; wordCount: number; notes: string | null }[] }) {
  const { run, pending } = useAction();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No writing sessions yet. Even 30 minutes keeps the story alive.</p>;
  return (
    <ul className={divide}>
      {items.map((s) => (
        <li key={s.id} className="group flex items-center gap-3 py-2.5 text-sm">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">{formatDate(s.date, "weekday")}</span>
          <span className="min-w-0 flex-1 truncate">{s.notes ?? <span className="text-muted-foreground">Writing session</span>}</span>
          <span className={cn(num, "shrink-0 text-xs text-muted-foreground")}>{s.wordCount > 0 && `${s.wordCount.toLocaleString("en-IN")} words · `}{formatDuration(s.durationMin)}</span>
          <button type="button" disabled={pending} onClick={() => run(() => deleteCreativeSession(s.id))} className={cn(rowIconBtn, reveal)} aria-label={`Delete session from ${formatDate(s.date, "weekday")}`}><Trash2 className="size-3.5" /></button>
        </li>
      ))}
    </ul>
  );
}

export function NewProjectButton() {
  const { run, pending } = useAction();
  return (
    <Button variant="outline" disabled={pending} onClick={() => run(() => upsertProject(null, { title: "Untitled story", status: "ACTIVE" }))}>
      <Plus className="size-4" /> New project
    </Button>
  );
}
