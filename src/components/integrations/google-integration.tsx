import { appUrl } from "@/lib/app-url";
import { AlertTriangle, CalendarDays, Inbox, Mail, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { getContext } from "@/server/context";
import { applicationOptions, googleConnectionState, newInsightViews, type GoogleFeatureState } from "@/server/integrations/google";
import { ConnectGoogleButton, DisconnectGoogleButton, GoogleFeatureSwitch, GoogleSyncButton } from "./google-controls";
import { InsightList } from "./google-insights";
import { localParts } from "@/lib/domain/google-calendar";
import { formatDate, formatMinute } from "@/lib/time";
import { cn } from "@/lib/utils";
import { eyebrow, subCard } from "@/components/config/bold";
import { Code, Note, ProviderCard, SetupStepList, StatusChip, type ProviderStatus } from "./provider-card";

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
  const base = appUrl();
  const steps: ReactNode[] = [
    <>
      Open the <strong>Google Cloud Console</strong> and create a project (any name, e.g. &ldquo;TrackMe&rdquo;).
    </>,
    <>
      In <strong>APIs &amp; Services → Library</strong>, enable the <strong>Google Calendar API</strong> and the <strong>Gmail API</strong>.
    </>,
    <>
      Configure the <strong>OAuth consent screen</strong>: user type External, publishing status Testing, add your own Google account as a test user, and add the scopes <Code>calendar.readonly</Code> and{" "}
      <Code>gmail.readonly</Code>.
    </>,
    <>
      <strong>Credentials → Create credentials → OAuth client ID</strong>, application type Web application, with the authorised redirect URI{" "}
      <Code wrap>{`${base}/api/auth/callback/google`}</Code>.
    </>,
    <>
      Put <Code>GOOGLE_CLIENT_ID</Code> and <Code>GOOGLE_CLIENT_SECRET</Code> as environment variables in your Vercel project (and in <Code>.env</Code> for local use), then redeploy. Connect buttons will appear here.
    </>,
  ];
  return <SetupStepList steps={steps} />;
}

function PrivacyNote() {
  return (
    <Note icon={ShieldCheck} tone="safe">
      <span className="font-semibold">Read-only.</span>{" "}
      <span className="text-muted-foreground">
        Calendar events become fixed commitments in your plan. For Gmail, only the sender, subject, date and Google&apos;s short preview snippet of matching career/college emails are stored —
        never full emails. TrackMe never sends, labels, deletes or edits anything in your Google account.
      </span>
    </Note>
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
  const status: ProviderStatus = !state.granted ? "not-connected" : !state.enabled ? "paused" : state.lastError ? "error" : "connected";
  return (
    <div className={cn(subCard, "flex flex-col gap-3 p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[8px] border-2 border-border bg-block-sky text-ink" aria-hidden>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-base leading-tight font-extrabold tracking-[-0.01em]">{name}</h3>
            <p className="text-xs text-muted-foreground">{blurb}</p>
          </div>
        </div>
        <StatusChip status={status} />
      </div>

      {state.granted && (
        <div className="grid gap-1 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">{stat}</p>
          {state.lastSyncedAt ? (
            <p>
              {state.lastError ? "Last attempt" : "Last synced"} {whenLabel(state.lastSyncedAt, tz, today)}
            </p>
          ) : (
            <p>Not synced yet — it syncs automatically, or use Sync now.</p>
          )}
          {state.lastError && (
            <Note icon={AlertTriangle} tone="error" role="alert" className="mt-1">
              {state.lastError}
            </Note>
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
      <ProviderCard id="google" block="bg-block-sky" icon={CalendarDays} title={TITLE} status="not-set-up" description="About 10 minutes in Google Cloud Console, free for personal use.">
        <div className="grid gap-5">
          <SetupSteps />
          <PrivacyNote />
        </div>
      </ProviderCard>
    );
  }

  const { calendar, gmail, linked } = state;
  // Pending suggestions stay actionable even if Gmail access was later revoked or paused.
  const showInsights = gmail.newInsights > 0;
  const [insights, applications] = showInsights ? await Promise.all([newInsightViews(ctx), applicationOptions(ctx)]) : [[], []];

  return (
    <ProviderCard
      id="google"
      block="bg-block-sky"
      icon={CalendarDays}
      title={TITLE}
      description="Your calendar blocks time in your plan; your inbox suggests interviews, tests and deadlines."
      status={linked && (calendar.granted || gmail.granted) ? (calendar.lastError || gmail.lastError ? "error" : "connected") : "not-connected"}
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
            <h3 className={cn(eyebrow, "flex items-center gap-2")}>
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
    </ProviderCard>
  );
}
