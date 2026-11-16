"use client";

import { useState } from "react";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DayPicker, Field, TimeInput } from "@/components/common/form";
import { EmptyState } from "@/components/common/ui";
import { useAction } from "@/components/common/use-action";
import { createProtectedBlock, deleteProtectedBlock, updateProtectedBlock } from "@/server/actions/rhythm";
import { formatDays } from "@/lib/domain/rhythm";
import { formatMinute } from "@/lib/time";
import { cn } from "@/lib/utils";
import { divide, num, rowIconBtn, subCard } from "@/components/config/bold";

export interface ProtectedBlockView {
  id: string;
  label: string;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
}

const EXAMPLES = ["Family dinner", "Commute", "Prayer", "No-screens hour"];

export function ProtectedBlocksManager({ blocks }: { blocks: ProtectedBlockView[] }) {
  const { run, pending } = useAction();
  const [dialog, setDialog] = useState<{ block: ProtectedBlockView | null } | null>(null);

  return (
    <div className="space-y-3">
      {blocks.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No protected time yet"
          description="Add personal time TrackMe should never schedule over — family dinner, commute, prayer, a no-screens hour."
          action={
            <Button size="sm" onClick={() => setDialog({ block: null })}>
              <Plus className="size-4" aria-hidden /> Protect time
            </Button>
          }
        />
      ) : (
        <>
          <ul className={cn(subCard, divide)}>
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-md border-2 border-border bg-block-teal text-ink" aria-hidden>
                  <ShieldCheck className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{b.label}</p>
                  <p className={cn(num, "text-xs text-muted-foreground")}>
                    {formatDays(b.daysOfWeek)} · {formatMinute(b.startMinute)} – {formatMinute(b.endMinute)}
                  </p>
                </div>
                <button type="button" className={cn(rowIconBtn, "hover:bg-block-sky")} aria-label={`Edit ${b.label}`} onClick={() => setDialog({ block: b })}>
                  <Pencil className="size-3.5" aria-hidden />
                </button>
                <button type="button" disabled={pending} aria-label={`Remove ${b.label}`} className={rowIconBtn} onClick={() => run(() => deleteProtectedBlock(b.id))}>
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" onClick={() => setDialog({ block: null })}>
            <Plus className="size-4" aria-hidden /> Protect more time
          </Button>
        </>
      )}
      <ProtectedDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function ProtectedDialog({ state, onClose }: { state: { block: ProtectedBlockView | null } | null; onClose: () => void }) {
  const { run, pending } = useAction();
  // Remember the item being edited so the dialog doesn't flash to "new" while it animates closed.
  const [block, setBlock] = useState<ProtectedBlockView | null>(state?.block ?? null);
  const open = state != null;
  const init = (b: ProtectedBlockView | null) => ({
    label: b?.label ?? "",
    daysOfWeek: b?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    startMinute: b?.startMinute ?? 20 * 60,
    endMinute: b?.endMinute ?? 21 * 60,
  });
  const [v, setV] = useState(() => init(block));
  const [seen, setSeen] = useState<typeof state>(null);
  if (state !== seen) {
    setSeen(state);
    if (state) {
      setBlock(state.block);
      setV(init(state.block));
    }
  }
  const invalidTime = v.endMinute <= v.startMinute;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{block ? "Edit protected time" : "Protect time"}</DialogTitle>
          <DialogDescription>The planner treats this like a fixed commitment and never schedules work over it.</DialogDescription>
        </DialogHeader>
        <form
          id="rhythm-protected-form"
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => (block ? updateProtectedBlock(block.id, v) : createProtectedBlock(v)), { onSuccess: onClose });
          }}
        >
          <Field label="Label" htmlFor="pb-label" className="sm:col-span-2">
            <Input id="pb-label" value={v.label} maxLength={60} list="pb-examples" onChange={(e) => setV({ ...v, label: e.target.value })} placeholder="e.g. Family dinner" />
            <datalist id="pb-examples">
              {EXAMPLES.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label="Days" className="sm:col-span-2">
            <DayPicker value={v.daysOfWeek} onChange={(d) => setV({ ...v, daysOfWeek: d })} label="Days this time is protected" />
          </Field>
          <Field label="From" htmlFor="pb-start">
            <TimeInput id="pb-start" value={v.startMinute} onChange={(m) => m != null && setV({ ...v, startMinute: m })} />
          </Field>
          <Field label="Until" htmlFor="pb-end" error={invalidTime ? "End time must be after the start time" : undefined}>
            <TimeInput id="pb-end" value={v.endMinute} onChange={(m) => m != null && setV({ ...v, endMinute: m })} />
          </Field>
        </form>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="rhythm-protected-form" disabled={pending || !v.label.trim() || v.daysOfWeek.length === 0 || invalidTime}>
            {block ? "Save" : "Protect time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
