/**
 * Domain constants and configurable defaults. Nothing here is personal data —
 * these are starting values the user can change in Settings.
 */

export const CATEGORY_KEYS = [
  "ACADEMICS",
  "CAREER",
  "AI",
  "MBA",
  "FITNESS",
  "CREATIVITY",
  "PERSONAL",
  "FINANCE",
] as const;
export type CategoryKeyT = (typeof CATEGORY_KEYS)[number];

/** Categories that participate in the daily score. */
export const SCORED_CATEGORIES: CategoryKeyT[] = [
  "ACADEMICS",
  "CAREER",
  "AI",
  "MBA",
  "FITNESS",
  "CREATIVITY",
  "PERSONAL",
];

export const CATEGORY_META: Record<
  CategoryKeyT,
  { name: string; color: string; icon: string; href: string }
> = {
  ACADEMICS: { name: "Academics", color: "#7CC4FF", icon: "GraduationCap", href: "/academics" },
  CAREER: { name: "Career", color: "#FFD23F", icon: "Briefcase", href: "/career" },
  AI: { name: "AI & Technology", color: "#B69CFF", icon: "Cpu", href: "/ai" },
  MBA: { name: "MBA Preparation", color: "#FF7AB6", icon: "Landmark", href: "/mba" },
  FITNESS: { name: "Fitness & Health", color: "#C6F432", icon: "Dumbbell", href: "/fitness" },
  CREATIVITY: { name: "Creativity", color: "#FF9F43", icon: "Clapperboard", href: "/creativity" },
  PERSONAL: { name: "Personal", color: "#5EE6C8", icon: "Sparkles", href: "/personal" },
  FINANCE: { name: "Finance", color: "#D9D2C2", icon: "Wallet", href: "/finance" },
};

export type Weights = Partial<Record<CategoryKeyT, number>>;

export const DEFAULT_WEIGHTS: Record<"NORMAL" | "EXAM" | "RECOVERY", Weights> = {
  NORMAL: { ACADEMICS: 20, CAREER: 20, AI: 15, MBA: 10, FITNESS: 15, CREATIVITY: 10, PERSONAL: 10 },
  EXAM: { ACADEMICS: 50, CAREER: 10, AI: 10, MBA: 5, FITNESS: 15, CREATIVITY: 0, PERSONAL: 10 },
  // Recovery mode rewards rest and health; nothing is penalised for being paused.
  RECOVERY: { ACADEMICS: 10, CAREER: 10, AI: 5, MBA: 5, FITNESS: 40, CREATIVITY: 0, PERSONAL: 30 },
};

export type ModeT = "NORMAL" | "EXAM" | "RECOVERY";

export const MODE_META: Record<ModeT, { label: string; description: string; tone: string }> = {
  NORMAL: {
    label: "Normal",
    description: "Balanced days across all of your goals.",
    tone: "text-foreground",
  },
  EXAM: {
    label: "Examination",
    description: "Academics first. Optional work is trimmed; fitness stays.",
    tone: "text-amber-400",
  },
  RECOVERY: {
    label: "Recovery",
    description: "Lower expectations, protected rest. No penalties.",
    tone: "text-emerald-400",
  },
};

/** Default weekly targets (seeded per user, fully editable). */
export const DEFAULT_WEEKLY_TARGETS: {
  key: string;
  label: string;
  category: CategoryKeyT;
  unit: "MINUTES" | "SESSIONS";
  normal: number;
  exam: number;
  recovery: number;
  blockMin: number;
  autoPlan: boolean;
  optionalInExam: boolean;
}[] = [
  { key: "ai-learning", label: "AI & tech learning", category: "AI", unit: "MINUTES", normal: 360, exam: 150, recovery: 0, blockMin: 60, autoPlan: true, optionalInExam: true },
  { key: "gym", label: "Gym sessions", category: "FITNESS", unit: "SESSIONS", normal: 4, exam: 3, recovery: 0, blockMin: 60, autoPlan: true, optionalInExam: false },
  { key: "cardio", label: "Cardio sessions", category: "FITNESS", unit: "SESSIONS", normal: 2, exam: 1, recovery: 0, blockMin: 30, autoPlan: false, optionalInExam: true },
  { key: "mba-reading", label: "Business / economics reading", category: "MBA", unit: "SESSIONS", normal: 3, exam: 1, recovery: 0, blockMin: 30, autoPlan: true, optionalInExam: true },
  { key: "mba-awareness", label: "General awareness", category: "MBA", unit: "SESSIONS", normal: 2, exam: 0, recovery: 0, blockMin: 20, autoPlan: true, optionalInExam: true },
  { key: "mba-communication", label: "Communication practice", category: "MBA", unit: "SESSIONS", normal: 2, exam: 0, recovery: 0, blockMin: 30, autoPlan: true, optionalInExam: true },
  { key: "mba-leadership", label: "Leadership / profile activity", category: "MBA", unit: "SESSIONS", normal: 1, exam: 0, recovery: 0, blockMin: 45, autoPlan: false, optionalInExam: true },
  { key: "career-achievement", label: "Achievement documentation", category: "CAREER", unit: "SESSIONS", normal: 1, exam: 0, recovery: 0, blockMin: 20, autoPlan: true, optionalInExam: true },
  { key: "creative-writing", label: "Creative writing", category: "CREATIVITY", unit: "MINUTES", normal: 150, exam: 0, recovery: 0, blockMin: 45, autoPlan: true, optionalInExam: true },
  { key: "side-project", label: "Side project", category: "PERSONAL", unit: "MINUTES", normal: 180, exam: 0, recovery: 0, blockMin: 60, autoPlan: true, optionalInExam: true },
  { key: "exam-prep", label: "Exam preparation", category: "ACADEMICS", unit: "MINUTES", normal: 0, exam: 1500, recovery: 0, blockMin: 90, autoPlan: true, optionalInExam: false },
];

