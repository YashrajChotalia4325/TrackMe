import "server-only";
import { db } from "../db";
import type { UserContext } from "../context";
import { linkedAccount, providerAccessToken, providerConfigured, setIntegrationState, syncDue } from "./tokens";
import {
  GITHUB_EVENT_PAGES,
  GITHUB_EVENTS_PER_PAGE,
  GITHUB_HISTORY_DAYS,
  GITHUB_PROVIDER,
  GITHUB_SYNC_EVERY_MIN,
  aggregateEvents,
  combineDayStats,
  eventCoverageStart,
  githubErrorMessage,
  mergeGithubDays,
  parseContributionCalendar,
  type GithubEvent,
} from "@/lib/domain/github";
import { addDays, formatDate, formatMinute, nowIn } from "@/lib/time";

const API = "https://api.github.com";
const TIMEOUT_MS = 15_000;
/**
 * Whole-sync budget. The background sync runs inside the maintenance pass that
 * page renders await, so a slow GitHub must never hold a page for long.
 */
const SYNC_BUDGET_MS = 20_000;

export type GithubSettings = { login?: string; lastSuccessAt?: string };
export type GithubSyncResult = { ok: true; days: number; warning?: string } | { ok: false; error: string };

export function readGithubSettings(raw: unknown): GithubSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  return {
    login: typeof r.login === "string" ? r.login : undefined,
    lastSuccessAt: typeof r.lastSuccessAt === "string" ? r.lastSuccessAt : undefined,
  };
}

/** Connection status for the Integrations page. */
export async function githubStatus(userId: string) {
  const configured = providerConfigured("github");
  if (!configured) return { configured, linked: false as const };
  const [account, state] = await Promise.all([
    linkedAccount(userId, "github"),
    db.integration.findUnique({ where: { userId_provider: { userId, provider: GITHUB_PROVIDER } } }),
  ]);
  if (!account) return { configured, linked: false as const };
  const settings = readGithubSettings(state?.settings);
  return {
    configured,
    linked: true as const,
    login: settings.login ?? null,
    lastSuccessAt: settings.lastSuccessAt ? new Date(settings.lastSuccessAt) : null,
    lastError: state?.lastError ?? null,
  };
}

// ── HTTP ──

type Fetched<T> = { ok: true; data: T } | { ok: false; status?: number; error: string };

function resetFormatter(tz: string) {
  return (d: Date) => {
    const local = nowIn(tz, d);
    const today = nowIn(tz).date;
    return local.date === today ? formatMinute(local.minute) : `${formatMinute(local.minute)} on ${formatDate(local.date, "dm")}`;
  };
}

async function githubFetch<T>(url: string, token: string, tz: string, deadline: number, init?: { method?: string; body?: string }): Promise<Fetched<T>> {
  const budget = Math.min(TIMEOUT_MS, deadline - Date.now());
  if (budget <= 0) return { ok: false, error: "GitHub took too long to respond. TrackMe will try again later." };
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      body: init?.body,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "TrackMe",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(budget),
    });
  } catch {
    return { ok: false, error: "Couldn't reach GitHub. TrackMe will try again later." };
  }
  if (!res.ok) {
    // Release the connection; the error body isn't needed.
    await res.body?.cancel().catch(() => undefined);
    const error = githubErrorMessage(
      res.status,
      { remaining: res.headers.get("x-ratelimit-remaining"), reset: res.headers.get("x-ratelimit-reset"), retryAfter: res.headers.get("retry-after") },
      resetFormatter(tz),
    );
    return { ok: false, status: res.status, error };
  }
  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: res.status, error: "GitHub returned an unreadable response. TrackMe will try again later." };
  }
}

const CALENDAR_QUERY = `query($from: DateTime!, $to: DateTime!) {
  viewer {
    login
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}`;

