/** Achievement catalog + pure evaluation against aggregate stats. */

export interface AchievementStats {
  activeDays: number; // days with ≥1 completed task
  longestStreak: number; // consecutive active days
  learningMinutes: number;
  gymSessions: number;
  proAchievements: number;
  completedExamPeriods: number;
  creativeSessions: number;
  monthlyReviews: number;
  weeklyReviews: number;
  jobApplications: number;
}

export const ACHIEVEMENTS: {
  key: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  test: (s: AchievementStats) => boolean;
}[] = [
  { key: "first-step", title: "First Step", description: "Complete your first day.", icon: "Footprints", xp: 50, test: (s) => s.activeDays >= 1 },
  { key: "consistency", title: "Consistency", description: "Complete tasks for seven consecutive days.", icon: "Flame", xp: 150, test: (s) => s.longestStreak >= 7 },
  { key: "disciplined", title: "Disciplined", description: "30 days of consistent activity.", icon: "ShieldCheck", xp: 400, test: (s) => s.longestStreak >= 30 },
  { key: "tech-explorer", title: "Tech Explorer", description: "25 hours of AI learning.", icon: "Compass", xp: 200, test: (s) => s.learningMinutes >= 25 * 60 },
  { key: "tech-builder", title: "Tech Builder", description: "100 hours of AI learning.", icon: "Cpu", xp: 600, test: (s) => s.learningMinutes >= 100 * 60 },
  { key: "fit-era", title: "Fit Era", description: "Complete 20 gym sessions.", icon: "Dumbbell", xp: 200, test: (s) => s.gymSessions >= 20 },
  { key: "career-builder", title: "Career Builder", description: "Record 10 professional achievements.", icon: "Briefcase", xp: 300, test: (s) => s.proAchievements >= 10 },
  { key: "academic-warrior", title: "Academic Warrior", description: "Complete an examination period.", icon: "GraduationCap", xp: 300, test: (s) => s.completedExamPeriods >= 1 },
  { key: "storyteller", title: "Storyteller", description: "Complete 10 creative writing sessions.", icon: "Clapperboard", xp: 200, test: (s) => s.creativeSessions >= 10 },
  { key: "financially-disciplined", title: "Financially Disciplined", description: "Complete three monthly reviews.", icon: "Wallet", xp: 250, test: (s) => s.monthlyReviews >= 3 },
  { key: "reflective", title: "Reflective", description: "Complete four weekly reviews.", icon: "NotebookPen", xp: 150, test: (s) => s.weeklyReviews >= 4 },
  { key: "in-the-arena", title: "In the Arena", description: "Track 10 job applications.", icon: "Send", xp: 150, test: (s) => s.jobApplications >= 10 },
];

export function evaluateAchievements(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.test(stats)).map((a) => a.key);
}

/** Longest run of consecutive dates in a sorted, de-duplicated list. */
export function longestStreak(dates: string[], addDays: (d: string, n: number) => string): number {
  let best = 0;
  let cur = 0;
  let prev: string | null = null;
  for (const d of dates) {
    cur = prev && addDays(prev, 1) === d ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

/** Current streak ending today or yesterday (today may still be in progress). */
export function currentStreak(dates: Set<string>, today: string, addDays: (d: string, n: number) => string): number {
  let d = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}
