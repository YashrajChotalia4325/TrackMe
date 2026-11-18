/**
 * Dashboard layout: which panels the dashboard shows, in what order.
 * Pure module (no server or client imports) so it can be shared and unit-tested.
 */

export const DASHBOARD_PANEL_IDS = ["score", "tasks", "habits", "inbox", "quickActions", "week", "upcoming", "goals"] as const;
export type DashboardPanelId = (typeof DASHBOARD_PANEL_IDS)[number];

/** main = left column, side = right column, full = full width below the grid. */
export type DashboardColumn = "main" | "side" | "full";

export interface DashboardPanelMeta {
  id: DashboardPanelId;
  label: string;
  description: string;
  column: DashboardColumn;
}

export const DASHBOARD_PANELS: readonly DashboardPanelMeta[] = [
  { id: "score", label: "Today's score", description: "Your daily score with the category breakdown.", column: "main" },
  { id: "tasks", label: "Today's tasks", description: "Today's tasks grouped by part of day.", column: "main" },
  { id: "habits", label: "Habits", description: "Quick tick list of today's habits.", column: "side" },
  { id: "inbox", label: "Inbox suggestions", description: "Deadlines and to-dos spotted in Gmail (when connected).", column: "side" },
  { id: "quickActions", label: "Quick actions", description: "Add a task, log a workout, start learning and more.", column: "side" },
  { id: "week", label: "This week", description: "Weekly completion, scores and targets.", column: "main" },
  { id: "upcoming", label: "Upcoming", description: "Exams and events in the next 30 days.", column: "side" },
  { id: "goals", label: "Long-term goals", description: "Goal progress from completed milestones.", column: "full" },
];

export const PANEL_BY_ID: Record<DashboardPanelId, DashboardPanelMeta> = Object.fromEntries(DASHBOARD_PANELS.map((p) => [p.id, p])) as Record<DashboardPanelId, DashboardPanelMeta>;

// A type alias (not an interface) so it is assignable to Prisma's JSON input type.
export type LayoutItem = {
  id: DashboardPanelId;
  hidden: boolean;
};
export type DashboardLayout = LayoutItem[];

export const DEFAULT_LAYOUT: readonly LayoutItem[] = Object.freeze(DASHBOARD_PANELS.map((p) => Object.freeze({ id: p.id, hidden: false })));

export function isPanelId(v: unknown): v is DashboardPanelId {
  return typeof v === "string" && (DASHBOARD_PANEL_IDS as readonly string[]).includes(v);
}

/**
 * Turn whatever is stored (null, garbage, an older layout) into a complete layout:
 * unknown ids and duplicates are dropped, missing panels are appended (visible)
 * in default order. Accepts `{ id, hidden }` objects or bare id strings.
 */
export function normalizeLayout(raw: unknown): DashboardLayout {
  const out: DashboardLayout = [];
  const seen = new Set<DashboardPanelId>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      let id: unknown;
      let hidden = false;
      if (typeof entry === "string") id = entry;
      else if (entry && typeof entry === "object") {
        id = (entry as { id?: unknown }).id;
        hidden = (entry as { hidden?: unknown }).hidden === true;
      }
      if (!isPanelId(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, hidden });
    }
  }
  for (const p of DASHBOARD_PANELS) {
    if (!seen.has(p.id)) out.push({ id: p.id, hidden: false });
  }
  return out;
}

/** Visible panels split by where they render, preserving layout order. */
export function layoutColumns(layout: DashboardLayout): Record<DashboardColumn, DashboardPanelId[]> {
  const cols: Record<DashboardColumn, DashboardPanelId[]> = { main: [], side: [], full: [] };
  for (const item of layout) {
    if (item.hidden) continue;
    cols[PANEL_BY_ID[item.id].column].push(item.id);
  }
  return cols;
}

/** Move the item at `index` by `delta` (-1 up, +1 down). Out-of-range moves return the layout unchanged. */
export function moveItem(layout: DashboardLayout, index: number, delta: -1 | 1): DashboardLayout {
  const target = index + delta;
  if (index < 0 || index >= layout.length || target < 0 || target >= layout.length) return layout;
  const next = layout.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function isDefaultLayout(layout: DashboardLayout): boolean {
  const n = normalizeLayout(layout);
  return n.length === DEFAULT_LAYOUT.length && n.every((x, i) => x.id === DEFAULT_LAYOUT[i].id && x.hidden === DEFAULT_LAYOUT[i].hidden);
}

export const START_PAGES = ["/dashboard", "/my-day"] as const;
export type StartPage = (typeof START_PAGES)[number];

export function normalizeStartPage(v: unknown): StartPage {
  return (START_PAGES as readonly unknown[]).includes(v) ? (v as StartPage) : "/dashboard";
}

export const PERSONAL_WHY_MAX = 280;
