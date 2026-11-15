import type { CategoryKeyT, ModeT } from "@/lib/domain/constants";

/*
 * Bold Blocks helpers for the dashboard.
 *
 * Block colours are flat fills that keep ink (#111111) text in both themes, so text
 * sitting on a block uses the literal ink colour rather than the theme foreground.
 * Class strings are written out in full so Tailwind can see them.
 */

export type BlockName = "lime" | "pink" | "sky" | "sun" | "violet" | "orange" | "teal" | "stone";

/** Literal block colours, for SVG fills (charts) where a utility class can't reach. */
export const BLOCK_HEX: Record<BlockName, string> = {
  lime: "#C6F432",
  pink: "#FF7AB6",
  sky: "#7CC4FF",
  sun: "#FFD23F",
  violet: "#B69CFF",
  orange: "#FF9F43",
  teal: "#5EE6C8",
  stone: "#D9D2C2",
};

export const BLOCK_BG: Record<BlockName, string> = {
  lime: "bg-block-lime",
  pink: "bg-block-pink",
  sky: "bg-block-sky",
  sun: "bg-block-sun",
  violet: "bg-block-violet",
  orange: "bg-block-orange",
  teal: "bg-block-teal",
  stone: "bg-block-stone",
};

/** Category colours of the design system (fixed, independent of user-picked hex colours). */
export const CATEGORY_BLOCK: Record<CategoryKeyT, BlockName> = {
  ACADEMICS: "sky",
  CAREER: "sun",
  AI: "violet",
  MBA: "pink",
  FITNESS: "lime",
  CREATIVITY: "orange",
  PERSONAL: "teal",
  FINANCE: "stone",
};

export function categoryBlock(key: string | null | undefined): BlockName {
  return key && Object.prototype.hasOwnProperty.call(CATEGORY_BLOCK, key) ? CATEGORY_BLOCK[key as CategoryKeyT] : "stone";
}

export const MODE_BLOCK: Record<ModeT, BlockName> = {
  NORMAL: "lime",
  EXAM: "sun",
  RECOVERY: "teal",
};

/** Visible 2px ink focus outline with a 2px offset, for custom interactive elements. */
export const focusRing =
  "outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ink";

/** Small eyebrow / label text: Geist 600, uppercase, tracked out. */
export const eyebrow = "text-[11px] font-semibold tracking-[0.08em] uppercase";
