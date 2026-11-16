import { CATEGORY_META } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

/**
 * Bold Blocks category colours. Each category maps to a flat block fill
 * (always paired with ink text); the hex fallback covers views that only
 * carry a category colour (e.g. goals) and custom categories.
 */
export const CATEGORY_BLOCK: Record<string, string> = {
  ACADEMICS: "bg-block-sky",
  CAREER: "bg-block-sun",
  AI: "bg-block-violet",
  MBA: "bg-block-pink",
  FITNESS: "bg-block-lime",
  CREATIVITY: "bg-block-orange",
  PERSONAL: "bg-block-teal",
  FINANCE: "bg-block-stone",
};

/** Text colour used on top of any block fill (ink in both themes). */
export const ON_BLOCK = "text-ink";

/** Visible keyboard focus for custom controls: 2px ink outline, 2px offset. */
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

/** Danger fill for "missed" style badges (ink text on soft red). Uses the block
 *  token so the dark theme keeps #111111 text on it. */
export const DANGER_FILL = "bg-block-danger";

/** Ink text for hover-only block fills (hover:bg-block-*): text-ink turns cream
 *  in the dark theme unless the bg-block-* class itself is present. */
export const ON_BLOCK_HOVER = "hover:text-[#111111]";

/** Row controls that only appear on hover for mouse users; always visible on
 *  touch screens and whenever they (or their row) hold keyboard focus. */
export const REVEAL_ON_HOVER = "opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100";

const HEX_TO_KEY: Record<string, string> = Object.fromEntries(Object.entries(CATEGORY_META).map(([k, m]) => [m.color.toUpperCase(), k]));

export function categoryBlock(key?: string | null, color?: string | null): string {
  if (key && CATEGORY_BLOCK[key]) return CATEGORY_BLOCK[key];
  const fromHex = color ? HEX_TO_KEY[color.toUpperCase()] : undefined;
  return (fromHex && CATEGORY_BLOCK[fromHex]) || "bg-block-stone";
}

/** CSS colour value of a category's block fill, for inline styles such as progress bars. */
export function categoryBlockVar(key?: string | null, color?: string | null): string {
  return `var(--${categoryBlock(key, color).replace("bg-", "")})`;
}

/** Ink-bordered segmented container for prev / today / next navigation groups. */
export const SEGMENT = "flex items-center gap-0.5 rounded-[8px] border-2 border-ink bg-card p-0.5 shadow-brutal-sm";

/** Small square colour chip (ink-bordered) — the category marker on rows and cards. */
export function CategorySwatch({ categoryKey, color, className }: { categoryKey?: string | null; color?: string | null; className?: string }) {
  return <span className={cn("inline-block size-3 shrink-0 rounded-[3px] border-2 border-ink", categoryBlock(categoryKey, color), className)} aria-hidden />;
}

/** Block-coloured category label with ink text. */
export function CategoryChip({ categoryKey, color, name, className }: { categoryKey?: string | null; color?: string | null; name: string; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center rounded-[6px] border-2 border-ink px-1.5 py-px text-[11px] leading-4 font-semibold", categoryBlock(categoryKey, color), ON_BLOCK, className)}>
      <span className="truncate">{name}</span>
    </span>
  );
}
