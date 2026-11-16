"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pause, Timer } from "lucide-react";

export interface ActiveTimer {
  id: string;
  status: "RUNNING" | "PAUSED";
  accumulatedSec: number;
  lastResumedAt: string | null;
  topic: string | null;
  taskId: string | null;
}

export function elapsedSeconds(t: ActiveTimer, now: number) {
  const running = t.status === "RUNNING" && t.lastResumedAt ? Math.max(0, Math.floor((now - new Date(t.lastResumedAt).getTime()) / 1000)) : 0;
  return t.accumulatedSec + running;
}

export function formatClock(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function LearningTimerPill({ timer }: { timer: ActiveTimer }) {
  const now = useNow();
  return (
    <Link
      href="/ai"
      className="press flex h-10 shrink-0 items-center gap-2 rounded-full border-2 border-ink bg-block-lime px-3 text-sm text-[#111111] shadow-brutal-sm outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground"
      aria-label={`Learning timer${timer.status === "PAUSED" ? ", paused" : ""} — open AI & Technology`}
    >
      {timer.status === "PAUSED" ? (
        <Pause aria-hidden className="size-4" strokeWidth={2.5} />
      ) : (
        <Timer aria-hidden className="size-4 animate-pulse motion-reduce:animate-none" strokeWidth={2.5} />
      )}
      <span className="font-mono font-medium tabular-nums">{formatClock(elapsedSeconds(timer, now))}</span>
      {/* The pause icon carries the state on narrow headers; the tag joins it from sm up. */}
      {timer.status === "PAUSED" && (
        <span aria-hidden className="hidden rounded-full border-2 border-[#111111] bg-[#FFFDF5] px-1.5 text-[10px] leading-4 font-semibold tracking-[0.08em] uppercase sm:inline">
          Paused
        </span>
      )}
    </Link>
  );
}
