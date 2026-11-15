import "server-only";
import { db } from "../db";
import type { UserContext } from "../context";
import { grantedScopes, linkedAccount, providerAccessToken, providerConfigured, setIntegrationState, syncDue } from "./tokens";
import { EVENT_TYPE_META } from "@/lib/domain/constants";
import {
  busyIntervalOn,
  calendarEventChanged,
  calendarSyncWindow,
  calendarTimingChanged,
  CALENDAR_FUTURE_DAYS,
  GOOGLE_SCOPES,
  localParts,
  mapGoogleEvent,
  type GoogleCalendarEvent,
  type GoogleProvider,
  type MappedCalendarEvent,
} from "@/lib/domain/google-calendar";
import { classifyEmail, decodeEntities, extractTime, GMAIL_QUERY, INSIGHT_KINDS, parseFrom, type InsightKind } from "@/lib/domain/email-classifier";
import { addDays, datesBetween, formatDate, type ISODate } from "@/lib/time";

/**
 * Read-only Google Calendar + Gmail sync.
 *
 * Calendar events are mirrored into `Event` (source GOOGLE_CALENDAR) so they
 * become fixed commitments for the scheduler. Gmail is scanned for career /
 * college emails; only headers + Gmail's snippet are stored, as EmailInsight
 * suggestions the user accepts or dismisses. Nothing is ever sent, labelled or
 * modified in the user's Google account.
 */

const CALENDAR_EVERY_MIN = 30;
const GMAIL_EVERY_MIN = 60;
const MAX_CALENDAR_PAGES = 20;
const SEEN_CAP = 500;

// ── HTTP ──

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    public reason: string,
    message: string,
  ) {
    super(message || `Google API error ${status}`);
    this.name = "GoogleApiError";
  }
}

async function googleGet<T>(token: string, url: URL): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new GoogleApiError(0, "network", "Network error");
  }
  if (!res.ok) {
    let reason = "";
    let message = "";
    try {
      const body = (await res.json()) as { error?: { message?: string; status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } };
      reason = body.error?.errors?.[0]?.reason ?? body.error?.details?.[0]?.reason ?? body.error?.status ?? "";
      message = body.error?.message ?? "";
    } catch {
      // non-JSON error body
    }
    throw new GoogleApiError(res.status, reason, message);
  }
  return (await res.json()) as T;
}

/** A user-facing explanation of a Google failure (never includes tokens). */
export function friendlyGoogleError(err: unknown, provider: GoogleProvider): string {
  const product = provider === "GMAIL" ? "Gmail" : "Google Calendar";
  if (!(err instanceof GoogleApiError)) return `Couldn't sync ${product}. TrackMe will try again later.`;
  const reason = `${err.reason} ${err.message}`.toLowerCase();
  if (err.reason === "noToken") return "Google access has expired or was revoked — click Connect again to reconnect.";
  if (err.status === 401) return "Google access has expired — click Connect again to reconnect.";
  if (err.status === 429 || /ratelimit|quota|resource_exhausted/.test(reason)) return "Google is rate-limiting requests right now. TrackMe will retry automatically later.";
  if (err.status === 403) {
    if (/accessnotconfigured|service_disabled|has not been used|is disabled/.test(reason))
      return `The ${product} API isn't enabled in your Google Cloud project. Enable it in the Cloud Console, then sync again.`;
    if (/insufficient|scope|permission/.test(reason)) return `TrackMe doesn't have permission to read ${product} — click Connect to grant read-only access.`;
    return `Google refused access to ${product} (403). Try reconnecting.`;
  }
  if (err.status === 0) return `Couldn't reach Google. Check your connection — TrackMe will retry later.`;
  if (err.status >= 500) return `Google ${product} is having trouble right now. TrackMe will retry later.`;
  return `Couldn't sync ${product} (error ${err.status}). TrackMe will retry later.`;
}

async function requireToken(userId: string): Promise<string> {
  const token = await providerAccessToken(userId, "google");
  if (!token) throw new GoogleApiError(401, "noToken", "No access token");
  return token;
}

// ── Calendar ──

