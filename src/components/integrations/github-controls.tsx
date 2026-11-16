"use client";

import { useState, useTransition } from "react";
import { GitBranch, Link2Off, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAction } from "@/components/common/use-action";
import { authClient } from "@/lib/auth-client";
import { disconnectGithub, syncGithubNow } from "@/server/actions/github";

/**
 * Starts Better Auth's GitHub link flow (read:user scope only). Linking an
 * already-linked GitHub account again refreshes its token ("Reconnect").
 */
export function GithubConnectButton({ reconnect = false, variant = "default" }: { reconnect?: boolean; variant?: "default" | "outline" }) {
  const [pending, startTransition] = useTransition();
  const label = reconnect ? "Reconnect GitHub" : "Connect GitHub";
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const r = await authClient.linkSocial({ provider: "github", scopes: ["read:user"], callbackURL: "/integrations", errorCallbackURL: "/integrations" });
            if (r?.error) toast.error(r.error.message ?? "Couldn't start the GitHub connection.");
          } catch {
            toast.error("Couldn't start the GitHub connection. Please try again.");
          }
        })
      }
    >
      <GitBranch className="size-4" aria-hidden /> {pending ? "Opening GitHub…" : label}
    </Button>
  );
}

export function GithubSyncControls({ login, needsReconnect = false }: { login: string | null; needsReconnect?: boolean }) {
  const { run, pending } = useAction();
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {needsReconnect && <GithubConnectButton reconnect />}
      <Button variant="outline" disabled={pending} onClick={() => run(() => syncGithubNow())}>
        <RefreshCw className={pending ? "size-4 motion-safe:animate-spin" : "size-4"} aria-hidden /> Sync now
      </Button>
      <Button variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => setConfirmOpen(true)}>
        <Link2Off className="size-4" aria-hidden /> Disconnect
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect GitHub?</AlertDialogTitle>
            <AlertDialogDescription>
              TrackMe will unlink {login ? <strong>@{login}</strong> : "your GitHub account"}, revoke its read-only access and delete the GitHub activity it has stored. Nothing on GitHub itself is
              changed. You can reconnect any time and your recent activity will sync again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep connected</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => disconnectGithub(), { onSuccess: () => setConfirmOpen(false) })}>
              {pending ? "Disconnecting…" : "Disconnect and delete data"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
