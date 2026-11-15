"use client";

import { useState } from "react";
import { Ban, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DayPicker, Field, NativeSelect, TimeInput } from "@/components/common/form";
import { EmptyState } from "@/components/common/ui";
import { useAction } from "@/components/common/use-action";
import { createEnergyWindow, deleteEnergyWindow, updateEnergyWindow } from "@/server/actions/rhythm";
import { formatDays } from "@/lib/domain/rhythm";
import { CATEGORY_KEYS, CATEGORY_META, type CategoryKeyT } from "@/lib/domain/constants";
import { formatMinute } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface EnergyWindowView {
  id: string;
  kind: "PREFER" | "AVOID";
  categoryKey: CategoryKeyT | null;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  label: string | null;
}

export function EnergyWindowsManager({ windows }: { windows: EnergyWindowView[] }) {
  const { run, pending } = useAction();
  const [dialog, setDialog] = useState<{ win: EnergyWindowView | null } | null>(null);

  return (
    <div className="space-y-3">
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl bg-muted/40 p-3">
          <dt className="flex items-center gap-1.5 font-medium text-success">
            <Zap className="size-3.5" aria-hidden /> Prefer
          </dt>
          <dd className="mt-0.5 text-muted-foreground">Put this work here when possible. If the window is full, it goes elsewhere.</dd>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <dt className="flex items-center gap-1.5 font-medium text-warning">
            <Ban className="size-3.5" aria-hidden /> Avoid
          </dt>
          <dd className="mt-0.5 text-muted-foreground">Never auto-schedule this work here. You can still place tasks manually.</dd>
        </div>
      </dl>

      {windows.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No energy windows yet"
          description="E.g. prefer Academics 6–9 AM when your mind is fresh, or avoid deep work right after lunch."
          action={
            <Button size="sm" onClick={() => setDialog({ win: null })}>
              <Plus className="size-4" aria-hidden /> Add energy window
            </Button>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {windows.map((w) => {
              const cat = w.categoryKey ? CATEGORY_META[w.categoryKey] : null;
              const what = cat?.name ?? "All work";
              return (
                <li key={w.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex w-16 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                      w.kind === "PREFER" ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                    )}
                  >
                    {w.kind === "PREFER" ? <Zap className="size-3" aria-hidden /> : <Ban className="size-3" aria-hidden />}
                    {w.kind === "PREFER" ? "Prefer" : "Avoid"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {cat && <span className="size-2 shrink-0 rounded-full" style={{ background: cat.color }} aria-hidden />}
                      {what}
                      {w.label && <span className="truncate font-normal text-muted-foreground">· {w.label}</span>}
                    </p>
                    <p className="tabular text-xs text-muted-foreground">
                      {formatDays(w.daysOfWeek)} · {formatMinute(w.startMinute)} – {formatMinute(w.endMinute)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${w.kind === "PREFER" ? "prefer" : "avoid"} window for ${what}`} onClick={() => setDialog({ win: w })}>
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    className="hover:text-destructive"
                    aria-label={`Remove ${w.kind === "PREFER" ? "prefer" : "avoid"} window for ${what}`}
                    onClick={() => run(() => deleteEnergyWindow(w.id))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button size="sm" variant="outline" onClick={() => setDialog({ win: null })}>
            <Plus className="size-4" aria-hidden /> Add energy window
          </Button>
        </>
      )}
      <EnergyDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function EnergyDialog({ state, onClose }: { state: { win: EnergyWindowView | null } | null; onClose: () => void }) {
  const { run, pending } = useAction();
  // Remember the item being edited so the dialog doesn't flash to "new" while it animates closed.
  const [win, setWin] = useState<EnergyWindowView | null>(state?.win ?? null);
  const init = (w: EnergyWindowView | null) => ({
    kind: w?.kind ?? ("PREFER" as "PREFER" | "AVOID"),
    // An "All categories" window has categoryKey null — keep it null when editing.
    categoryKey: (w ? w.categoryKey : "ACADEMICS") as CategoryKeyT | null,
    daysOfWeek: w?.daysOfWeek ?? [1, 2, 3, 4, 5],
    startMinute: w?.startMinute ?? 6 * 60,
    endMinute: w?.endMinute ?? 9 * 60,
    label: w?.label ?? "",
  });
  const [v, setV] = useState(() => init(win));
  const [seen, setSeen] = useState<typeof state>(null);
  if (state !== seen) {
    setSeen(state);
    if (state) {
      setWin(state.win);
      setV(init(state.win));
    }
  }
  const invalidTime = v.endMinute <= v.startMinute;

  return (
    <Dialog open={state != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{win ? "Edit energy window" : "New energy window"}</DialogTitle>
          <DialogDescription>Applies to new plans and reschedules. Existing tasks are not moved.</DialogDescription>
        </DialogHeader>
        <form
          id="rhythm-energy-form"
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const payload = { ...v, label: v.label.trim() || null };
            run(() => (win ? updateEnergyWindow(win.id, payload) : createEnergyWindow(payload)), { onSuccess: onClose });
          }}
        >
          <Field
            label="Kind"
            htmlFor="ew-kind"
            hint={v.kind === "PREFER" ? "Put this work here when possible." : "Never auto-schedule this work here."}
          >
            <NativeSelect id="ew-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as "PREFER" | "AVOID" })}>
              <option value="PREFER">Prefer</option>
              <option value="AVOID">Avoid</option>
            </NativeSelect>
          </Field>
          <Field label="Work" htmlFor="ew-cat">
            <NativeSelect id="ew-cat" value={v.categoryKey ?? ""} onChange={(e) => setV({ ...v, categoryKey: (e.target.value || null) as CategoryKeyT | null })}>
              <option value="">All categories</option>
              {CATEGORY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {CATEGORY_META[k].name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Days" className="sm:col-span-2">
            <DayPicker value={v.daysOfWeek} onChange={(d) => setV({ ...v, daysOfWeek: d })} label="Days this window applies" />
          </Field>
          <Field label="From" htmlFor="ew-start">
            <TimeInput id="ew-start" value={v.startMinute} onChange={(m) => m != null && setV({ ...v, startMinute: m })} />
          </Field>
          <Field label="Until" htmlFor="ew-end" error={invalidTime ? "End time must be after the start time" : undefined}>
            <TimeInput id="ew-end" value={v.endMinute} onChange={(m) => m != null && setV({ ...v, endMinute: m })} />
          </Field>
          <Field label="Note (optional)" htmlFor="ew-label" className="sm:col-span-2">
            <Input id="ew-label" value={v.label} maxLength={60} onChange={(e) => setV({ ...v, label: e.target.value })} placeholder="e.g. Fresh mind, post-lunch slump" />
          </Field>
        </form>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="rhythm-energy-form" disabled={pending || v.daysOfWeek.length === 0 || invalidTime}>
            {win ? "Save" : "Add window"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
