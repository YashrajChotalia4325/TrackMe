"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-md py-16 sm:py-24">
      <div role="alert" className="flex flex-col items-center rounded-[10px] border-2 border-ink bg-card px-6 py-9 text-center shadow-brutal-lg sm:px-8">
        <span aria-hidden className="mb-5 grid size-14 -rotate-3 place-items-center rounded-[10px] border-2 border-ink bg-[#FF8A8A] text-[#111111] shadow-brutal">
          <AlertTriangle className="size-7" strokeWidth={2.25} />
        </span>
        <h1 className="font-display text-2xl leading-tight font-extrabold tracking-[-0.03em]">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your data is safe. Try again — if it keeps happening, check that the database is running.</p>
        {error.digest && (
          <p className="mt-4 rounded-[6px] border-2 border-ink bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground tabular-nums">Ref: {error.digest}</p>
        )}
        <Button
          className="press mt-6 h-10 rounded-[8px] border-2 border-ink bg-primary px-4 font-semibold text-primary-foreground shadow-brutal-sm hover:bg-primary"
          onClick={reset}
        >
          <RotateCcw aria-hidden className="size-4" /> Try again
        </Button>
      </div>
    </div>
  );
}