async function fetchCalendar(token: string, tz: string, deadline: number) {
  const now = new Date();
  const utcToday = now.toISOString().slice(0, 10);
  const from = `${addDays(utcToday, -(GITHUB_HISTORY_DAYS - 1))}T00:00:00Z`;
  const r = await githubFetch<unknown>(`${API}/graphql`, token, tz, deadline, {
    method: "POST",
    body: JSON.stringify({ query: CALENDAR_QUERY, variables: { from, to: now.toISOString() } }),
  });
  if (!r.ok) return r;
  const parsed = parseContributionCalendar(r.data);
  if (!parsed) {
    const errors = (r.data as { errors?: { type?: string }[] } | null)?.errors ?? [];
    if (errors.some((e) => e.type === "RATE_LIMITED")) return { ok: false as const, error: "GitHub rate limit reached. TrackMe will try again later." };
    return { ok: false as const, error: "GitHub didn't return your contribution calendar. Try Sync now in a little while." };
  }
  return { ok: true as const, data: parsed };
}

/**
 * Newest-first events, up to 3 pages. A failure after page 1 keeps what was
 * fetched: the list is still contiguous from now back to its earliest event,
 * which eventCoverageStart treats as a partial day.
 */
async function fetchEvents(login: string, token: string, tz: string, deadline: number): Promise<GithubEvent[] | null> {
  const events: GithubEvent[] = [];
  for (let page = 1; page <= GITHUB_EVENT_PAGES; page++) {
    const r = await githubFetch<unknown>(`${API}/users/${encodeURIComponent(login)}/events?per_page=${GITHUB_EVENTS_PER_PAGE}&page=${page}`, token, tz, deadline);
    if (!r.ok) return page === 1 ? null : events;
    const batch = Array.isArray(r.data) ? (r.data as GithubEvent[]) : [];
    events.push(...batch);
    if (batch.length < GITHUB_EVENTS_PER_PAGE) break;
  }
  return events;
}

// ── Sync ──

async function recordResult(userId: string, data: { lastError: string | null; settings?: GithubSettings }) {
  const prev = await db.integration.findUnique({ where: { userId_provider: { userId, provider: GITHUB_PROVIDER } }, select: { settings: true } });
  const settings = { ...readGithubSettings(prev?.settings), ...(data.settings ?? {}) };
  await setIntegrationState(userId, GITHUB_PROVIDER, { lastError: data.lastError, settings });
}

/**
 * Pull the last 120 days of GitHub activity into GithubActivity. Never throws;
 * failures are recorded on the Integration row as a friendly `lastError`.
 */
