/**
 * Pure helpers for the read-only GitHub activity integration.
 *
 * Contribution-calendar days come from GitHub's GraphQL API as UTC calendar
 * days and are stored as-is. REST events carry a UTC timestamp which is
 * converted to the user's local calendar day.
 */
import { addDays, nowIn, type ISODate } from "@/lib/time";

export const GITHUB_PROVIDER = "GITHUB";
export const GITHUB_SYNC_EVERY_MIN = 60;
export const GITHUB_HISTORY_DAYS = 120;
export const GITHUB_EVENT_PAGES = 3;
export const GITHUB_EVENTS_PER_PAGE = 100;
export const MAX_REPOS_PER_DAY = 10;

export type GithubEvent = {
  id?: string | number | null;
  type?: string | null;
  created_at?: string | null;
  repo?: { name?: string | null } | null;
  payload?: { action?: string | null } | null;
};

export type GithubDayStats = { prs: number; reviews: number; issues: number; repos: string[] };

export type GithubDayRow = { date: ISODate; commits: number; prs: number; reviews: number; issues: number; repos: string[] };

/** Local calendar day (YYYY-MM-DD) of a UTC timestamp in the given time zone; null when unparseable. */
export function eventLocalDate(createdAt: string | null | undefined, tz: string): ISODate | null {
  if (!createdAt) return null;
  const ms = Date.parse(createdAt);
  if (Number.isNaN(ms)) return null;
  return nowIn(tz, new Date(ms)).date;
}

/**
 * Aggregate REST events into per-day stats:
 * opened PRs, submitted reviews, opened issues and distinct repos touched (max 10/day).
 * Events are de-duplicated by id: the feed shifts while it is paged, so an event
 * at the end of one page can reappear at the start of the next.
 */
export function aggregateEvents(events: GithubEvent[], tz: string): Map<ISODate, GithubDayStats> {
  const out = new Map<ISODate, GithubDayStats>();
  const seen = new Set<string>();
  for (const e of events) {
    if (e.id != null && e.id !== "") {
      const id = String(e.id);
      if (seen.has(id)) continue;
      seen.add(id);
    }
    const date = eventLocalDate(e.created_at, tz);
    if (!date) continue;
    let day = out.get(date);
    if (!day) {
      day = { prs: 0, reviews: 0, issues: 0, repos: [] };
      out.set(date, day);
    }
    const action = e.payload?.action ?? null;
    if (e.type === "PullRequestEvent" && action === "opened") day.prs += 1;
    else if (e.type === "PullRequestReviewEvent") day.reviews += 1;
    else if (e.type === "IssuesEvent" && action === "opened") day.issues += 1;
    const repo = e.repo?.name?.trim();
    if (repo && day.repos.length < MAX_REPOS_PER_DAY && !day.repos.includes(repo)) day.repos.push(repo);
  }
  return out;
}

/**
 * First local day the fetched events say anything about, or null when there
 * were no events. GitHub's events feed is newest-first and contiguous, so every
 * day after the earliest returned day is complete. The earliest day itself may
 * be partial (older events on that day aged out of GitHub's window or fell past
 * the page cap), so callers must only ever *raise* its stored counts. Days
 * before it are unknown and left untouched.
 */
export function eventCoverageStart(dates: ISODate[]): ISODate | null {
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (b < a ? b : a));
}

/**
 * Combine stored event stats with freshly fetched ones. Complete days are
 * replaced outright; a partial day (the earliest fetched day) never loses
 * counts or repos it already had.
 */
export function combineDayStats(prev: GithubDayStats | null, next: GithubDayStats, partial: boolean): GithubDayStats {
  if (!partial || !prev) return { ...next, repos: next.repos.slice(0, MAX_REPOS_PER_DAY) };
  const repos = prev.repos.slice(0, MAX_REPOS_PER_DAY);
  for (const r of next.repos) if (repos.length < MAX_REPOS_PER_DAY && !repos.includes(r)) repos.push(r);
  return {
    prs: Math.max(prev.prs, next.prs),
    reviews: Math.max(prev.reviews, next.reviews),
    issues: Math.max(prev.issues, next.issues),
    repos,
  };
}

type CalendarResponse = {
  data?: {
    viewer?: {
      login?: string | null;
      contributionsCollection?: {
        contributionCalendar?: { weeks?: { contributionDays?: { date?: string | null; contributionCount?: number | null }[] | null }[] | null } | null;
      } | null;
    } | null;
  } | null;
};