export interface CalendarSyncResult {
  total: number;
  added: number;
  updated: number;
  removed: number;
  conflicts: number;
}

export async function syncGoogleCalendar(ctx: UserContext): Promise<CalendarSyncResult> {
  const token = await requireToken(ctx.userId);
  const win = calendarSyncWindow(ctx.today, ctx.tz);

  const items: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  let complete = false;
  for (let page = 0; page < MAX_CALENDAR_PAGES; page++) {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", win.timeMin);
    url.searchParams.set("timeMax", win.timeMax);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("timeZone", ctx.tz);
    // Ask only for what we store — no descriptions, no attendee names.
    url.searchParams.set("fields", "nextPageToken,items(id,status,eventType,summary,location,transparency,start,end,attendees(self,responseStatus,resource))");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await googleGet<{ items?: GoogleCalendarEvent[]; nextPageToken?: string }>(token, url);
    items.push(...(res.items ?? []));
    pageToken = res.nextPageToken;
    if (!pageToken) {
      complete = true;
      break;
    }
  }

  const mapped = new Map<string, MappedCalendarEvent>();
  for (const item of items) {
    const m = mapGoogleEvent(item, ctx.tz);
    if (m) mapped.set(m.externalId, m);
  }

  const existing = await db.event.findMany({
    where: { userId: ctx.userId, source: "GOOGLE_CALENDAR" },
    select: { id: true, externalId: true, title: true, type: true, date: true, endDate: true, startMinute: true, endMinute: true, allDay: true, blocksTime: true, location: true },
  });
  const byExt = new Map(existing.map((e) => [e.externalId ?? "", e]));

  let added = 0;
  let updated = 0;
  const changedBlocking: MappedCalendarEvent[] = [];
  for (const m of mapped.values()) {
    const prev = byExt.get(m.externalId);
    if (prev && !calendarEventChanged({ ...prev, type: prev.type as MappedCalendarEvent["type"] }, m)) continue;
    const data = {
      title: m.title,
      type: m.type,
      date: m.date,
      endDate: m.endDate,
      startMinute: m.startMinute,
      endMinute: m.endMinute,
      allDay: m.allDay,
      blocksTime: m.blocksTime,
      location: m.location,
      categoryId: ctx.catByKey.get(EVENT_TYPE_META[m.type].category)?.id ?? null,
    };
    await db.event.upsert({
      where: { userId_source_externalId: { userId: ctx.userId, source: "GOOGLE_CALENDAR", externalId: m.externalId } },
      update: data,
      create: { userId: ctx.userId, source: "GOOGLE_CALENDAR", externalId: m.externalId, ...data },
    });
    if (prev) updated += 1;
    else added += 1;
    if (m.blocksTime && (m.endDate ?? m.date) >= ctx.today && calendarTimingChanged(prev, m)) changedBlocking.push(m);
  }

  // Only prune when we saw the whole window — a truncated listing must never delete anything.
  let removed = 0;
  if (complete) {
    const stale = existing.filter((e) => e.date >= win.startDate && e.date <= win.endDate && !mapped.has(e.externalId ?? "")).map((e) => e.id);
    if (stale.length > 0) {
      const r = await db.event.deleteMany({ where: { userId: ctx.userId, source: "GOOGLE_CALENDAR", id: { in: stale } } });
      removed = r.count;
    }
  }

  const conflicts = changedBlocking.length > 0 ? await notifyCalendarConflicts(ctx, changedBlocking) : 0;
  return { total: mapped.size, added, updated, removed, conflicts };
}

