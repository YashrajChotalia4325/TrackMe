import { cn } from "@/lib/utils";

/**
 * Bold Blocks class recipes shared by the life-area, insight, settings and integrations screens.
 * Everything here is plain Tailwind built on the theme tokens in globals.css; inline-style colours
 * use the block tokens with a hex fallback so they render even before the tokens load.
 */

/** Hex fallbacks for inline styles (charts, swatches). Text on these is always ink. */
export const BLOCK = {
  lime: "var(--color-block-lime, #C6F432)",
  pink: "var(--color-block-pink, #FF7AB6)",
  sky: "var(--color-block-sky, #7CC4FF)",
  sun: "var(--color-block-sun, #FFD23F)",
  violet: "var(--color-block-violet, #B69CFF)",
  orange: "var(--color-block-orange, #FF9F43)",
  teal: "var(--color-block-teal, #5EE6C8)",
  stone: "var(--color-block-stone, #D9D2C2)",
  danger: "#FF8A8A",
} as const;

/** Visible ink focus ring for hand-rolled interactive elements. */
export const focusRing = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

/** Standard card: 2px ink border, 10px radius, 4px hard shadow. */
export const card = "rounded-[10px] border-2 border-border bg-card shadow-brutal";
/** Card nested inside another card: same border, no shadow (avoids stacked depth). */
export const subCard = "rounded-[10px] border-2 border-border bg-card";
/** Muted inset box for notes, tips and secondary info. */
export const inset = "rounded-[10px] border-2 border-border bg-muted";
/** Dashed ink outline for empty / locked / "add new" areas. */
export const dashed = "rounded-[10px] border-2 border-dashed border-border";

/** Small uppercase label above a section or figure. */
export const eyebrow = "text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase";
/** Display font for titles and big figures. */
export const display = "font-display font-extrabold tracking-[-0.03em]";
/** Mono numbers: times, counts, amounts in lists and tables. */
export const num = "font-mono font-medium tabular-nums";

/** Flat block-coloured chip with ink border and ink text. Add a bg-block-* class. */
export const chip = "inline-flex shrink-0 items-center gap-1 rounded-md border-2 border-border px-1.5 py-0.5 text-[11px] leading-none font-semibold text-ink";

/** Hairline list dividers that work in both themes. */
export const divide = "divide-y-2 divide-foreground/10";

/** Small square icon button used for row actions (delete, edit). */
export const rowIconBtn = cn(
  "grid size-7 shrink-0 place-items-center rounded-md border-2 border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-block-pink hover:text-ink disabled:pointer-events-none disabled:opacity-50",
  focusRing,
);
/** Hide row actions until hover on pointer devices; always visible on touch and when focused. */
export const reveal = "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100";

/** Numbered step square (setup guides). */
export const stepNum = "grid size-6 shrink-0 place-items-center rounded-md border-2 border-border bg-block-sun font-mono text-xs font-semibold text-ink";

/** Inline code token. */
export const code = "rounded-[5px] border border-border bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground";

/** Segmented control (links or buttons): container + item. */
export const segList = "flex w-fit flex-wrap gap-1 rounded-[10px] border-2 border-border bg-card p-1 shadow-brutal-sm";
export function segItem(active: boolean) {
  return cn(
    "rounded-md border-2 px-3 py-1 text-sm font-semibold capitalize transition-colors",
    focusRing,
    active ? "border-border bg-primary text-primary-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

/** Overrides for the shared Tabs primitive to make a segmented, ink-bordered tab bar. */
export const tabsList = "h-auto flex-wrap justify-start gap-1 rounded-[10px] border-2 border-border bg-card p-1 shadow-brutal-sm group-data-horizontal/tabs:h-auto";
export const tabsTrigger = cn(
  "h-8 flex-none rounded-md border-2 border-transparent px-3 font-semibold text-muted-foreground hover:bg-muted hover:text-foreground",
  "focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
  "data-active:border-border data-active:bg-primary data-active:text-primary-foreground data-active:shadow-none",
  "dark:text-muted-foreground dark:data-active:border-border dark:data-active:bg-primary dark:data-active:text-primary-foreground",
);

/** Pill link / toggle (history lists, project switcher, note kinds). */
export function pill(active: boolean) {
  return cn(
    "inline-flex items-center rounded-full border-2 px-3 py-1 text-xs font-semibold transition-colors",
    focusRing,
    active ? "border-border bg-primary text-primary-foreground" : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
  );
}

/** Day / option toggle square (pressed = lime block). */
export function toggleBox(on: boolean) {
  return cn(
    "h-8 min-w-11 rounded-md border-2 px-2 text-xs font-semibold transition-colors",
    focusRing,
    on ? "border-border bg-primary text-primary-foreground" : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
  );
}
