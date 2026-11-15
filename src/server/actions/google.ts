"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "../db";
import { auth } from "../auth";
import { getContext } from "../context";
import { checkAchievements } from "../maintenance";
import { grantedScopes, linkedAccount, providerAccessToken, providerConfigured, setIntegrationState } from "../integrations/tokens";
import { runGoogleSync, type CalendarSyncResult, type GmailSyncResult } from "../integrations/google";
import { proposeConflictResolution, type StoredProposal } from "./schedule";
import { EVENT_TYPE_META, JOB_STATUSES } from "@/lib/domain/constants";
import { GOOGLE_PROVIDERS, GOOGLE_SCOPES } from "@/lib/domain/google-calendar";
import { INSIGHT_KIND_META, INSIGHT_KINDS, insightEventType, type InsightKind } from "@/lib/domain/email-classifier";
import { formatDate } from "@/lib/time";
import { firstError, isoDate, minuteOfDay, type ActionResult } from "@/lib/validation";

const PATHS = ["/integrations", "/dashboard", "/calendar", "/my-day", "/planner", "/career"];
const revalidateAll = () => {
  for (const p of PATHS) revalidatePath(p);
};

async function featureEnabled(userId: string, provider: string) {
  const row = await db.integration.findUnique({ where: { userId_provider: { userId, provider } } });
  return row?.enabled ?? true;
}

export async function syncGoogleNow(): Promise<ActionResult<{ calendar?: CalendarSyncResult; gmail?: GmailSyncResult }>> {
  const ctx = await getContext();
  try {
    if (!providerConfigured("google")) return { ok: false, error: "Google isn't set up yet — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first." };
    const account = await linkedAccount(ctx.userId, "google");
    if (!account) return { ok: false, error: "Connect Google Calendar or Gmail first." };
    const scopes = grantedScopes(account);
    const doCalendar = scopes.includes(GOOGLE_SCOPES.calendar) && (await featureEnabled(ctx.userId, "GOOGLE_CALENDAR"));
    const doGmail = scopes.includes(GOOGLE_SCOPES.gmail) && (await featureEnabled(ctx.userId, "GMAIL"));
    if (!doCalendar && !doGmail) return { ok: false, error: "Nothing to sync — connect or turn on Calendar or Gmail first." };

    const [cal, mail] = await Promise.all([doCalendar ? runGoogleSync(ctx, "GOOGLE_CALENDAR") : null, doGmail ? runGoogleSync(ctx, "GMAIL") : null]);
    revalidateAll();
    const errors = [cal && !cal.ok ? cal.error : null, mail && !mail.ok ? mail.error : null].filter(Boolean) as string[];
    const data = { calendar: cal?.ok ? cal.result : undefined, gmail: mail?.ok ? mail.result : undefined };
    if (!data.calendar && !data.gmail) return { ok: false, error: errors[0] ?? "Sync failed. Please try again." };

    const parts: string[] = [];
    if (data.calendar) {
      const changed = data.calendar.added + data.calendar.updated;
      parts.push(`${data.calendar.total} calendar event${data.calendar.total === 1 ? "" : "s"}${changed || data.calendar.removed ? ` (${changed} new/changed, ${data.calendar.removed} removed)` : ""}`);
    }
    if (data.gmail) parts.push(data.gmail.added ? `${data.gmail.added} new inbox suggestion${data.gmail.added === 1 ? "" : "s"}` : "no new inbox suggestions");
    const message = `Synced: ${parts.join(" · ")}${errors.length ? `. ${errors[0]}` : ""}`;
    return { ok: true, data, message };
  } catch {
    return { ok: false, error: "Sync failed. Please try again." };
  }
}

const featureInput = z.object({ provider: z.enum(GOOGLE_PROVIDERS), enabled: z.boolean() });

export async function setGoogleFeature(provider: "GOOGLE_CALENDAR" | "GMAIL", enabled: boolean): Promise<ActionResult> {
  const parsed = featureInput.safeParse({ provider, enabled });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const ctx = await getContext();
  try {
    await setIntegrationState(ctx.userId, parsed.data.provider, { enabled: parsed.data.enabled, ...(parsed.data.enabled ? { lastError: null } : {}) });
    revalidatePath("/integrations");
    const name = parsed.data.provider === "GMAIL" ? "Gmail suggestions" : "Calendar sync";
    return {
      ok: true,
      data: undefined,
      message: parsed.data.enabled ? `${name} turned on` : `${name} paused${parsed.data.provider === "GOOGLE_CALENDAR" ? " — already-synced events stay on your calendar" : ""}`,
    };
  } catch {
    return { ok: false, error: "Couldn't update that setting. Please try again." };
  }
}