/** Notify (one per date, nearest first, at most 3) when new/moved Google events overlap pending planned tasks. */
async function notifyCalendarConflicts(ctx: UserContext, changed: MappedCalendarEvent[]): Promise<number> {
  const horizon = addDays(ctx.today, CALENDAR_FUTURE_DAYS);
  const dates = new Set<ISODate>();
  for (const ev of changed) {
    const from = ev.date < ctx.today ? ctx.today : ev.date;
    const to = (ev.endDate ?? ev.date) > horizon ? horizon : (ev.endDate ?? ev.date);
    if (from <= to) for (const d of datesBetween(from, to)) dates.add(d);
  }
  if (dates.size === 0) return 0;
  const tasks = await db.task.findMany({
    where: { userId: ctx.userId, status: "PENDING", startMinute: { not: null }, date: { in: [...dates] } },
    select: { date: true, startMinute: true, durationMin: true },
  });
  const byDate = new Map<ISODate, { count: number; title: string }>();
  for (const t of tasks) {
    const start = t.startMinute!;
    const end = start + t.durationMin;
    if (t.date === ctx.today && end <= ctx.nowMinute) continue;
    const hit = changed.find((ev) => {
      const iv = busyIntervalOn(ev, t.date);
      return iv != null && start < iv.end && iv.start < end;
    });
    if (!hit) continue;
    const cur = byDate.get(t.date) ?? { count: 0, title: hit.title };
    cur.count += 1;
    byDate.set(t.date, cur);
  }
  const hits = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, 3);
  for (const [date, info] of hits) {
    const when = date === ctx.today ? "Today" : formatDate(date, "weekday");
    await db.notification.upsert({
      where: { userId_dedupeKey: { userId: ctx.userId, dedupeKey: `gcal-conflict:${date}` } },
      update: { title: "Calendar changes overlap your plan — Reschedule My Day", body: `${when}: "${info.title}" overlaps ${info.count} planned task${info.count === 1 ? "" : "s"}.`, readAt: null },
      create: {
        userId: ctx.userId,
        dedupeKey: `gcal-conflict:${date}`,
        type: "calendar",
        title: "Calendar changes overlap your plan — Reschedule My Day",
        body: `${when}: "${info.title}" overlaps ${info.count} planned task${info.count === 1 ? "" : "s"}.`,
        href: "/my-day",
      },
    });
  }
  return hits.length;
}

// ── Gmail ──

export interface GmailSyncResult {
  scanned: number;
  added: number;
}

interface GmailMessageMeta {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

function readSeen(settings: unknown): string[] {
  const seen = (settings as { seen?: unknown } | null)?.seen;
  return Array.isArray(seen) ? seen.filter((s): s is string => typeof s === "string") : [];
}

export async function syncGmail(ctx: UserContext): Promise<GmailSyncResult> {
  const token = await requireToken(ctx.userId);
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", GMAIL_QUERY);
  listUrl.searchParams.set("maxResults", "50");
  const list = await googleGet<{ messages?: { id: string; threadId?: string }[] }>(token, listUrl);
  const ids = (list.messages ?? []).map((m) => m.id).filter(Boolean);

  const state = await db.integration.findUnique({ where: { userId_provider: { userId: ctx.userId, provider: "GMAIL" } } });
  const seen = readSeen(state?.settings);
  const seenSet = new Set(seen);
  const known = ids.length ? await db.emailInsight.findMany({ where: { userId: ctx.userId, gmailId: { in: ids } }, select: { gmailId: true } }) : [];
  const knownSet = new Set(known.map((k) => k.gmailId));
  const toFetch = ids.filter((id) => !knownSet.has(id) && !seenSet.has(id));

  const rows: { userId: string; gmailId: string; threadId: string | null; fromAddress: string; subject: string; snippet: string | null; receivedAt: Date; kind: string; company: string | null; suggestedDate: string | null }[] = [];
  const processed: string[] = [];
  let failure: unknown = null;

  for (let i = 0; i < toFetch.length && !failure; i += 5) {
    const batch = toFetch.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map((id) => {
        const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
        url.searchParams.set("format", "metadata");
        for (const h of ["From", "Subject", "Date"]) url.searchParams.append("metadataHeaders", h);
        url.searchParams.set("fields", "id,threadId,snippet,internalDate,payload/headers");
        return googleGet<GmailMessageMeta>(token, url);
      }),
    );
    results.forEach((r, j) => {
      const id = batch[j];
      if (r.status === "rejected") {
        if (r.reason instanceof GoogleApiError && r.reason.status === 404) processed.push(id); // deleted since listing
        else failure ??= r.reason;
        return;
      }
      processed.push(id);
      const msg = r.value;
      const header = (name: string) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
      const from = header("From");
      const subject = decodeEntities(header("Subject"));
      const snippet = msg.snippet ? decodeEntities(msg.snippet) : "";
      const internal = Number(msg.internalDate);
      const dateHeader = Date.parse(header("Date"));
      const receivedAt = new Date(Number.isFinite(internal) && internal > 0 ? internal : Number.isFinite(dateHeader) ? dateHeader : Date.now());
      const receivedDate = localParts(receivedAt, ctx.tz)?.date ?? ctx.today;
      const cls = classifyEmail({ from, subject, snippet, receivedDate });
      if (!cls) return;
      rows.push({
        userId: ctx.userId,
        gmailId: msg.id || id,
        threadId: msg.threadId ?? null,
        fromAddress: from.slice(0, 300) || "(unknown sender)",
        subject: subject.slice(0, 300) || "(no subject)",
        snippet: snippet ? snippet.slice(0, 500) : null,
        receivedAt,
        kind: cls.kind,
        company: cls.company?.slice(0, 120) ?? null,
        suggestedDate: cls.suggestedDate ?? null,
      });
    });
  }

