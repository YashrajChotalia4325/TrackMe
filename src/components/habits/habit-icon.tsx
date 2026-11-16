import {
  Apple,
  Bed,
  Bike,
  BookOpen,
  Brain,
  Check,
  Code2,
  Coffee,
  Droplets,
  Dumbbell,
  Flower2,
  Footprints,
  HandHeart,
  Heart,
  Languages,
  Leaf,
  Moon,
  Music,
  PenLine,
  Phone,
  Pill,
  Salad,
  Smile,
  Sparkles,
  Sun,
  Target,
  Timer,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { HabitIconName } from "@/lib/domain/habits";
import { cn } from "@/lib/utils";

/** Lucide component for every allowed habit icon name. */
export const HABIT_ICON_COMPONENTS: Record<HabitIconName, LucideIcon> = {
  Check,
  Droplets,
  Dumbbell,
  Footprints,
  Bike,
  Bed,
  Moon,
  Sun,
  Brain,
  BookOpen,
  PenLine,
  Code2,
  Languages,
  Music,
  Apple,
  Salad,
  Coffee,
  Pill,
  Heart,
  HandHeart,
  Smile,
  Leaf,
  Flower2,
  Timer,
  Target,
  Wallet,
  Phone,
  Sparkles,
};

export function HabitIcon({ name, className }: { name: string; className?: string }) {
  const Icon = HABIT_ICON_COMPONENTS[name as HabitIconName] ?? Check;
  return <Icon className={cn("size-4", className)} aria-hidden />;
}

/**
 * Stored habit colours are the older Tailwind palette (kept as data). On screen each one maps to its
 * Bold Blocks fill so ink icons and text stay readable; unknown values fall back to the stored colour.
 */
const HABIT_FILL: Record<string, string> = {
  "#22C55E": "var(--block-lime, #C6F432)",
  "#14B8A6": "var(--block-teal, #5EE6C8)",
  "#3B82F6": "var(--block-sky, #7CC4FF)",
  "#A855F7": "var(--block-violet, #B69CFF)",
  "#EC4899": "var(--block-pink, #FF7AB6)",
  "#EF4444": "var(--block-danger, #FF8A8A)",
  "#F97316": "var(--block-orange, #FF9F43)",
  "#EAB308": "var(--block-sun, #FFD23F)",
  "#94A3B8": "var(--block-stone, #D9D2C2)",
};

/** Display fill (a block colour) for a stored habit colour. */
export function habitFill(color: string): string {
  return HABIT_FILL[color.toUpperCase()] ?? color;
}

/** Icon in an ink-bordered block: a flat habit-colour fill with an ink icon when done, a plain card with a colour corner otherwise. */
export function HabitBadge({ icon, color, filled = false, className }: { icon: string; color: string; filled?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[8px] border-2 border-border transition-colors duration-200 motion-reduce:transition-none",
        filled ? "on-block" : "bg-card text-foreground",
        className,
      )}
      style={filled ? { background: habitFill(color) } : { boxShadow: `inset 0 -4px 0 0 ${habitFill(color)}` }}
      aria-hidden
    >
      <HabitIcon name={icon} />
    </span>
  );
}
