"use client";
// Source: 21st.dev — shadcnui-blocks/progress-10 (Circular Progress with Custom Color).
// Adapted: exact circumference (Math.PI), clamped value, animated stroke, ARIA meter semantics.
// Bold Blocks: the ring is a thick band with hard outlines on both edges. The outlines use
// currentColor (ink in light, cream in dark, or whatever text colour the parent sets), the
// track defaults to the card colour and the arc to the primary block colour (lime).

import * as React from "react";
import { cn } from "@/lib/utils";

interface CircularProgressProps {
  value: number;
  renderLabel?: (progress: number) => React.ReactNode;
  size?: number;
  strokeWidth?: number;
  shape?: "square" | "round";
  className?: string;
  progressClassName?: string;
  labelClassName?: string;
  showLabel?: boolean;
  ariaLabel?: string;
  style?: React.CSSProperties;
}

export function CircularProgress({
  value,
  renderLabel,
  className,
  progressClassName,
  labelClassName,
  showLabel,
  shape = "round",
  size = 100,
  strokeWidth = 10,
  ariaLabel,
  style,
}: CircularProgressProps) {
  const v = Math.max(0, Math.min(100, value));
  const outline = Math.max(2, Math.round(size / 48));
  const radius = size / 2 - strokeWidth / 2 - outline;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * ((100 - v) / 100);
  const c = size / 2;

  return (
    <div className="relative inline-grid place-items-center" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={ariaLabel} style={style}>
      <svg height={size} width={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden>
        <circle className={cn("stroke-card", className)} cx={c} cy={c} fill="transparent" r={radius} strokeWidth={strokeWidth} />
        <circle
          className={cn("stroke-primary transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none", progressClassName)}
          cx={c}
          cy={c}
          fill="transparent"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap={shape === "round" ? "round" : "butt"}
          strokeWidth={strokeWidth}
        />
        {/* Hard outlines on both edges of the band. */}
        <circle cx={c} cy={c} fill="none" r={radius + strokeWidth / 2} stroke="currentColor" strokeWidth={outline} />
        <circle cx={c} cy={c} fill="none" r={Math.max(0, radius - strokeWidth / 2)} stroke="currentColor" strokeWidth={outline} />
      </svg>
      {showLabel && <div className={cn("absolute inset-0 flex items-center justify-center", labelClassName)}>{renderLabel ? renderLabel(v) : v}</div>}
    </div>
  );
}

export default CircularProgress;