  const created = rows.length ? await db.emailInsight.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
  // Remember non-matching ids so we don't fetch them again every hour.
  const nextSeen = [...processed, ...seen.filter((s) => !processed.includes(s))].slice(0, SEEN_CAP);
  const prevSettings = (state?.settings as Record<string, unknown> | null) ?? {};
  await setIntegrationState(ctx.userId, "GMAIL", { settings: { ...prevSettings, seen: nextSeen } });

  if (failure) throw failure;
  return { scanned: processed.length, added: created.count };
}

// ── Orchestration ──

export type GoogleSyncOutcome<T> = { ok: true; result: T } | { ok: false; error: string };

/** In-progress syncs per user + feature, so "Sync now" and the background pass share one run instead of racing on upserts. */
const running = new Map<string, Promise<GoogleSyncOutcome<CalendarSyncResult | GmailSyncResult>>>();

/** Run one feature's sync and record the outcome on its Integration row. Never throws. */
export async function runGoogleSync(ctx: UserContext, provider: "GOOGLE_CALENDAR"): Promise<GoogleSyncOutcome<CalendarSyncResult>>;
export async function runGoogleSync(ctx: UserContext, provider: "GMAIL"): Promise<GoogleSyncOutcome<GmailSyncResult>>;
export async function runGoogleSync(ctx: UserContext, provider: GoogleProvider): Promise<GoogleSyncOutcome<CalendarSyncResult | GmailSyncResult>> {
  const key = `${ctx.userId}:${provider}`;
  const existing = running.get(key);
  if (existing) return existing;
  const job = runGoogleSyncOnce(ctx, provider).finally(() => running.delete(key));
  running.set(key, job);
  return job;
}

async function runGoogleSyncOnce(ctx: UserContext, provider: GoogleProvider): Promise<GoogleSyncOutcome<CalendarSyncResult | GmailSyncResult>> {
  try {
    const result = provider === "GOOGLE_CALENDAR" ? await syncGoogleCalendar(ctx) : await syncGmail(ctx);
    await setIntegrationState(ctx.userId, provider, { lastSyncedAt: new Date(), lastError: null });
    return { ok: true, result };
  } catch (err) {
    const error = friendlyGoogleError(err, provider);
    try {
      // lastSyncedAt doubles as "last attempt" so a persistent error doesn't retry on every page load.
      await setIntegrationState(ctx.userId, provider, { lastSyncedAt: new Date(), lastError: error });
    } catch {
      // ignore — state bookkeeping must never break the caller
    }
    return { ok: false, error };
  }
}

const inFlight = new Set<string>();

/**
 * Background sync from the app layout's maintenance pass: calendar every 30
 * minutes, Gmail every 60, only for granted scopes and enabled features.
 * Cheap when Google isn't configured or linked; never throws.
 */
