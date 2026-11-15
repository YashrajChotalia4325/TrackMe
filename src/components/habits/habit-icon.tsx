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

/** Icon in an ink-bordered block — solid habit colour with ink icon when done, a light tint otherwise. */
export function HabitBadge({ icon, color, filled = false, className }: { icon: string; color: string; filled?: boolean; className?: string }) {
  return (
    <span
      className={cn("grid size-8 shrink-0 place-items-center rounded-lg border-2 border-border transition-colors duration-200", filled ? "text-ink" : "text-foreground", className)}
      style={filled ? { background: color } : { background: `${color}2e` }}
      aria-hidden
    >
      <HabitIcon name={icon} />
    </span>
  );
}
