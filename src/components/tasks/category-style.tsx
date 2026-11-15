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
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Danger fill for "missed" style badges (ink text on soft red). */
export const DANGER_FILL = "bg-[#FF8A8A]";

const HEX_TO_KEY: Record<string, string> = Object.fromEntries(Object.entries(CATEGORY_META).map(([k, m]) => [m.color.toUpperCase(), k]));

export function categoryBlock(key?: string | null, color?: string | null): string {
  if (key && CATEGORY_BLOCK[key]) return CATEGORY_BLOCK[key];
  const fromHex = color ? HEX_TO_KEY[color.toUpperCase()] : undefined;
  return (fromHex && CATEGORY_BLOCK[fromHex]) || "bg-block-stone";
}

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
