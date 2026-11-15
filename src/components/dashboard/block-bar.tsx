import { cn } from "@/lib/utils";

/** Diagonal hatch for the empty part of a track (a pattern, not a colour gradient). */
const STRIPES = "bg-[repeating-linear-gradient(-45deg,transparent_0_4px,color-mix(in_srgb,currentColor_16%,transparent)_4px_7px)]";

/**
 * Chunky progress bar: ink-bordered track with a flat block-colour fill and a hard
 * ink edge where the fill ends. Same progressbar semantics as the shared Bar.
 *
 * tone "theme" follows the theme (ink borders in light, cream in dark) for white cards;
 * tone "onBlock" keeps literal ink borders and a white track for use inside a colour block.
 */
export function BlockBar({
  value,
  max,
  fillClassName = "bg-block-lime",
  label,
  size = "md",
  striped = false,
  tone = "theme",
  className,
}: {
  value: number;
  max: number;
  fillClassName?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  striped?: boolean;
  tone?: "theme" | "onBlock";
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const edge = tone === "onBlock" ? "border-[#111111]" : "border-ink";
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      className={cn(
        "w-full overflow-hidden rounded-[5px] border-2",
        edge,
        tone === "onBlock" ? "bg-white text-[#111111]" : "bg-muted",
        size === "lg" ? "h-5" : size === "sm" ? "h-3" : "h-3.5",
        striped && STRIPES,
        className,
      )}
    >
      <div
        className={cn("h-full transition-[width] duration-700 ease-out motion-reduce:transition-none", pct > 0 && pct < 100 && cn("border-r-2", edge), fillClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
