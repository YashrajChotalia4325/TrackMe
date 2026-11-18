import { appUrl } from "@/lib/app-url";
import { CircleAlert, Flame, GitBranch, GitPullRequest, Info, MessageSquare, Sparkles } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { githubStatus } from "@/server/integrations/github";
import { Panel, Stat } from "@/components/common/ui";
import { Heatmap } from "@/components/charts/charts";
import { GithubConnectButton, GithubSyncControls } from "./github-controls";
import { contributionStreak, sumRange, topRepos } from "@/lib/domain/github";
import { addDays, datesBetween, formatDate, formatMinute, monthKey, monthRange, nowIn, weekStart } from "@/lib/time";
import { cn } from "@/lib/utils";
import { chip, divide, eyebrow, inset, num } from "@/components/config/bold";
import { Code, Note, ProviderCard, SetupStepList } from "./provider-card";

const CONTEXT_NOTE = "Shown for context only. GitHub contributions are never counted as learning time or towards your score, and nothing is logged automatically.";
// With only the read:user scope GitHub's events feed returns public events, while the contribution count can include private work.
const PUBLIC_NOTE = "Pull requests, reviews and repos come from your public GitHub activity.";

function formatSynced(at: Date, tz: string, today: string) {
  const local = nowIn(tz, at);
  const day = local.date === today ? "today" : local.date === addDays(today, -1) ? "yesterday" : formatDate(local.date, "dm");
  return `${day} at ${formatMinute(local.minute)}`;
}

function SetupSteps() {
  const base = appUrl();
  const steps = [
    <>
      On GitHub open <strong>Settings → Developer settings → OAuth Apps → New OAuth App</strong>.
    </>,
    <>
      Set <strong>Homepage URL</strong> to <Code>{base}</Code>.
    </>,
    <>
      Set <strong>Authorization callback URL</strong> to <Code wrap>{`${base}/api/auth/callback/github`}</Code>.
    </>,
    <>Register the app, then click &ldquo;Generate a new client secret&rdquo;.</>,
    <>
      Add <Code>GITHUB_CLIENT_ID</Code> and <Code>GITHUB_CLIENT_SECRET</Code> as environment variables in your Vercel project (and in <Code>.env</Code> for local use).
    </>,
    <>Redeploy (or restart TrackMe locally), then come back here and click Connect GitHub.</>,
  ];
  return (
    <div className="space-y-4">
      <SetupStepList steps={steps} />
      <PrivateTip />
    </div>
  );
}

function PrivateTip() {
  return (
    <Note icon={Info}>
      Tip: turn on <strong className="font-semibold">Include private contributions on my profile</strong> in your GitHub profile settings so work in private repos is counted.
    </Note>
  );
}

/** GitHub connection panel for the Integrations page. */
export async function GithubIntegration() {
  const ctx = await getContext();
  const status = await githubStatus(ctx.userId);
  const description = "Read-only: daily contributions, pull requests, reviews and repos you worked in.";

  if (!status.configured) {
    return (
      <ProviderCard id="github" block="bg-block-stone" icon={GitBranch} title="GitHub" description={description} status="not-set-up">
        <p className="mb-4 text-sm font-semibold">GitHub isn&apos;t set up yet. It takes about two minutes:</p>
        <SetupSteps />
      </ProviderCard>
    );
  }

  if (!status.linked) {
    return (
      <ProviderCard id="github" block="bg-block-stone" icon={GitBranch} title="GitHub" description={description} status="not-connected">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect your GitHub account to see your contribution calendar next to your AI &amp; Technology learning. TrackMe only asks for <Code>read:user</Code> and never writes to GitHub.
          </p>
          <GithubConnectButton />
          <PrivateTip />
        </div>
      </ProviderCard>
    );
  }

  const count = await db.githubActivity.count({ where: { userId: ctx.userId } });
  // 401s and "denied access" ask the user to reconnect; offer it right here instead of making them disconnect (which deletes data).
  const needsReconnect = Boolean(status.lastError && /reconnect/i.test(status.lastError));
  return (
    <ProviderCard
      id="github"
      block="bg-block-stone"
      icon={GitBranch}
      title="GitHub"
      description={description}
      status={needsReconnect ? "error" : "connected"}
      statusLabel={needsReconnect ? "Needs reconnecting" : undefined}
    >
      <div className="space-y-4">
        <dl className={cn(inset, "grid gap-3 p-3 text-sm sm:grid-cols-3")}>
          <div className="min-w-0">
            <dt className={eyebrow}>Account</dt>
            <dd className="mt-1 truncate font-semibold">{status.login ? `@${status.login}` : "Linked"}</dd>
          </div>
          <div>
            <dt className={eyebrow}>Last synced</dt>
            <dd className="mt-1 font-semibold">{status.lastSuccessAt ? formatSynced(status.lastSuccessAt, ctx.tz, ctx.today) : "Not yet"}</dd>
          </div>
          <div>
            <dt className={eyebrow}>Days with activity stored</dt>
            <dd className={cn(num, "mt-1 text-base")}>{count}</dd>
          </div>
        </dl>
        {status.lastError && (
          <Note icon={CircleAlert} tone={needsReconnect ? "error" : "warn"} role="status">
            {status.lastError}
          </Note>
        )}
        <p className="text-xs text-muted-foreground">
          Syncs automatically about once an hour. {PUBLIC_NOTE} {CONTEXT_NOTE}
        </p>
        <GithubSyncControls login={status.login} needsReconnect={needsReconnect} />
      </div>
    </ProviderCard>
  );
}

