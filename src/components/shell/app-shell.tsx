"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, Moon, PanelLeft, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import {
  AnimatedSidebar,
  AnimatedSidebarClose,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarHeader,
  AnimatedSidebarInset,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem,
  AnimatedSidebarProvider,
  AnimatedSidebarRail,
  AnimatedSidebarTrigger,
  useSidebarCollapsed,
} from "@/components/ui/animated-sidebar";
import { NAV_GROUPS } from "./nav";
import { BrandLockup } from "./logo";
import { NotificationBell, type NotificationItem } from "./notification-bell";
import { ModeSwitcher } from "./mode-switcher";
import { LearningTimerPill, type ActiveTimer } from "./learning-timer-pill";
import { signOut } from "@/lib/auth-client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModeT } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "tm.sidebar.open";

/** 40px square, ink-bordered header control with a hard shadow and the press lift/sink. */
const ICON_BUTTON =
  "press grid size-10 shrink-0 place-items-center rounded-[8px] border-2 border-ink bg-card text-foreground shadow-brutal-sm outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function AppShell({
  children,
  user,
  mode,
  notifications,
  timer,
  level,
}: {
  children: ReactNode;
  user: { name: string; email: string; image: string | null };
  mode: ModeT;
  notifications: NotificationItem[];
  timer: ActiveTimer | null;
  level: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v != null) setOpen(v === "1");
    } catch {}
  }, []);

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0");
    } catch {}
  };

  return (
    <AnimatedSidebarProvider open={open} onOpenChange={onOpenChange}>
      <AnimatedSidebar ariaLabel="TrackMe navigation" collapsible="icon">
        <AnimatedSidebarHeader className="border-b-2 border-ink px-3 py-4">
          <SidebarBrand />
        </AnimatedSidebarHeader>

        <AnimatedSidebarContent className="px-2 py-3">
          {NAV_GROUPS.map((group) => (
            <AnimatedSidebarGroup key={group.label}>
              <AnimatedSidebarGroupLabel>{group.label}</AnimatedSidebarGroupLabel>
              <AnimatedSidebarGroupContent>
                <AnimatedSidebarMenu>
                  {group.items.map(({ href, label, icon: Icon }) => (
                    <AnimatedSidebarMenuItem key={href}>
                      <AnimatedSidebarMenuButton href={href} isActive={pathname === href || pathname.startsWith(`${href}/`)} icon={<Icon className="size-[18px]" strokeWidth={2.25} />}>
                        {label}
                      </AnimatedSidebarMenuButton>
                    </AnimatedSidebarMenuItem>
                  ))}
                </AnimatedSidebarMenu>
              </AnimatedSidebarGroupContent>
            </AnimatedSidebarGroup>
          ))}
        </AnimatedSidebarContent>

        <AnimatedSidebarFooter className="p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div
            className={cn(
              "flex items-center gap-2.5 overflow-hidden rounded-[10px] border-2 border-ink bg-card p-1.5 shadow-brutal-sm",
              "group-data-[state=collapsed]/sidebar:border-transparent group-data-[state=collapsed]/sidebar:bg-transparent group-data-[state=collapsed]/sidebar:shadow-none",
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-ink bg-block-sky font-display text-xs font-extrabold tracking-[-0.01em] text-[#111111]">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="size-full object-cover" />
              ) : (
                user.name.slice(0, 2).toUpperCase()
              )}
            </span>
            <span className="min-w-0 flex-1 group-data-[state=collapsed]/sidebar:hidden">
              <span className="block truncate text-sm leading-tight font-semibold">{user.name}</span>
              <span className="mt-0.5 block truncate font-mono text-[11px] leading-tight font-medium text-muted-foreground tabular-nums">Level {level}</span>
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Sign out"
                    className="grid size-8 shrink-0 place-items-center rounded-[8px] border-2 border-transparent text-muted-foreground transition-colors outline-none hover:border-ink hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground group-data-[state=collapsed]/sidebar:hidden"
                    onClick={async () => {
                      await signOut();
                      router.push("/login");
                      router.refresh();
                    }}
                  />
                }
              >
                <LogOut aria-hidden className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Sign out</TooltipContent>
            </Tooltip>
          </div>
        </AnimatedSidebarFooter>
        <AnimatedSidebarRail />
      </AnimatedSidebar>

      <AnimatedSidebarInset>
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2.5 border-b-2 border-ink bg-background px-3 sm:gap-3 sm:px-5">
          <AnimatedSidebarTrigger className={ICON_BUTTON}>
            <PanelLeft aria-hidden className="size-[18px]" strokeWidth={2.25} />
          </AnimatedSidebarTrigger>
          <ModeSwitcher mode={mode} />
          <div className="ml-auto flex items-center gap-2.5">
            {timer && <LearningTimerPill timer={timer} />}
            <NotificationBell items={notifications} />
            <ThemeToggle />
          </div>
        </header>
        <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </AnimatedSidebarInset>
    </AnimatedSidebarProvider>
  );
}

/** Sidebar header: the full lockup with the "By Yash" tag when expanded, the mark alone when collapsed. */
function SidebarBrand() {
  const collapsed = useSidebarCollapsed();
  return (
    <div className={cn("flex min-h-12 items-center gap-2 overflow-hidden", collapsed ? "justify-center" : "px-1")}>
      <BrandLockup collapsed={collapsed} />
      <AnimatedSidebarClose className={cn(ICON_BUTTON, "ml-auto md:hidden")}>
        <X aria-hidden className="size-4" strokeWidth={2.5} />
      </AnimatedSidebarClose>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setTheme(dark ? "light" : "dark")}
            className={ICON_BUTTON}
          />
        }
      >
        {dark ? <Sun aria-hidden className="size-[18px]" strokeWidth={2.25} /> : <Moon aria-hidden className="size-[18px]" strokeWidth={2.25} />}
      </TooltipTrigger>
      <TooltipContent>{dark ? "Light mode" : "Dark mode"}</TooltipContent>
    </Tooltip>
  );
}
