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
import { cn } from "@/lib/utils";
import { FOCUS_RING, ON_BLOCK_HOVER, REVEAL_ON_HOVER } from "@/components/tasks/category-style";

export function SubjectList({ subjects }: { subjects: { id: string; name: string; code: string | null; progress: number; slots: number }[] }) {
  const { run, pending } = useAction();
  const [name, setName] = useState("");
  return (
    <div className="space-y-4">
      {subjects.length === 0 && <p className="text-sm text-muted-foreground">Subjects are created automatically from your timetable, or add them here.</p>}
      <ul className="space-y-2">
        {subjects.map((s) => (
          <li key={s.id} className="group grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 rounded-[8px] border-2 border-ink bg-card px-3 py-2.5">
            <span className="min-w-0 truncate text-sm font-semibold">
              {s.name}
              {s.code && <span className="font-mono text-xs font-medium text-muted-foreground"> · {s.code}</span>}
              <span className="text-xs font-normal text-muted-foreground"> · {s.slots} weekly slot{s.slots === 1 ? "" : "s"}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="rounded-[6px] border-2 border-ink bg-block-sky px-1.5 py-px font-mono text-[11px] leading-4 font-medium text-ink tabular-nums">{s.progress}%</span>
              <button type="button" disabled={pending} onClick={() => run(() => deleteSubject(s.id))} className={cn("grid size-7 place-items-center rounded-[6px] border-2 border-transparent text-foreground transition hover:border-ink hover:bg-block-danger", ON_BLOCK_HOVER, REVEAL_ON_HOVER, FOCUS_RING)} aria-label={`Delete ${s.name}`}>
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              defaultValue={s.progress}
              aria-label={`${s.name} syllabus progress`}
              className={cn("col-span-2 h-2 w-full cursor-pointer rounded-full accent-[var(--ink)]", FOCUS_RING)}
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
