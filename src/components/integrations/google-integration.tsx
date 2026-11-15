import { AlertTriangle, CalendarDays, CheckCircle2, Inbox, Mail, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { getContext } from "@/server/context";
import { applicationOptions, googleConnectionState, newInsightViews, type GoogleFeatureState } from "@/server/integrations/google";
import { Panel } from "@/components/common/ui";
import { ConnectGoogleButton, DisconnectGoogleButton, GoogleFeatureSwitch, GoogleSyncButton } from "./google-controls";
import { InsightList } from "./google-insights";
import { localParts } from "@/lib/domain/google-calendar";
import { formatDate, formatMinute } from "@/lib/time";
import { cn } from "@/lib/utils";

const TITLE = "Google Calendar & Gmail";

function whenLabel(at: Date, tz: string, today: string): string {
  const mins = Math.round((Date.now() - at.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const p = localParts(at, tz);
  if (!p) return "";
  return `${p.date === today ? "today" : formatDate(p.date, "dm")} at ${formatMinute(p.minute)}`;
}

function SetupSteps() {
  const steps: ReactNode[] = [
    <>
      Open the <span className="font-medium text-foreground">Google Cloud Console</span> and create a project (any name, e.g. &ldquo;TrackMe&rdquo;).
    </>,
    <>
      In <span className="font-medium text-foreground">APIs &amp; Services → Library</span>, enable the <span className="font-medium text-foreground">Google Calendar API</span> and the{" "}
      <span className="font-medium text-foreground">Gmail API</span>.
    </>,
    <>
      Configure the <span className="font-medium text-foreground">OAuth consent screen</span>: user type External, publishing status Testing, add your own Google account as a test user, and add the
      scopes <code className="rounded bg-muted px-1 py-0.5 text-[11px]">calendar.readonly</code> and <code className="rounded bg-muted px-1 py-0.5 text-[11px]">gmail.readonly</code>.
    </>,
    <>
      <span className="font-medium text-foreground">Credentials → Create credentials → OAuth client ID</span>, application type Web application, with the authorised redirect URI{" "}
      <code className="rounded bg-muted px-1 py-0.5 text-[11px] break-all">http://localhost:3000/api/auth/callback/google</code> (and{" "}
      <code className="rounded bg-muted px-1 py-0.5 text-[11px] break-all">https://your-domain/api/auth/callback/google</code> for production).
    </>,
    <>
      Put <code className="rounded bg-muted px-1 py-0.5 text-[11px]">GOOGLE_CLIENT_ID</code> and <code className="rounded bg-muted px-1 py-0.5 text-[11px]">GOOGLE_CLIENT_SECRET</code> in your{" "}
      <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.env</code> and restart TrackMe. Connect buttons will appear here.
    </>,
  ];
  return (
    <ol className="grid gap-2.5 text-sm text-muted-foreground">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="tabular grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium text-foreground">{i + 1}</span>
          <span className="min-w-0">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function PrivacyNote() {
  return (
    <p className="flex gap-2 text-xs text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
      <span>
        Read-only. Calendar events become fixed commitments in your plan. For Gmail, only the sender, subject, date and Google&apos;s short preview snippet of matching career/college emails are stored —
        never full emails. TrackMe never sends, labels, deletes or edits anything in your Google account.
      </span>
    </p>
  );
}

function FeatureCard({
  icon: Icon,
  name,
  blurb,
  state,
  provider,
  feature,
  tz,
  today,
  stat,
}: {
  icon: typeof Mail;
  name: string;
  blurb: string;
  state: GoogleFeatureState;
  provider: "GOOGLE_CALENDAR" | "GMAIL";
  feature: "calendar" | "gmail";
  tz: string;
  today: string;
  stat: string;
}) {
  const status = !state.granted ? "Not connected" : !state.enabled ? "Paused" : state.lastError ? "Needs attention" : "Connected";
  const tone = !state.granted ? "text-muted-foreground" : !state.enabled ? "text-muted-foreground" : state.lastError ? "text-warning" : "text-success";
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{blurb}</p>
          </div>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-medium", tone)}>
          {status === "Connected" && <CheckCircle2 className="size-3.5" aria-hidden />}
          {status === "Needs attention" && <AlertTriangle className="size-3.5" aria-hidden />}
          {status}
        </span>
      </div>

      {state.granted && (
        <div className="grid gap-1 text-xs text-muted-foreground">
          <p>{stat}</p>
          {state.lastSyncedAt ? (
            <p>
              {state.lastError ? "Last attempt" : "Last synced"} {whenLabel(state.lastSyncedAt, tz, today)}
            </p>
          ) : (
            <p>Not synced yet — it syncs automatically, or use Sync now.</p>
          )}
          {state.lastError && (
            <p role="alert" className="flex gap-1.5 text-warning">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
              {state.lastError}
            </p>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        {state.granted ? (
          <>
            <GoogleFeatureSwitch provider={provider} enabled={state.enabled} label={`Sync ${name}`} />
            {state.lastError && /reconnect|permission|Connect/i.test(state.lastError) && <ConnectGoogleButton feature={feature} reconnect />}
          </>
        ) : (
          <ConnectGoogleButton feature={feature} />
        )}
      </div>
    </div>
  );
}

/** Integrations page panel: setup guide, connection status, controls and all pending inbox suggestions. */
export async function GoogleIntegration() {
  const ctx = await getContext();
  const state = await googleConnectionState(ctx);

  if (!state.configured) {
    return (
      <Panel id="google" title={TITLE} description="Not set up yet — about 10 minutes in Google Cloud Console, free for personal use.">
        <div className="grid gap-5">
          <SetupSteps />
          <PrivacyNote />
        </div>
      </Panel>
    );
  }

  const { calendar, gmail, linked } = state;
  // Pending suggestions stay actionable even if Gmail access was later revoked or paused.
  const showInsights = gmail.newInsights > 0;
  const [insights, applications] = showInsights ? await Promise.all([newInsightViews(ctx), applicationOptions(ctx)]) : [[], []];

  return (
    <Panel
      id="google"
      title={TITLE}
      description="Your calendar blocks time in your plan; your inbox suggests interviews, tests and deadlines."
      action={
        linked ? (
          <div className="flex flex-wrap items-center justify-end gap-1">
            {(calendar.granted || gmail.granted) && <GoogleSyncButton />}
            <DisconnectGoogleButton />
          </div>
        ) : undefined
      }
    >
      <div className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-2">
          <FeatureCard
            icon={CalendarDays}
            name="Google Calendar"
            blurb="Primary calendar, last 7 days to next 60, every 30 min."
            state={calendar}
            provider="GOOGLE_CALENDAR"
            feature="calendar"
            tz={ctx.tz}
            today={ctx.today}
            stat={`${calendar.upcomingEvents} upcoming event${calendar.upcomingEvents === 1 ? "" : "s"} synced`}
          />
          <FeatureCard
            icon={Mail}
            name="Gmail"
            blurb="Career & college emails from the last 3 weeks, hourly."
            state={gmail}
            provider="GMAIL"
            feature="gmail"
            tz={ctx.tz}
            today={ctx.today}
            stat={`${gmail.newInsights} new suggestion${gmail.newInsights === 1 ? "" : "s"} · ${gmail.totalInsights} found so far`}
          />
        </div>

        {(gmail.granted || insights.length > 0) && (
          <div className="grid gap-3">
            <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Inbox className="size-3.5" aria-hidden /> Suggestions from your inbox
            </h3>
            {insights.length > 0 ? (
              <InsightList insights={insights} applications={applications} today={ctx.today} />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing new. Interview invites, assessments, offers and college deadlines will show up here for you to accept or dismiss.</p>
            )}
          </div>
        )}

        <PrivacyNote />
      </div>
    </Panel>
  );
}
