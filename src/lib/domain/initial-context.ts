/**
 * Initial configuration for the instance owner (first account).
 * These are editable starting values — never hard requirements. Unknown
 * details (lecture timings, work hours, exam subjects, salary, measurements)
 * are deliberately absent and collected during onboarding.
 */
import type { CategoryKeyT } from "./constants";

export const INITIAL_PROFILE = {
  displayName: "Yash",
  location: "Pune, Maharashtra, India",
  education: "B.E. Computer Engineering",
  college: "Trinity Academy of Engineering, Pune",
  graduationTarget: "2027-06",
  currentRole: "AI Product Intern",
  company: "Greenloom",
  currentFocus: "AI product development, professional growth and technology learning",
  mbaObjective: "CAT, XAT, SNAP and other relevant entrance examinations in 2028–2029",
  mbaAdmissionTarget: "2029",
  creativeAmbition: "Bollywood writing and direction",
  creativeObjective: "Restart work on an existing story",
  sideProject: "A side project with a friend (flexible time allocation)",
};

export const INITIAL_EXAM_PERIOD = {
  name: "University examinations",
  startDate: "2026-11-23",
  endDate: "2026-12-03",
  leadDays: 10,
  notes: "Known examination window. Add individual papers and subjects when the timetable is released.",
};

export const INITIAL_GOALS: {
  title: string;
  description: string;
  category: CategoryKeyT;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  targetDate: string;
  milestones: { title: string; targetDate?: string }[];
}[] = [
  {
    title: "Complete engineering graduation",
    description: "Finish the B.E. Computer Engineering degree.",
    category: "ACADEMICS",
    priority: "CRITICAL",
    targetDate: "2027-06-30",
    milestones: [
      { title: "Clear Nov–Dec 2026 examinations", targetDate: "2026-12-03" },
      { title: "Submit final-year project", targetDate: "2027-05-15" },
      { title: "Clear final semester examinations", targetDate: "2027-06-15" },
      { title: "Graduate", targetDate: "2027-06-30" },
    ],
  },
  {
    title: "Secure a full-time job",
    description: "Land a suitable full-time role after graduation.",
    category: "CAREER",
    priority: "CRITICAL",
    targetDate: "2027-07-31",
    milestones: [
      { title: "Update resume and LinkedIn" },
      { title: "Apply to 20 relevant roles" },
      { title: "Complete 5 interviews" },
      { title: "Accept an offer" },
    ],
  },
  {
    title: "Build professional experience",
    description: "Perform exceptionally at the internship and document measurable outcomes.",
    category: "CAREER",
    priority: "HIGH",
    targetDate: "2027-12-31",
    milestones: [{ title: "Record 5 professional achievements" }, { title: "Record 10 professional achievements" }, { title: "Lead a product initiative end-to-end" }],
  },
  {
    title: "Develop AI knowledge",
    description: "Consistent, self-directed AI and technology learning.",
    category: "AI",
    priority: "HIGH",
    targetDate: "2027-12-31",
    milestones: [{ title: "25 hours of learning" }, { title: "100 hours of learning" }, { title: "250 hours of learning" }],
  },
  {
    title: "Complete substantial AI projects",
    description: "Build and ship AI projects you can show.",
    category: "AI",
    priority: "MEDIUM",
    targetDate: "2027-12-31",
    milestones: [{ title: "First AI project shipped" }, { title: "Second AI project shipped" }, { title: "Write up projects publicly" }],
  },
  {
    title: "Build an MBA-ready profile",
    description: "Reading, awareness, communication, leadership and achievements through 2027.",
    category: "MBA",
    priority: "MEDIUM",
    targetDate: "2027-12-31",
    milestones: [{ title: "Read 12 business books / long-form pieces" }, { title: "Lead one initiative" }, { title: "Shortlist target B-schools" }],
  },
  {
    title: "Establish a consistent fitness routine",
    description: "Gym 4–5 days a week, cardio, daily walks, 7–9h sleep.",
    category: "FITNESS",
    priority: "HIGH",
    targetDate: "2027-12-31",
    milestones: [{ title: "20 gym sessions" }, { title: "100 gym sessions" }, { title: "8 consistent weeks" }],
  },
  {
    title: "Restart my Bollywood story",
    description: "Return to the existing story and develop it steadily.",
    category: "CREATIVITY",
    priority: "MEDIUM",
    targetDate: "2027-12-31",
    milestones: [{ title: "Re-read and outline the story" }, { title: "Finalise characters" }, { title: "Complete a full treatment" }, { title: "First screenplay draft" }],
  },
  {
    title: "Improve communication",
    description: "Regular communication and public speaking practice.",
    category: "PERSONAL",
    priority: "MEDIUM",
    targetDate: "2027-12-31",
    milestones: [{ title: "20 practice sessions" }, { title: "Speak at one event" }],
  },
  {
    title: "Start earning",
    description: "Begin a regular income.",
    category: "FINANCE",
    priority: "HIGH",
    targetDate: "2027-08-31",
    milestones: [{ title: "First salary credited" }],
  },
  {
    title: "Establish savings",
    description: "Build an emergency fund and a monthly savings habit.",
    category: "FINANCE",
    priority: "MEDIUM",
    targetDate: "2027-12-31",
    milestones: [{ title: "Set emergency fund target" }, { title: "3 consecutive months of saving" }, { title: "Emergency fund reached" }],
  },
  {
    title: "Maintain personal development",
    description: "Journal, read, keep up interests and relationships.",
    category: "PERSONAL",
    priority: "LOW",
    targetDate: "2027-12-31",
    milestones: [{ title: "Journal weekly for a month" }, { title: "Finish 6 books" }],
  },
];
