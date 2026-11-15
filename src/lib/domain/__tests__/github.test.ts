import { describe, expect, it } from "vitest";
import {
  aggregateEvents,
  combineDayStats,
  contributionStreak,
  eventCoverageStart,
  eventLocalDate,
  githubErrorMessage,
  mergeGithubDays,
  parseContributionCalendar,
  sumRange,
  topRepos,
  weeklyTotals,
  type GithubEvent,
} from "../github";

const TZ = "Asia/Kolkata";
const ev = (type: string, created_at: string, repo = "yash/trackme", action?: string): GithubEvent => ({ type, created_at, repo: { name: repo }, payload: action ? { action } : {} });

describe("eventLocalDate", () => {
  it("converts UTC timestamps to the user's local day", () => {
    expect(eventLocalDate("2026-11-14T20:00:00Z", TZ)).toBe("2026-11-15"); // 01:30 IST next day
    expect(eventLocalDate("2026-11-14T10:00:00Z", TZ)).toBe("2026-11-14");
  });
  it("returns null for missing or invalid timestamps", () => {
    expect(eventLocalDate(null, TZ)).toBeNull();
    expect(eventLocalDate("not a date", TZ)).toBeNull();
  });
});

describe("aggregateEvents", () => {
  it("counts opened PRs, reviews and opened issues per local day", () => {
    const m = aggregateEvents(
      [
        ev("PullRequestEvent", "2026-11-14T05:00:00Z", "a/one", "opened"),
        ev("PullRequestEvent", "2026-11-14T06:00:00Z", "a/one", "closed"),
        ev("PullRequestReviewEvent", "2026-11-14T07:00:00Z", "a/two", "created"),
        ev("IssuesEvent", "2026-11-14T08:00:00Z", "a/two", "opened"),
        ev("IssuesEvent", "2026-11-14T08:30:00Z", "a/two", "closed"),
        ev("PushEvent", "2026-11-14T20:00:00Z", "a/three"),
      ],
      TZ,
    );
    expect(m.get("2026-11-14")).toEqual({ prs: 1, reviews: 1, issues: 1, repos: ["a/one", "a/two"] });
    expect(m.get("2026-11-15")).toEqual({ prs: 0, reviews: 0, issues: 0, repos: ["a/three"] });
  });

  it("keeps at most 10 distinct repos per day", () => {
    const events = Array.from({ length: 15 }, (_, i) => ev("PushEvent", "2026-11-14T05:00:00Z", `r/${i}`));
    events.push(ev("PushEvent", "2026-11-14T05:00:00Z", "r/0"));
    expect(aggregateEvents(events, TZ).get("2026-11-14")?.repos).toHaveLength(10);
  });

  it("counts an event only once when it reappears on the next page", () => {
    const pr = { ...ev("PullRequestEvent", "2026-11-14T05:00:00Z", "a/one", "opened"), id: "123" };
    const m = aggregateEvents([pr, { ...pr }, { ...ev("PullRequestEvent", "2026-11-14T06:00:00Z", "a/one", "opened"), id: "124" }], TZ);
    expect(m.get("2026-11-14")?.prs).toBe(2);
  });

  it("ignores malformed events", () => {
    expect(aggregateEvents([{ type: "PushEvent" }, { created_at: "x" }], TZ).size).toBe(0);
  });
});

describe("eventCoverageStart", () => {
  it("starts at the earliest fetched day", () => {
    expect(eventCoverageStart(["2026-11-12", "2026-11-10", "2026-11-14"])).toBe("2026-11-10");
  });
  it("covers nothing when no events came back", () => {
    expect(eventCoverageStart([])).toBeNull();
  });
});

describe("combineDayStats", () => {
  const prev = { prs: 3, reviews: 1, issues: 0, repos: ["a/one"] };
  it("replaces complete days outright", () => {
    expect(combineDayStats(prev, { prs: 1, reviews: 0, issues: 2, repos: ["a/two"] }, false)).toEqual({ prs: 1, reviews: 0, issues: 2, repos: ["a/two"] });
  });
  it("never lowers counts or drops repos on a partial day", () => {
    expect(combineDayStats(prev, { prs: 1, reviews: 2, issues: 0, repos: ["a/two", "a/one"] }, true)).toEqual({ prs: 3, reviews: 2, issues: 0, repos: ["a/one", "a/two"] });
  });
  it("caps repos at 10", () => {
    const many = Array.from({ length: 12 }, (_, i) => `r/${i}`);
    expect(combineDayStats({ prs: 0, reviews: 0, issues: 0, repos: many.slice(0, 8) }, { prs: 0, reviews: 0, issues: 0, repos: many }, true).repos).toHaveLength(10);
  });
});

describe("parseContributionCalendar", () => {
  it("flattens and sorts contribution days", () => {
    const r = parseContributionCalendar({
      data: {
        viewer: {
          login: "yash",
          contributionsCollection: {
            contributionCalendar: {
              weeks: [{ contributionDays: [{ date: "2026-11-09", contributionCount: 3 }] }, { contributionDays: [{ date: "2026-11-08", contributionCount: 0 }, { date: "bad", contributionCount: 9 }] }],
            },
          },
        },
      },
    });
    expect(r).toEqual({ login: "yash", days: [{ date: "2026-11-08", count: 0 }, { date: "2026-11-09", count: 3 }] });
  });
  it("returns null without a viewer", () => {
    expect(parseContributionCalendar({ errors: [{ message: "nope" }] })).toBeNull();
    expect(parseContributionCalendar(null)).toBeNull();
  });
});