/** Best-effort revocation of the Google grant (revoking the access token also revokes its refresh token). */
async function revokeGoogleGrant(userId: string) {
  try {
    const token = await providerAccessToken(userId, "google");
    if (!token) return;
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // ignore — unlinking below still removes TrackMe's copy of the tokens
  }
}

export async function disconnectGoogle(): Promise<ActionResult<{ removedEvents: number }>> {
  const ctx = await getContext();
  try {
    const account = await linkedAccount(ctx.userId, "google");
    if (account) {
      // Never remove the only way to sign in (Google is link-only, but be safe).
      const otherLogins = await db.account.count({ where: { userId: ctx.userId, providerId: { not: "google" } } });
      if (otherLogins === 0) return { ok: false, error: "Google is your only way to sign in, so it can't be disconnected here. Add another sign-in method first." };
      await revokeGoogleGrant(ctx.userId);
      try {
        await auth.api.unlinkAccount({ body: { accountId: account.id }, headers: await headers() });
      } catch {
        // e.g. the session isn't "fresh" enough for Better Auth's unlink endpoint — remove the link directly.
        await db.account.deleteMany({ where: { userId: ctx.userId, providerId: "google" } });
      }
    }
    const [events] = await db.$transaction([
      // Upcoming and still-running synced events (multi-day ones that started earlier included); past ones stay as history.
      db.event.deleteMany({ where: { userId: ctx.userId, source: "GOOGLE_CALENDAR", OR: [{ date: { gte: ctx.today } }, { endDate: { gte: ctx.today } }] } }),
      db.integration.deleteMany({ where: { userId: ctx.userId, provider: { in: [...GOOGLE_PROVIDERS] } } }),
      // Pending / dismissed suggestions are email metadata — remove them. Accepted ones (and the events/applications they created) stay.
      db.emailInsight.deleteMany({ where: { userId: ctx.userId, status: { in: ["NEW", "DISMISSED"] } } }),
    ]);
    revalidateAll();
    return { ok: true, data: { removedEvents: events.count }, message: "Google disconnected" };
  } catch {
    return { ok: false, error: "Couldn't disconnect Google. Please try again." };
  }
}