/** Compact GitHub activity panel for the AI & Technology page; null when not connected. */
export async function GithubPanel() {
  const ctx = await getContext();
  const status = await githubStatus(ctx.userId);
  if (!status.linked) return null;

  const heatStart = weekStart(addDays(ctx.today, -7 * 17));
  const heatEnd = addDays(weekStart(ctx.today), 6);
  const { start: mStart, end: mEnd } = monthRange(monthKey(ctx.today));
  // A year back so a long contribution streak isn't cut off at the heatmap's edge.
  const from = addDays(ctx.today, -365);
  const rows = await db.githubActivity.findMany({
    where: { userId: ctx.userId, date: { gte: from, lte: addDays(heatEnd, 1) } },
    orderBy: { date: "asc" },
    select: { date: true, commits: true, prs: true, reviews: true, issues: true, repos: true },
  });
  if (rows.length === 0) return null;

  const weekContrib = sumRange(rows, ctx.weekStart, ctx.today, "commits");
  // GitHub's calendar days are UTC; west of UTC the latest UTC day can be local "tomorrow".
  const streak = Math.max(contributionStreak(rows, ctx.today), contributionStreak(rows, addDays(ctx.today, 1)));
  const prsMonth = sumRange(rows, mStart, mEnd, "prs");
  const reviewsMonth = sumRange(rows, mStart, mEnd, "reviews");
  const repos = topRepos(rows, mStart, mEnd, 5);
  const byDate = new Map(rows.map((r) => [r.date, r.commits]));
  const heat = datesBetween(heatStart, heatEnd).map((d) => ({ date: d, value: d > ctx.today ? 0 : (byDate.get(d) ?? 0) }));
  const total18 = heat.reduce((a, d) => a + d.value, 0);

  return (
    <Panel
      title="GitHub activity"
      description={status.login ? `@${status.login} on GitHub` : "From your linked GitHub account"}
      action={
        status.lastError ? (
          <span title={status.lastError} className={cn(chip, "bg-block-danger")}>
            <CircleAlert role="img" className="size-3" aria-label={`GitHub sync issue: ${status.lastError}`} /> Sync issue
          </span>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Contributions this week" value={weekContrib} icon={GitBranch} />
          <Stat label="Contribution streak" value={`${streak} ${streak === 1 ? "day" : "days"}`} icon={Flame} />
          <Stat label="PRs opened this month" value={prsMonth} icon={GitPullRequest} />
          <Stat label="Reviews this month" value={reviewsMonth} icon={MessageSquare} />
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0">
            <p className={cn(eyebrow, "mb-2")}>
              Contributions, last 18 weeks <span className={cn(num, "tracking-normal normal-case")}>({total18} total)</span>
            </p>
            <Heatmap days={heat} unit="contributions" label={`GitHub contributions per day over the last 18 weeks, ${total18} in total`} />
          </div>
          <div className="min-w-0">
            <p className={cn(eyebrow, "mb-2")}>Top repos this month</p>
            {repos.length === 0 ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" aria-hidden /> No repo activity yet this month.
              </p>
            ) : (
              <ul className={divide}>
                {repos.map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <span className="min-w-0 truncate font-medium" title={r.name}>
                      {r.name}
                    </span>
                    <span className={cn(num, "shrink-0 text-xs text-muted-foreground")}>
                      {r.days} {r.days === 1 ? "day" : "days"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="flex gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {CONTEXT_NOTE} {PUBLIC_NOTE}
          </span>
        </p>
      </div>
    </Panel>
  );
}