describe("mergeGithubDays", () => {
  const zero = { prs: 0, reviews: 0, issues: 0, repos: [] };
  it("only sets event stats from the coverage start, flagging that day as partial", () => {
    const events = new Map([
      ["2026-11-14", { prs: 2, reviews: 0, issues: 0, repos: ["a/b"] }],
      ["2026-11-10", { prs: 1, reviews: 0, issues: 0, repos: ["a/c"] }],
    ]);
    const rows = mergeGithubDays(
      [
        { date: "2026-11-01", count: 1 },
        { date: "2026-11-10", count: 2 },
        { date: "2026-11-13", count: 0 },
        { date: "2026-11-14", count: 4 },
      ],
      events,
      "2026-11-10",
    );
    expect(rows).toEqual([
      { date: "2026-11-01", commits: 1, stats: null, partial: false },
      { date: "2026-11-10", commits: 2, stats: { prs: 1, reviews: 0, issues: 0, repos: ["a/c"] }, partial: true },
      { date: "2026-11-13", commits: 0, stats: zero, partial: false },
      { date: "2026-11-14", commits: 4, stats: { prs: 2, reviews: 0, issues: 0, repos: ["a/b"] }, partial: false },
    ]);
  });
  it("leaves event stats untouched when events could not be fetched or were empty", () => {
    expect(mergeGithubDays([{ date: "2026-11-14", count: 2 }], null, null)).toEqual([{ date: "2026-11-14", commits: 2, stats: null, partial: false }]);
    expect(mergeGithubDays([{ date: "2026-11-14", count: 2 }], new Map(), null)).toEqual([{ date: "2026-11-14", commits: 2, stats: null, partial: false }]);
  });
  it("adds event-only days with unknown contribution counts", () => {
    const rows = mergeGithubDays([], new Map([["2026-11-15", { prs: 1, reviews: 0, issues: 0, repos: [] }]]), "2026-11-15");
    expect(rows).toEqual([{ date: "2026-11-15", commits: null, stats: { prs: 1, reviews: 0, issues: 0, repos: [] }, partial: true }]);
  });
});

describe("contributionStreak", () => {
  const rows = [
    { date: "2026-11-12", commits: 1 },
    { date: "2026-11-13", commits: 2 },
    { date: "2026-11-14", commits: 5 },
    { date: "2026-11-10", commits: 1 },
  ];
  it("counts consecutive active days ending today", () => {
    expect(contributionStreak([...rows, { date: "2026-11-15", commits: 1 }], "2026-11-15")).toBe(4);
  });
  it("doesn't break the streak just because today has no contributions yet", () => {
    expect(contributionStreak(rows, "2026-11-15")).toBe(3);
  });
  it("is zero after a missed day", () => {
    expect(contributionStreak(rows, "2026-11-17")).toBe(0);
  });
});

describe("totals", () => {
  const rows = [
    { date: "2026-11-02", commits: 3, prs: 1, reviews: 0, issues: 0, repos: ["a/x", "a/y"] },
    { date: "2026-11-09", commits: 4, prs: 0, reviews: 2, issues: 1, repos: ["a/x"] },
    { date: "2026-11-15", commits: 1, prs: 1, reviews: 1, issues: 0, repos: ["a/z", "a/x"] },
  ];
  it("sums a field over a range", () => {
    expect(sumRange(rows, "2026-11-01", "2026-11-30", "prs")).toBe(2);
    expect(sumRange(rows, "2026-11-09", "2026-11-15", "commits")).toBe(5);
  });
  it("computes weekly totals oldest first", () => {
    expect(weeklyTotals(rows, "2026-11-09", 3)).toEqual([
      { weekStart: "2026-10-26", total: 0 },
      { weekStart: "2026-11-02", total: 3 },
      { weekStart: "2026-11-09", total: 5 },
    ]);
  });
  it("ranks repos by active days", () => {
    expect(topRepos(rows, "2026-11-01", "2026-11-30", 2)).toEqual([
      { name: "a/x", days: 3 },
      { name: "a/y", days: 1 },
    ]);
  });
});

describe("githubErrorMessage", () => {
  const fmt = () => "6:30 PM";
  it("asks to reconnect on 401", () => {
    expect(githubErrorMessage(401, {}, fmt)).toMatch(/Reconnect GitHub/);
  });
  it("explains primary rate limits with the reset time", () => {
    expect(githubErrorMessage(403, { remaining: "0", reset: "1800000000" }, fmt)).toBe("GitHub rate limit reached. Syncing resumes after 6:30 PM.");
  });
  it("explains secondary rate limits", () => {
    expect(githubErrorMessage(429, { retryAfter: "60" }, fmt)).toMatch(/rate limiting/);
  });
  it("treats other 403s as an access problem", () => {
    expect(githubErrorMessage(403, { remaining: "4999" }, fmt)).toMatch(/denied access/);
  });
});
