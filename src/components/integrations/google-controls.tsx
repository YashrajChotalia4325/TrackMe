"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Link2, Loader2, Mail, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAction } from "@/components/common/use-action";
import { authClient } from "@/lib/auth-client";
import { GOOGLE_SCOPES } from "@/lib/domain/google-calendar";
import { disconnectGoogle, setGoogleFeature, syncGoogleNow } from "@/server/actions/google";

/** Starts Google's consent screen for just this feature's read-only scope (incremental authorization). */
export function ConnectGoogleButton({ feature, reconnect = false }: { feature: "calendar" | "gmail"; reconnect?: boolean }) {
  const [pending, startTransition] = useTransition();
  const name = feature === "calendar" ? "Calendar" : "Gmail";
  const Icon = feature === "calendar" ? CalendarDays : Mail;
  const connect = () =>
    startTransition(async () => {
      try {
        const res = await authClient.linkSocial({ provider: "google", scopes: [GOOGLE_SCOPES[feature]], callbackURL: "/integrations", errorCallbackURL: "/integrations" });
        if (res?.error) toast.error(res.error.message || `Couldn't start the Google ${name} connection.`);
      } catch {
        toast.error(`Couldn't start the Google ${name} connection. Please try again.`);
      }
    });
  return (
    <Button size="sm" variant={reconnect ? "outline" : "default"} onClick={connect} disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : reconnect ? <Link2 className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
      {reconnect ? `Reconnect ${name}` : `Connect ${name}`}
    </Button>
  );
}

export function GoogleFeatureSwitch({ provider, enabled, label }: { provider: "GOOGLE_CALENDAR" | "GMAIL"; enabled: boolean; label: string }) {
  const { run, pending } = useAction();
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch size="sm" checked={enabled} disabled={pending} onCheckedChange={(on) => run(() => setGoogleFeature(provider, on))} aria-label={label} />
      {enabled ? "On" : "Paused"}
    </label>
  );
}

export function GoogleSyncButton() {
  const { run, pending } = useAction();
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => syncGoogleNow())}>
      <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
      {pending ? "Syncing…" : "Sync now"}
    </Button>
  );
}

export function DisconnectGoogleButton() {
  const [open, setOpen] = useState(false);
  const { run, pending } = useAction();
  return (
    <>
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Unlink className="size-3.5" aria-hidden /> Disconnect
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect Google?</DialogTitle>
            <DialogDescription>TrackMe will revoke its read-only access to your Google account.</DialogDescription>
          </DialogHeader>
          <ul className="grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
            <li>Upcoming events synced from Google Calendar are removed from TrackMe. Past ones stay in your history.</li>
            <li>Pending and dismissed inbox suggestions are deleted.</li>
            <li>Events and applications you created from accepted suggestions are kept.</li>
            <li>Nothing in your Google account is changed.</li>
          </ul>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => disconnectGoogle(), { onSuccess: () => setOpen(false) })}>
              {pending ? "Disconnecting…" : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
