"use client";

import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({ label, htmlFor, error, hint, children, className }: { label: ReactNode; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-semibold text-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Accessible, mobile-friendly native select styled to match inputs. */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function NativeSelect({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-10 w-full appearance-none rounded-[8px] border-2 border-ink bg-card px-3 pr-9 text-sm font-medium text-foreground outline-none transition-[box-shadow,background-color] focus-visible:shadow-brutal-sm focus-visible:ring-3 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-block-danger [&>option]:bg-popover [&>option]:text-popover-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-foreground" strokeWidth={2.5} aria-hidden />
    </div>
  );
});

/** Day-of-week multi toggle (0=Sun … 6=Sat), displayed Monday-first. */
export function DayPicker({ value, onChange, label = "Days" }: { value: number[]; onChange: (v: number[]) => void; label?: string }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {order.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={cn(
              "h-9 min-w-11 rounded-[8px] border-2 border-ink px-2 text-xs font-semibold transition-[background-color,color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
              on ? "bg-primary text-primary-foreground shadow-brutal-sm" : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {names[d]}
          </button>
        );
      })}
    </div>
  );
}

/** Time input bound to minutes-from-midnight. */
export function TimeInput({ value, onChange, id, disabled, "aria-label": ariaLabel }: { value: number | null; onChange: (m: number | null) => void; id?: string; disabled?: boolean; "aria-label"?: string }) {
  const str = value == null ? "" : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  return (
    <input
      id={id}
      type="time"
      step={300}
      disabled={disabled}
      aria-label={ariaLabel}
      value={str}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return onChange(null);
        const [h, m] = v.split(":").map(Number);
        onChange(h * 60 + m);
      }}
      className="h-10 w-full rounded-[8px] border-2 border-ink bg-card px-3 font-mono text-sm font-medium text-foreground tabular-nums outline-none transition-[box-shadow,background-color] focus-visible:shadow-brutal-sm focus-visible:ring-3 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 dark:[color-scheme:dark]"
    />
  );
}
