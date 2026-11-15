"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { deleteSubject, upsertSubject } from "@/server/actions/calendar";
import { setMode } from "@/server/actions/settings";
import type { ModeT } from "@/lib/domain/constants";

export function SubjectList({ subjects }: { subjects: { id: string; name: string; code: string | null; progress: number; slots: number }[] }) {
  const { run, pending } = useAction();
  const [name, setName] = useState("");
  return (
    <div className="space-y-4">
      {subjects.length === 0 && <p className="text-sm text-muted-foreground">Subjects are created automatically from your timetable, or add them here.</p>}
      <ul className="space-y-3">
        {subjects.map((s) => (
          <li key={s.id} className="group grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
            <span className="min-w-0 truncate text-sm font-medium">
              {s.name}
              {s.code && <span className="text-xs text-muted-foreground"> · {s.code}</span>}
              <span className="text-xs font-normal text-muted-foreground"> · {s.slots} weekly slot{s.slots === 1 ? "" : "s"}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="tabular text-xs text-muted-foreground">{s.progress}%</span>
              <button type="button" disabled={pending} onClick={() => run(() => deleteSubject(s.id))} className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100" aria-label={`Delete ${s.name}`}>
                <Trash2 className="size-3.5" />
              </button>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              defaultValue={s.progress}
              aria-label={`${s.name} syllabus progress`}
              className="col-span-2 h-1.5 w-full cursor-pointer accent-[var(--primary)]"
              onMouseUp={(e) => run(() => upsertSubject(s.id, { name: s.name, progress: Number((e.target as HTMLInputElement).value) }), { success: false })}
              onKeyUp={(e) => run(() => upsertSubject(s.id, { name: s.name, progress: Number((e.target as HTMLInputElement).value) }), { success: false })}
              onTouchEnd={(e) => run(() => upsertSubject(s.id, { name: s.name, progress: Number((e.target as HTMLInputElement).value) }), { success: false })}
            />
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => upsertSubject(null, { name }), { onSuccess: () => setName("") });
        }}
      >
        <Field label="Add subject" htmlFor="sub-name" className="flex-1">
          <Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Subject name" />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending || !name.trim()} className="self-end" aria-label="Add subject">
          <Plus className="size-4" />
        </Button>
      </form>
    </div>
  );
}

export function ExamModeToggle({ mode }: { mode: ModeT }) {
  const { run, pending } = useAction();
  return mode === "EXAM" ? (
    <Button variant="outline" disabled={pending} onClick={() => run(() => setMode("NORMAL"))}>
      Exit Examination mode
    </Button>
  ) : (
    <Button disabled={pending} onClick={() => run(() => setMode("EXAM"))}>
      Turn on Examination mode
    </Button>
  );
}
