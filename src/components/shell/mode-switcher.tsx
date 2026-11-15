"use client";

import { BookOpenCheck, ChevronDown, HeartPulse, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setMode } from "@/server/actions/settings";
import { useAction } from "@/components/common/use-action";
import { MODE_META, type ModeT } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

const ICONS = { NORMAL: Sun, EXAM: BookOpenCheck, RECOVERY: HeartPulse } as const;
/** Mode colour blocks: Normal = stone, Exam = sun, Recovery = lime. */
const BLOCK = { NORMAL: "bg-block-stone", EXAM: "bg-block-sun", RECOVERY: "bg-block-lime" } as const;

export function ModeSwitcher({ mode }: { mode: ModeT }) {
  const { run, pending } = useAction();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={pending}
            className="press flex h-10 min-w-0 items-center gap-2 rounded-full border-2 border-ink bg-card pr-3 pl-2.5 text-sm text-muted-foreground shadow-brutal-sm outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-60"
            aria-label={`Scheduling mode: ${MODE_META[mode].label}. Change mode`}
          />
        }
      >
        <span aria-hidden className={cn("size-3.5 shrink-0 rounded-full border-2 border-ink", BLOCK[mode])} />
        <span className="truncate font-semibold text-foreground">{MODE_META[mode].label}</span>
        <span aria-hidden className="hidden sm:inline">mode</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-foreground" strokeWidth={2.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Scheduling mode</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {(Object.keys(MODE_META) as ModeT[]).map((m) => {
          const Icon = ICONS[m];
          return (
            <DropdownMenuItem key={m} onClick={() => m !== mode && run(() => setMode(m))} className="items-start gap-3 py-2">
              <span aria-hidden className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-[6px] border-2 border-ink text-[#111111]", BLOCK[m])}>
                <Icon className="size-3.5" strokeWidth={2.5} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold">
                  {MODE_META[m].label}
                  {m === mode && (
                    <span className="rounded-full border-2 border-ink bg-block-lime px-1.5 text-[10px] leading-4 font-semibold tracking-[0.08em] text-[#111111] uppercase">Active</span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">{MODE_META[m].description}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
