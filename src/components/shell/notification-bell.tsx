"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markNotificationRead } from "@/server/actions/trackers";
import { useAction } from "@/components/common/use-action";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  type: string;
  read: boolean;
  createdAt: string;
}

export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const unread = items.filter((i) => !i.read).length;
  const { run, pending } = useAction();
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
            className="press relative grid size-10 shrink-0 place-items-center rounded-[8px] border-2 border-ink bg-card text-foreground shadow-brutal-sm outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground"
          />
        }
      >
        <Bell aria-hidden className="size-[18px]" strokeWidth={2.25} />
        {unread > 0 && <span aria-hidden className="absolute -top-1.5 -right-1.5 size-3.5 rounded-full border-2 border-ink bg-block-pink" />}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-4 py-3">
          <p className="flex items-center gap-2 font-display text-base font-extrabold tracking-[-0.01em]">
            Notifications
            {unread > 0 && (
              <span className="rounded-full border-2 border-ink bg-block-pink px-1.5 font-mono text-[11px] leading-4 font-medium text-[#111111] tabular-nums">{unread}</span>
            )}
          </p>
          {unread > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => markNotificationRead("all"), { success: false })}
              className="flex h-8 items-center gap-1 rounded-[8px] border-2 border-transparent px-2 text-xs font-semibold text-muted-foreground transition-colors outline-none hover:border-ink hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-50"
            >
              <CheckCheck aria-hidden className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm font-medium text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            items.map((n) => (
              <Link
                key={n.id}
                href={n.href ?? "#"}
                onClick={() => !n.read && run(() => markNotificationRead(n.id), { success: false })}
                className={cn(
                  "flex gap-3 border-b-2 border-muted px-4 py-3 text-sm transition-colors outline-none last:border-0 hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-foreground",
                  n.read && "text-muted-foreground",
                )}
              >
                <span aria-hidden className={cn("mt-1 size-2.5 shrink-0 rounded-full border-2", n.read ? "border-transparent" : "border-ink bg-block-pink")} />
                <span className="min-w-0">
                  <span className={cn("block", n.read ? "font-medium" : "font-semibold text-foreground")}>
                    {n.title}
                    {!n.read && <span className="sr-only"> (unread)</span>}
                  </span>
                  {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                </span>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
