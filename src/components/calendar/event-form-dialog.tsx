"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field, NativeSelect, TimeInput } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { createEvent, deleteEvent, updateEvent } from "@/server/actions/calendar";
import { ProposalDialog, type OpenProposal } from "@/components/tasks/proposal-dialog";
import { EVENT_TYPE_META } from "@/lib/domain/constants";

export interface EventView {
  id: string;
  title: string;
  type: string;
  date: string;
  endDate?: string | null;
  startMinute: number | null;
  endMinute: number | null;
  allDay: boolean;
  location?: string | null;
  notes?: string | null;
  blocksTime?: boolean;
  /** MANUAL | GOOGLE_CALENDAR | GMAIL — Google Calendar events are read-only here. */
  source?: string;
}

export function EventFormDialog({ open, onOpenChange, today, event, defaultDate, defaultType }: { open: boolean; onOpenChange: (v: boolean) => void; today: string; event?: EventView | null; defaultDate?: string; defaultType?: string }) {
  const { run, pending } = useAction();
  const [proposal, setProposal] = useState<OpenProposal | null>(null);
  const [v, setV] = useState(() => init());
  const readOnly = event?.source === "GOOGLE_CALENDAR";

  function init() {
    return {
      title: event?.title ?? "",
      type: event?.type ?? defaultType ?? "PERSONAL",
      date: event?.date ?? defaultDate ?? today,
      endDate: event?.endDate ?? "",
      startMinute: event?.startMinute ?? 18 * 60,
      endMinute: event?.endMinute ?? 19 * 60,
      allDay: event?.allDay ?? false,
      location: event?.location ?? "",
      notes: event?.notes ?? "",
      blocksTime: event?.blocksTime ?? EVENT_TYPE_META[event?.type ?? defaultType ?? "PERSONAL"].blocks,
    };
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setV(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id]);

  const submit = () => {
    if (readOnly) return;
    const payload = { ...v, endDate: v.endDate || null, location: v.location || undefined, notes: v.notes || undefined };
    if (event) {
      run(() => updateEvent(event.id, payload), { onSuccess: () => onOpenChange(false) });
    } else {
      run(() => createEvent(payload), {
        onSuccess: (d) => {
          onOpenChange(false);
          if (d.conflict) setProposal(d.conflict);
        },
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{readOnly ? "Google Calendar event" : event ? "Edit event" : "Add event"}</DialogTitle>
            <DialogDescription>Commitments that block time are protected — clashing flexible tasks get a re-plan proposal.</DialogDescription>
          </DialogHeader>
          {readOnly && (
            <p role="note" className="flex gap-2 rounded-[8px] border-2 border-ink bg-muted p-3 text-xs text-foreground">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>This event syncs from Google Calendar, so it&apos;s read-only here. Edit or delete it in Google Calendar and TrackMe will pick up the change on the next sync.</span>
            </p>
          )}
          <fieldset disabled={readOnly} className="grid min-w-0 gap-4">
            <Field label="Title" htmlFor="ev-title">
              <Input id="ev-title" autoFocus value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Product review meeting" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" htmlFor="ev-type">
                <NativeSelect id="ev-type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value, blocksTime: EVENT_TYPE_META[e.target.value].blocks })}>
                  {Object.entries(EVENT_TYPE_META).map(([k, m]) => (
                    <option key={k} value={k}>
                      {m.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Date" htmlFor="ev-date">
                <Input id="ev-date" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="dark:[color-scheme:dark]" />
              </Field>
            </div>
            <label className="flex items-center justify-between text-sm font-semibold">
              All day
              <Switch checked={v.allDay} onCheckedChange={(x) => setV({ ...v, allDay: x })} aria-label="All day" disabled={readOnly} />
            </label>
            {v.allDay ? (
              <Field label="End date (multi-day, optional)" htmlFor="ev-end-date">
                <Input id="ev-end-date" type="date" value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} className="dark:[color-scheme:dark]" />
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start" htmlFor="ev-start">
                  <TimeInput id="ev-start" value={v.startMinute} onChange={(m) => setV({ ...v, startMinute: m ?? 0 })} />
                </Field>
                <Field label="End" htmlFor="ev-end">
                  <TimeInput id="ev-end" value={v.endMinute} onChange={(m) => setV({ ...v, endMinute: m ?? 0 })} />
                </Field>
              </div>
            )}
            {readOnly && !v.allDay && v.endDate && v.endDate !== v.date && (
              <Field label="Ends on" htmlFor="ev-end-date-ro">
                <Input id="ev-end-date-ro" type="date" value={v.endDate} readOnly className="dark:[color-scheme:dark]" />
              </Field>
            )}
            <Field label="Location" htmlFor="ev-loc">
              <Input id="ev-loc" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} />
            </Field>
            <Field label="Notes" htmlFor="ev-notes">
              <Textarea id="ev-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-[8px] border-2 border-ink bg-muted p-3 text-sm">
              <span className="font-semibold">
                Blocks my time
                <span className="block text-xs font-normal text-muted-foreground">Turn off for deadlines that don&apos;t occupy a time slot.</span>
              </span>
              <Switch checked={v.blocksTime} onCheckedChange={(x) => setV({ ...v, blocksTime: x })} aria-label="Blocks time" disabled={readOnly} />
            </label>
          </fieldset>
          <DialogFooter className="gap-2">
            {event && !readOnly && (
              <Button variant="destructive" className="sm:mr-auto" disabled={pending} onClick={() => run(() => deleteEvent(event.id), { onSuccess: () => onOpenChange(false) })}>
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly && (
              <Button disabled={pending || !v.title.trim()} onClick={submit}>
                {event ? "Save" : "Add event"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProposalDialog value={proposal} onClose={() => setProposal(null)} />
    </>
  );
}

export function AddEventButton({ today, variant = "outline", label = "Add event", defaultType, size = "default" }: { today: string; variant?: "default" | "outline" | "secondary" | "ghost"; label?: string; defaultType?: string; size?: "default" | "sm" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <CalendarPlus className="size-4" /> {label}
      </Button>
      <EventFormDialog open={open} onOpenChange={setOpen} today={today} defaultType={defaultType} />
    </>
  );
}