const acceptInput = z
  .object({
    addToCalendar: z
      .object({
        date: isoDate,
        title: z.string().trim().min(1, "Give the event a title").max(200),
        startMinute: minuteOfDay.nullable().optional(),
        endMinute: minuteOfDay.nullable().optional(),
      })
      .nullable()
      .optional(),
    updateApplication: z
      .object({
        applicationId: z.string().min(1).max(64).nullable().optional(),
        createCompany: z.string().trim().max(120).nullable().optional(),
        role: z.string().trim().max(120).nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .refine((v) => v.addToCalendar || v.updateApplication, { message: "Choose at least one thing to do — or dismiss the suggestion." })
  .refine((v) => !v.updateApplication || v.updateApplication.applicationId || v.updateApplication.createCompany, {
    message: "Pick an application or enter a company name",
    path: ["updateApplication"],
  });

type JobStatusT = (typeof JOB_STATUSES)[number];

export async function acceptInsight(
  id: string,
  raw: unknown,
): Promise<ActionResult<{ eventId: string | null; applicationId: string | null; conflict: { versionId: string; proposal: StoredProposal } | null }>> {
  const parsed = acceptInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (typeof id !== "string" || !id) return { ok: false, error: "Suggestion not found" };
  const v = parsed.data;
  const ctx = await getContext();

  try {
    const insight = await db.emailInsight.findFirst({ where: { id, userId: ctx.userId } });
    if (!insight) return { ok: false, error: "Suggestion not found" };
    if (insight.status !== "NEW") return { ok: false, error: "This suggestion was already handled." };
    const kind: InsightKind = (INSIGHT_KINDS as readonly string[]).includes(insight.kind) ? (insight.kind as InsightKind) : "DEADLINE";
    const meta = INSIGHT_KIND_META[kind];

    // Event timing
    let start: number | null = null;
    let end: number | null = null;
    if (v.addToCalendar) {
      start = v.addToCalendar.startMinute ?? null;
      end = v.addToCalendar.endMinute ?? null;
      if (start == null) end = null;
      else {
        if (end == null) end = Math.min(start + 60, 24 * 60);
        if (end <= start) return { ok: false, error: "End time must be after the start time" };
      }
    }

    const notes: string[] = [];
    const result = await db.$transaction(async (tx) => {
      // Application
      let applicationId: string | null = null;
      if (v.updateApplication) {
        const target = meta.status as JobStatusT | null;
        if (v.updateApplication.applicationId) {
          const app = await tx.jobApplication.findFirst({ where: { id: v.updateApplication.applicationId, userId: ctx.userId } });
          if (!app) throw new UserFacingError("That application no longer exists");
          applicationId = app.id;
          if (target) {
            const cur = JOB_STATUSES.indexOf(app.status as JobStatusT);
            const next = JOB_STATUSES.indexOf(target);
            const downgrade = app.status === "ACCEPTED" || (target !== "REJECTED" && next < cur);
            if (downgrade) notes.push(`kept ${app.company} at ${app.status.toLowerCase()}`);
            else if (app.status !== target) {
              await tx.jobApplication.update({
                where: { id: app.id },
                data: {
                  status: target,
                  appliedOn: app.appliedOn ?? (target === "APPLIED" ? ctx.today : null),
                  ...(v.addToCalendar && (kind === "INTERVIEW" || kind === "ASSESSMENT") ? { nextStep: `${meta.label} ${formatDate(v.addToCalendar.date, "dm")}` } : {}),
                },
              });
              notes.push(`${app.company} → ${target.toLowerCase()}`);
            }
          }
        } else if (v.updateApplication.createCompany) {
          const app = await tx.jobApplication.create({
            data: {
              userId: ctx.userId,
              company: v.updateApplication.createCompany,
              role: v.updateApplication.role?.trim() || "Role not specified",
              status: target ?? "INTERESTED",
              appliedOn: target === "APPLIED" ? ctx.today : null,
              source: "Gmail",
              nextStep: v.addToCalendar && (kind === "INTERVIEW" || kind === "ASSESSMENT") ? `${meta.label} ${formatDate(v.addToCalendar.date, "dm")}` : null,
            },
          });
          applicationId = app.id;
          notes.push(`added ${app.company} to applications`);
        }
      }

      // Calendar event
      let eventId: string | null = null;
      if (v.addToCalendar) {
        const type = insightEventType(kind, insight.subject);
        const timed = start != null;
        const data = {
          title: v.addToCalendar.title,
          type,
          date: v.addToCalendar.date,
          endDate: null,
          startMinute: timed ? start : null,
          endMinute: timed ? end : null,
          allDay: !timed,
          blocksTime: timed,
          notes: `From email: ${insight.subject}`.slice(0, 500),
          applicationId,
          categoryId: ctx.catByKey.get(EVENT_TYPE_META[type].category)?.id ?? null,
        };
        const ev = await tx.event.upsert({
          where: { userId_source_externalId: { userId: ctx.userId, source: "GMAIL", externalId: insight.gmailId } },
          update: data,
          create: { userId: ctx.userId, source: "GMAIL", externalId: insight.gmailId, ...data },
        });
        eventId = ev.id;
        notes.unshift(`added to calendar for ${formatDate(v.addToCalendar.date, "weekday")}`);
      }

      const marked = await tx.emailInsight.updateMany({ where: { id: insight.id, userId: ctx.userId, status: "NEW" }, data: { status: "ACCEPTED" } });
      if (marked.count === 0) throw new UserFacingError("This suggestion was already handled.");
      return { eventId, applicationId };
    });

    let conflict: { versionId: string; proposal: StoredProposal } | null = null;
    if (v.addToCalendar && start != null && end != null && v.addToCalendar.date >= ctx.today) {
      try {
        conflict = await proposeConflictResolution(v.addToCalendar.date, start, end, v.addToCalendar.title);
      } catch {
        conflict = null;
      }
    }
    if (result.applicationId) {
      try {
        await checkAchievements(ctx);
      } catch {
        // achievements are a nice-to-have
      }
    }
    revalidateAll();
    const msg = notes.length ? notes.join(" · ") : "Done";
    return { ok: true, data: { ...result, conflict }, message: msg.charAt(0).toUpperCase() + msg.slice(1) };
  } catch (e) {
    if (e instanceof UserFacingError) return { ok: false, error: e.message };
    return { ok: false, error: "Couldn't apply that suggestion. Please try again." };
  }
}

export async function dismissInsight(id: string): Promise<ActionResult> {
  const parsed = z.string().min(1).max(64).safeParse(id);
  if (!parsed.success) return { ok: false, error: "Suggestion not found" };
  const ctx = await getContext();
  try {
    const r = await db.emailInsight.updateMany({ where: { id: parsed.data, userId: ctx.userId, status: "NEW" }, data: { status: "DISMISSED" } });
    if (r.count === 0) return { ok: false, error: "Suggestion not found" };
    revalidatePath("/dashboard");
    revalidatePath("/integrations");
    return { ok: true, data: undefined, message: "Dismissed" };
  } catch {
    return { ok: false, error: "Couldn't dismiss that suggestion. Please try again." };
  }
}

class UserFacingError extends Error {}
