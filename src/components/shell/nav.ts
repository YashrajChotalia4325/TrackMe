import {
  BarChart3,
  Briefcase,
  CalendarDays,
  CalendarRange,
  Clapperboard,
  Cpu,
  Dumbbell,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  NotebookPen,
  Plug,
  Settings,
  Sparkles,
  Sun,
  Target,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Plan",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/my-day", label: "My Day", icon: Sun },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/planner", label: "Weekly Planner", icon: CalendarRange },
      { href: "/goals", label: "Goals & Milestones", icon: Target },
    ],
  },
  {
    label: "Life areas",
    items: [
      { href: "/academics", label: "Academics", icon: GraduationCap },
      { href: "/career", label: "Career", icon: Briefcase },
      { href: "/ai", label: "AI & Technology", icon: Cpu },
      { href: "/mba", label: "MBA Preparation", icon: Landmark },
      { href: "/fitness", label: "Fitness & Health", icon: Dumbbell },
      { href: "/creativity", label: "Creativity", icon: Clapperboard },
      { href: "/personal", label: "Personal", icon: Sparkles },
      { href: "/finance", label: "Finance", icon: Wallet },
    ],
  },
  {
    label: "Insight",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/reviews", label: "Reviews", icon: NotebookPen },
      { href: "/achievements", label: "Achievements", icon: Trophy },
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);
