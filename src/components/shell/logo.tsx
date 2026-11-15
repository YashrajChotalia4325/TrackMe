import { cn } from "@/lib/utils";

/*
 * TrackMe brand components ("Bold Blocks").
 *
 * Mark: a lime block with a 4-unit ink border and a hard offset shadow, holding the
 * "T-check": a square-ended T crossbar that the long arm of a mitred check rises into.
 * All strokes share one weight; caps are square and the vertex is mitred so the glyph
 * stays blocky and crisp. Below 24px a simplified cut is used (no shadow, heavier glyph).
 *
 * Colours are literal so the brand renders correctly before theme tokens load. The hard
 * shadow, and the outer borders of the "Me" block and "By Yash" tag, use currentColor, so
 * they read as ink in the light theme and cream in the dark theme.
 */

const INK = "#111111";
const LIME = "#C6F432";

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
    // Small-size cut: fills the square, drops the shadow, thicker glyph.
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" className={cn("shrink-0", className)} {...a11y}>
        <rect x="2" y="2" width="60" height="60" rx="14" fill={LIME} stroke={INK} strokeWidth="4" />
        <path d="M14 12h36v9H14z" fill={INK} />
        <path d="M19 35l9 9L39 18" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="square" strokeLinejoin="miter" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn("shrink-0", className)} {...a11y}>
      <rect x="5" y="5" width="59" height="59" rx="12" fill="currentColor" />
      <rect x="2" y="2" width="55" height="55" rx="10" fill={LIME} stroke={INK} strokeWidth="4" />
      <path d="M14 12h32v7H14z" fill={INK} />
      <path d="M17 33l8 8L34 17" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="square" strokeLinejoin="miter" />
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