/** Parse the GraphQL contribution calendar into a login and a flat, sorted list of days. */
export function parseContributionCalendar(json: unknown): { login: string; days: { date: ISODate; count: number }[] } | null {
  const viewer = (json as CalendarResponse | null)?.data?.viewer;
  if (!viewer?.login) return null;
  const weeks = viewer.contributionsCollection?.contributionCalendar?.weeks ?? [];
  const days: { date: ISODate; count: number }[] = [];
  for (const w of weeks) {
    for (const d of w.contributionDays ?? []) {
      if (!d.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
      days.push({ date: d.date.slice(0, 10), count: Math.max(0, Math.floor(d.contributionCount ?? 0)) });
    }
  }
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { login: viewer.login, days };
}

export type MergedGithubDay = { date: ISODate; commits: number | null; stats: GithubDayStats | null; partial: boolean };

/**
 * Merge calendar days and event stats into rows to write. Event stats are only
 * set for days on or after `coverageStart` (see eventCoverageStart) so older
 * stats that GitHub no longer returns are never wiped; the coverage start day
 * itself is flagged `partial`.
 */
export function mergeGithubDays(
  calendar: { date: ISODate; count: number }[],
  events: Map<ISODate, GithubDayStats> | null,
  coverageStart: ISODate | null,
): MergedGithubDay[] {
  const byDate = new Map<ISODate, MergedGithubDay>();
  for (const d of calendar) byDate.set(d.date, { date: d.date, commits: d.count, stats: null, partial: false });
  if (events && coverageStart) {
    for (const [date, stats] of events) {
      if (date < coverageStart) continue;
      const row = byDate.get(date) ?? { date, commits: null, stats: null, partial: false };
      row.stats = stats;
      row.partial = date === coverageStart;
      byDate.set(date, row);
    }
    // Days after the coverage start with no events at all had no PR/review/issue activity.
    for (const row of byDate.values()) {
      if (!row.stats && row.date > coverageStart) row.stats = { prs: 0, reviews: 0, issues: 0, repos: [] };
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Consecutive days with at least one contribution, ending today (or yesterday if today has none yet). */
export function contributionStreak(rows: { date: ISODate; commits: number }[], today: ISODate): number {
  const active = new Set(rows.filter((r) => r.commits > 0).map((r) => r.date));
  let d = active.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (active.has(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

/** Sum of a numeric field over an inclusive date range. */
export function sumRange(rows: GithubDayRow[], from: ISODate, to: ISODate, key: "commits" | "prs" | "reviews" | "issues"): number {
  return rows.reduce((a, r) => (r.date >= from && r.date <= to ? a + r[key] : a), 0);
}

/** Contribution totals for `weeks` consecutive weeks ending with the week starting `lastWeekStart`. */
export function weeklyTotals(rows: { date: ISODate; commits: number }[], lastWeekStart: ISODate, weeks: number): { weekStart: ISODate; total: number }[] {
  return Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(lastWeekStart, -7 * (weeks - 1 - i));
    const we = addDays(ws, 6);
    const total = rows.reduce((a, r) => (r.date >= ws && r.date <= we ? a + r.commits : a), 0);
    return { weekStart: ws, total };
  });
}

/** Repos ranked by number of active days in the range. */
export function topRepos(rows: { date: ISODate; repos: string[] }[], from: ISODate, to: ISODate, limit = 5): { name: string; days: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.date < from || r.date > to) continue;
    for (const name of new Set(r.repos)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, days]) => ({ name, days }))
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * A friendly message for a failed GitHub HTTP response; never includes tokens.
 * `formatTime` renders the rate-limit reset time in the user's time zone.
 */
export function githubErrorMessage(
  status: number,
  headers: { remaining?: string | null; reset?: string | null; retryAfter?: string | null },
  formatTime: (d: Date) => string,
): string {
  if (status === 401) return "Reconnect GitHub: access was revoked or has expired.";
  if (status === 403 || status === 429) {
    if (headers.remaining === "0" && headers.reset && /^\d+$/.test(headers.reset)) {
      return `GitHub rate limit reached. Syncing resumes after ${formatTime(new Date(Number(headers.reset) * 1000))}.`;
    }
    if (headers.retryAfter || status === 429 || headers.remaining === "0") {
      return "GitHub is rate limiting requests. TrackMe will try again later.";
    }
    return "GitHub denied access. Try reconnecting GitHub.";
  }
  if (status >= 500) return "GitHub is having trouble right now. TrackMe will try again later.";
  return `GitHub returned an unexpected response (${status}). TrackMe will try again later.`;
}
