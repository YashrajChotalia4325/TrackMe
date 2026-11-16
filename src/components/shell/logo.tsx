import { cn } from "@/lib/utils";

/*
 * TrackMe brand components ("Bold Blocks").
 *
 * Mark — "Twin blocks": two overlapping sticker tiles on a 64-unit grid, a lime tile
 * with an ink "T" (top-left) and a pink tile with an ink "M" (bottom-right), each with a
 * 4-unit ink border and a 4-unit hard shadow, plus a small sun-yellow check dot in the
 * free top-right corner ("done"). Three cuts keep it legible at every size:
 *   - >= 40px: full mark with the check dot
 *   - 24–39px: the two tiles without the dot
 *   - < 24px: a single tile split lime | pink with pixel-snapped T and M (favicon cut)
 *
 * Colours are literal so the brand renders correctly before theme tokens load. The hard
 * shadows, and the outer borders of the "Me" block and "By Yash" tag, use currentColor,
 * so they read as ink in the light theme and cream in the dark theme.
 */

const INK = "#111111";
const LIME = "#C6F432";
const PINK = "#FF7AB6";
const SUN = "#FFD23F";

type MarkProps = {
  size?: number;
  className?: string;
  /** Hide from assistive tech when visible text next to it already says "TrackMe". */
  decorative?: boolean;
};

export function LogoMark({ size = 32, className, decorative = false }: MarkProps) {
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": "TrackMe" } as const);

  if (size < 24) {
    // Favicon cut: one tile split lime | pink, T and M snapped to a 16px pixel grid.
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className={cn("shrink-0", className)} {...a11y}>
        <path d="M3 0h5v16H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3z" fill={LIME} />
        <path d="M8 0h5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H8z" fill={PINK} />
        <g fill={INK} shapeRendering="crispEdges">
          <rect x="1" y="3" width="6" height="2" />
          <rect x="3" y="5" width="2" height="8" />
          <rect x="8" y="3" width="2" height="10" />
          <rect x="13" y="3" width="2" height="10" />
          <rect x="10" y="4" width="1" height="2" />
          <rect x="12" y="4" width="1" height="2" />
          <rect x="11" y="5" width="1" height="2" />
        </g>
      </svg>
    );
  }

  const withDot = size >= 40;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn("shrink-0", className)} {...a11y}>
      {/* T tile: hard shadow, ink border, lime face, T glyph */}
      <rect x="4" y="4" width="34" height="34" rx="6" fill="currentColor" />
      <rect x="0" y="0" width="34" height="34" rx="6" fill={INK} />
      <rect x="4" y="4" width="26" height="26" rx="2.5" fill={LIME} />
      <path d="M8 8h18v6h-6v12h-6V14H8z" fill={INK} />
      {/* M tile */}
      <rect x="30" y="30" width="34" height="34" rx="6" fill="currentColor" />
      <rect x="26" y="26" width="34" height="34" rx="6" fill={INK} />
      <rect x="30" y="30" width="26" height="26" rx="2.5" fill={PINK} />
      <path d="M32 52V34h7l4 7 4-7h7v18h-6v-8l-3 5h-4l-3-5v8z" fill={INK} />
      {withDot && (
        <>
          {/* "done" check dot */}
          <circle cx="54" cy="15" r="8" fill="currentColor" />
          <circle cx="50" cy="11" r="8" fill={INK} />
          <circle cx="50" cy="11" r="5" fill={SUN} />
          <path d="M47.2 11.2l1.9 1.9 3.6-3.8" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display inline-flex items-baseline whitespace-nowrap text-xl leading-none font-extrabold tracking-[-0.03em]",
        className,
      )}
    >
      Track
      <span className="ml-[0.1em] inline-block -rotate-3 rounded-[0.18em] border-2 border-current bg-[#FF7AB6] px-[0.14em] pt-[0.02em] pb-[0.06em] tracking-[-0.02em] shadow-[2px_2px_0_currentColor]">
        <span className="text-[#111111]">Me</span>
      </span>
    </span>
  );
}

export function ByYash({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[6px] border-2 border-current bg-[#FFFDF5] px-1.5 py-px font-sans text-xs leading-4 font-semibold shadow-[2px_2px_0_currentColor]",
        className,
      )}
    >
      <span className="text-[#111111]">By Yash</span>
    </span>
  );
}

export function BrandLockup({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  if (collapsed) {
    return (
      <span className={cn("inline-flex items-center", className)}>
        <LogoMark size={36} />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <LogoMark size={36} decorative />
      <span className="flex min-w-0 flex-col items-start gap-1.5">
        <Wordmark />
        <ByYash />
      </span>
    </span>
  );
}

/** Back-compat alias: the mark alone, sized by className (default size-8). Decorative, as before. */
export function Logo({ className = "size-8" }: { className?: string }) {
  return <LogoMark size={32} decorative className={className} />;
}