export async function syncGithub(ctx: UserContext): Promise<GithubSyncResult> {
  const userId = ctx.userId;
  const deadline = Date.now() + SYNC_BUDGET_MS;
  try {
    // Claim the slot first so concurrent page renders don't all hit GitHub.
    await setIntegrationState(userId, GITHUB_PROVIDER, { lastSyncedAt: new Date() });

    const token = await providerAccessToken(userId, "github");
    if (!token) {
      const error = "Reconnect GitHub: TrackMe couldn't get an access token.";
      await recordResult(userId, { lastError: error });
      return { ok: false, error };
    }

    const cal = await fetchCalendar(token, ctx.tz, deadline);
    if (!cal.ok) {
      await recordResult(userId, { lastError: cal.error });
      return { ok: false, error: cal.error };
    }
    const { login, days } = cal.data;

    const fetched = await fetchEvents(login, token, ctx.tz, deadline);
    const events = fetched ? aggregateEvents(fetched, ctx.tz) : null;
    const coverage = events ? eventCoverageStart([...events.keys()]) : null;
    const merged = mergeGithubDays(days, events, coverage);

    // The user may have disconnected while GitHub was answering; don't bring the data back.
    if (!(await linkedAccount(userId, "github"))) {
      // The slot claim above may have re-created the sync row after disconnect removed it.
      await db.integration.deleteMany({ where: { userId, provider: GITHUB_PROVIDER } });
      return { ok: false, error: "GitHub was disconnected." };
    }

    if (merged.length > 0) {
      const existing = await db.githubActivity.findMany({
        where: { userId, date: { gte: merged[0].date, lte: merged[merged.length - 1].date } },
      });
      const byDate = new Map(existing.map((r) => [r.date, r]));
      const writes = [];
      for (const m of merged) {
        const cur = byDate.get(m.date);
        if (cur) {
          const data: { commits?: number; prs?: number; reviews?: number; issues?: number; repos?: string[] } = {};
          if (m.commits != null && m.commits !== cur.commits) data.commits = m.commits;
          if (m.stats) {
            const next = combineDayStats(cur, m.stats, m.partial);
            if (next.prs !== cur.prs) data.prs = next.prs;
            if (next.reviews !== cur.reviews) data.reviews = next.reviews;
            if (next.issues !== cur.issues) data.issues = next.issues;
            if (next.repos.length !== cur.repos.length || next.repos.some((r, i) => r !== cur.repos[i])) data.repos = next.repos;
          }
          if (Object.keys(data).length > 0) writes.push(db.githubActivity.update({ where: { id: cur.id }, data }));
        } else {
          const commits = m.commits ?? 0;
          const s = m.stats ? combineDayStats(null, m.stats, false) : { prs: 0, reviews: 0, issues: 0, repos: [] };
          if (commits === 0 && s.prs === 0 && s.reviews === 0 && s.issues === 0 && s.repos.length === 0) continue;
          writes.push(
            db.githubActivity.upsert({
              where: { userId_date: { userId, date: m.date } },
              update: { commits, ...s },
              create: { userId, date: m.date, commits, ...s },
            }),
          );
        }
      }
      if (writes.length > 0) await db.$transaction(writes);
    }

    const warning = fetched ? undefined : "Contributions synced, but pull request and review details couldn't be fetched this time.";
    await recordResult(userId, { lastError: warning ?? null, settings: { login, lastSuccessAt: new Date().toISOString() } });
    return { ok: true, days: merged.length, warning };
  } catch {
    const error = "GitHub sync failed unexpectedly. TrackMe will try again later.";
    try {
      await recordResult(userId, { lastError: error });
    } catch {
      // ignore — never throw from a sync
    }
    return { ok: false, error };
  }
}

/** Background sync from maintenance: cheap no-op unless configured, linked and due. Never throws. */
export async function syncGithubIfDue(ctx: UserContext): Promise<void> {
  try {
    if (!providerConfigured("github")) return;
    const account = await linkedAccount(ctx.userId, "github");
    if (!account) return;
    if (!(await syncDue(ctx.userId, GITHUB_PROVIDER, GITHUB_SYNC_EVERY_MIN))) {
      // A (re)connect updates the account row with a fresh token: sync right away
      // instead of waiting out the hourly interval (e.g. after "Reconnect GitHub").
      const state = await db.integration.findUnique({
        where: { userId_provider: { userId: ctx.userId, provider: GITHUB_PROVIDER } },
        select: { enabled: true, lastSyncedAt: true },
      });
      const relinked = Boolean(state?.enabled && state.lastSyncedAt && account.updatedAt > state.lastSyncedAt);
      if (!relinked) return;
    }
    await syncGithub(ctx);
  } catch {
    // swallowed: integrations must never break page rendering
  }
}

/**
 * Best-effort revocation of TrackMe's OAuth grant at GitHub, so disconnecting
 * also removes the authorization on GitHub's side. Never throws.
 */
export async function revokeGithubGrant(token: string): Promise<boolean> {
  const id = process.env.GITHUB_CLIENT_ID;
  const secret = process.env.GITHUB_CLIENT_SECRET;
  if (!id || !secret) return false;
  try {
    const res = await fetch(`${API}/applications/${encodeURIComponent(id)}/grant`, {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "TrackMe",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.status === 204;
  } catch {
    return false;
  }
}