export async function syncGoogleIfDue(ctx: UserContext): Promise<void> {
  try {
    if (!providerConfigured("google")) return;
    if (inFlight.has(ctx.userId)) return;
    const account = await linkedAccount(ctx.userId, "google");
    if (!account) return;
    const scopes = grantedScopes(account);
    const wantCalendar = scopes.includes(GOOGLE_SCOPES.calendar) && (await syncDue(ctx.userId, "GOOGLE_CALENDAR", CALENDAR_EVERY_MIN));
    const wantGmail = scopes.includes(GOOGLE_SCOPES.gmail) && (await syncDue(ctx.userId, "GMAIL", GMAIL_EVERY_MIN));
    if (!wantCalendar && !wantGmail) return;
    inFlight.add(ctx.userId);
    try {
      await Promise.allSettled([wantCalendar ? runGoogleSync(ctx, "GOOGLE_CALENDAR") : null, wantGmail ? runGoogleSync(ctx, "GMAIL") : null]);
    } finally {
      inFlight.delete(ctx.userId);
    }
  } catch {
    // Never break page rendering because of an integration problem.
  }
}

// ── Read models for the UI ──

export interface GoogleFeatureState {
  granted: boolean;
  enabled: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
}

export async function googleConnectionState(ctx: UserContext) {
  const configured = providerConfigured("google");
  if (!configured) return { configured, linked: false as const };
  const [account, rows, eventCount, newInsights, totalInsights] = await Promise.all([
    linkedAccount(ctx.userId, "google"),
    db.integration.findMany({ where: { userId: ctx.userId, provider: { in: ["GOOGLE_CALENDAR", "GMAIL"] } } }),
    db.event.count({ where: { userId: ctx.userId, source: "GOOGLE_CALENDAR", date: { gte: ctx.today } } }),
    db.emailInsight.count({ where: { userId: ctx.userId, status: "NEW" } }),
    db.emailInsight.count({ where: { userId: ctx.userId } }),
  ]);
  const scopes = grantedScopes(account);
  const feature = (provider: GoogleProvider, scope: string): GoogleFeatureState => {
    const row = rows.find((r) => r.provider === provider);
    return { granted: Boolean(account) && scopes.includes(scope), enabled: row?.enabled ?? true, lastSyncedAt: row?.lastSyncedAt ?? null, lastError: row?.lastError ?? null };
  };
  return {
    configured,
    linked: Boolean(account),
    calendar: { ...feature("GOOGLE_CALENDAR", GOOGLE_SCOPES.calendar), upcomingEvents: eventCount },
    gmail: { ...feature("GMAIL", GOOGLE_SCOPES.gmail), newInsights, totalInsights },
  };
}

/** Serializable insight row for client components. */
export interface InsightView {
  id: string;
  kind: InsightKind;
  subject: string;
  snippet: string | null;
  sender: string;
  company: string | null;
  suggestedDate: string | null;
  suggestedStart: number | null;
  receivedDate: string;
}

export interface ApplicationOption {
  id: string;
  company: string;
  role: string;
  status: string;
}

export async function newInsightViews(ctx: UserContext, take?: number): Promise<InsightView[]> {
  const rows = await db.emailInsight.findMany({ where: { userId: ctx.userId, status: "NEW" }, orderBy: { receivedAt: "desc" }, take: take ?? 200 });
  return rows.map((r) => {
    const { name, email } = parseFrom(r.fromAddress);
    const time = extractTime(`${r.subject} ${r.snippet ?? ""}`);
    return {
      id: r.id,
      kind: (INSIGHT_KINDS as readonly string[]).includes(r.kind) ? (r.kind as InsightKind) : "DEADLINE",
      subject: r.subject,
      snippet: r.snippet,
      sender: name || email,
      company: r.company,
      suggestedDate: r.suggestedDate,
      suggestedStart: time ?? null,
      receivedDate: localParts(r.receivedAt, ctx.tz)?.date ?? ctx.today,
    };
  });
}

export async function applicationOptions(ctx: UserContext): Promise<ApplicationOption[]> {
  return db.jobApplication.findMany({ where: { userId: ctx.userId }, select: { id: true, company: true, role: true, status: true }, orderBy: { updatedAt: "desc" }, take: 200 });
}
