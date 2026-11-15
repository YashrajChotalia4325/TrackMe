"use client";

import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({ label, htmlFor, error, hint, children, className }: { label: ReactNode; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
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
          "h-9 w-full appearance-none rounded-lg border border-input bg-transparent px-3 pr-8 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30 [&>option]:bg-popover",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
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
              "h-8 min-w-11 rounded-lg border px-2 text-xs font-medium transition-colors",
              on ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground",
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
      className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30 dark:[color-scheme:dark]"
    />
  );
}