export const PRIORITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
export const KIND_RANK = { FIXED: 5, HIGH_PRIORITY: 4, RECURRING: 3, FLEXIBLE: 2, OPTIONAL: 1 } as const;

export const KIND_META: Record<keyof typeof KIND_RANK, { label: string; hint: string }> = {
  FIXED: { label: "Fixed", hint: "Never moved automatically" },
  HIGH_PRIORITY: { label: "High priority", hint: "Placed before everything else" },
  RECURRING: { label: "Recurring", hint: "Happens regularly" },
  FLEXIBLE: { label: "Flexible", hint: "Can move within the week" },
  OPTIONAL: { label: "Optional", hint: "Can be skipped without backlog" },
};

export const STATUS_META = {
  PENDING: { label: "Pending" },
  IN_PROGRESS: { label: "In progress" },
  COMPLETED: { label: "Completed" },
  SKIPPED: { label: "Skipped" },
  RESCHEDULED: { label: "Rescheduled" },
  MISSED: { label: "Missed" },
} as const;

export const EVENT_TYPE_META: Record<string, { label: string; blocks: boolean; category: CategoryKeyT }> = {
  EXAM: { label: "University exam", blocks: true, category: "ACADEMICS" },
  INTERNAL_EXAM: { label: "Internal exam", blocks: true, category: "ACADEMICS" },
  PRACTICAL_EXAM: { label: "Practical exam", blocks: true, category: "ACADEMICS" },
  VIVA: { label: "Viva", blocks: true, category: "ACADEMICS" },
  ASSIGNMENT: { label: "Assignment due", blocks: false, category: "ACADEMICS" },
  PROJECT_SUBMISSION: { label: "Project submission", blocks: false, category: "ACADEMICS" },
  INTERVIEW: { label: "Interview", blocks: true, category: "CAREER" },
  WORK_DEADLINE: { label: "Work deadline", blocks: false, category: "CAREER" },
  MEETING: { label: "Meeting", blocks: true, category: "CAREER" },
  HOLIDAY: { label: "Holiday", blocks: false, category: "PERSONAL" },
  COLLEGE_EVENT: { label: "College event", blocks: true, category: "ACADEMICS" },
  PERSONAL: { label: "Personal", blocks: true, category: "PERSONAL" },
  OTHER: { label: "Other", blocks: true, category: "PERSONAL" },
};

export const FINAL_MILESTONE = "2027-12-31";
export const CAT_TARGET_DATE = "2028-11-26"; // Editable expectation: CAT is usually held on the last Sunday of November.

export const JOB_STATUSES = ["INTERESTED", "TO_APPLY", "APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED", "ACCEPTED"] as const;

export const EXPENSE_CATEGORIES = [
  "Food",
  "Transport",
  "Rent",
  "Education",
  "Subscriptions",
  "Health",
  "Shopping",
  "Entertainment",
  "Family",
  "Other",
];

export const MBA_TIMELINE = [
  { from: "2026-11", to: "2027-12", label: "Profile development", detail: "Reading, awareness, communication, leadership, achievements." },
  { from: "2028-01", to: "2028-06", label: "CAT foundation", detail: "Quant, VARC and DILR fundamentals." },
  { from: "2028-07", to: "2028-11", label: "Intensive CAT preparation", detail: "Mocks, analysis, sectional practice." },
  { from: "2028-12", to: "2029-02", label: "XAT, SNAP & others", detail: "Other entrance examinations." },
  { from: "2029-01", to: "2029-12", label: "Interviews & admission", detail: "WAT/PI preparation and admissions." },
];

export function gradeFor(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Very Good";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs Improvement";
  return "Time to refocus";
}

export const MOTIVATION = [
  "Small, consistent steps beat occasional heroics.",
  "You don't need a perfect day — just an honest one.",
  "Protect the essentials. Everything else is a bonus.",
  "Momentum is built one finished task at a time.",
  "Rest is part of the plan, not a break from it.",
  "Progress over perfection. Always.",
  "Be the person your December 2027 self will thank.",
  "Focus on the next right thing.",
];
