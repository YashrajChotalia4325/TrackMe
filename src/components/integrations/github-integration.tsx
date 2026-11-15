import { CircleAlert, Flame, GitBranch, GitPullRequest, Info, MessageSquare, Sparkles } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { githubStatus } from "@/server/integrations/github";
import { Panel, Stat } from "@/components/common/ui";
import { Heatmap } from "@/components/charts/charts";
import { GithubConnectButton, GithubSyncControls } from "./github-controls";
import { contributionStreak, sumRange, topRepos } from "@/lib/domain/github";
import { addDays, datesBetween, formatDate, formatMinute, monthKey, monthRange, nowIn, weekStart } from "@/lib/time";

const CONTEXT_NOTE = "Shown for context only. GitHub contributions are never counted as learning time or towards your score, and nothing is logged automatically.";
// With only the read:user scope GitHub's events feed returns public events, while the contribution count can include private work.
const PUBLIC_NOTE = "Pull requests, reviews and repos come from your public GitHub activity.";

function formatSynced(at: Date, tz: string, today: string) {
  const local = nowIn(tz, at);
  const day = local.date === today ? "today" : local.date === addDays(today, -1) ? "yesterday" : formatDate(local.date, "dm");
  return `${day} at ${formatMinute(local.minute)}`;
}

function SetupSteps() {
  const steps = [
    <>
      On GitHub open <strong>Settings → Developer settings → OAuth Apps → New OAuth App</strong>.
    </>,
    <>
      Set <strong>Homepage URL</strong> to <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">http://localhost:3000</code>.
    </>,
    <>
      Set <strong>Authorization callback URL</strong> to{" "}
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs break-all">http://localhost:3000/api/auth/callback/github</code>.
    </>,
    <>Register the app, then click &ldquo;Generate a new client secret&rdquo;.</>,
    <>
      Add <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">GITHUB_CLIENT_ID</code> and{" "}
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">GITHUB_CLIENT_SECRET</code> to your <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env</code> file.
    </>,
    <>Restart TrackMe, then come back here and click Connect GitHub.</>,
  ];
  return (
    <div className="space-y-4">
      <ol className="space-y-2.5 text-sm">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="tabular grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground" aria-hidden>
              {i + 1}
            </span>
            <span className="min-w-0 text-muted-foreground">{s}</span>
          </li>
        ))}
      </ol>
      <PrivateTip />
    </div>
  );
}

function PrivateTip() {
  return (
    <p className="flex gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Tip: turn on <strong>Include private contributions on my profile</strong> in your GitHub profile settings so work in private repos is counted.
      </span>
    </p>
  );
}

/** GitHub connection panel for the Integrations page. */
export async function GithubIntegration() {
  const ctx = await getContext();
  const status = await githubStatus(ctx.userId);
  const description = "Read-only: daily contributions, pull requests, reviews and repos you worked in.";

  if (!status.configured) {
    return (
      <Panel title="GitHub" description={description}>
        <p className="mb-4 text-sm">GitHub isn&apos;t set up yet. It takes about two minutes:</p>
        <SetupSteps />
      </Panel>
    );
  }

  if (!status.linked) {
    return (
      <Panel title="GitHub" description={description}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect your GitHub account to see your contribution calendar next to your AI &amp; Technology learning. TrackMe only asks for <code className="font-mono text-xs">read:user</code> and
            never writes to GitHub.
          </p>
          <GithubConnectButton />
          <PrivateTip />
        </div>
      </Panel>
    );
  }

  const count = await db.githubActivity.count({ where: { userId: ctx.userId } });
  // 401s and "denied access" ask the user to reconnect; offer it right here instead of making them disconnect (which deletes data).
  const needsReconnect = Boolean(status.lastError && /reconnect/i.test(status.lastError));
  const badge = needsReconnect ? (
    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">Needs reconnecting</span>
  ) : (
    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Connected</span>
  );
  return (
    <Panel title="GitHub" description={description} action={badge}>
      <div className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Account</dt>
            <dd className="truncate font-medium">{status.login ? `@${status.login}` : "Linked"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last synced</dt>
            <dd className="font-medium">{status.lastSuccessAt ? formatSynced(status.lastSuccessAt, ctx.tz, ctx.today) : "Not yet"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Days with activity stored</dt>
            <dd className="tabular font-medium">{count}</dd>
          </div>
        </dl>
        {status.lastError && (
          <p role="status" className="flex gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{status.lastError}</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Syncs automatically about once an hour. {PUBLIC_NOTE} {CONTEXT_NOTE}
        </p>
        <GithubSyncControls login={status.login} needsReconnect={needsReconnect} />
      </div>
    </Panel>
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
      action={status.lastError ? <span title={status.lastError} className="inline-flex">
            <CircleAlert role="img" className="size-4 text-warning" aria-label={`GitHub sync issue: ${status.lastError}`} />
          </span> : undefined}
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
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Contributions, last 18 weeks <span className="tabular">({total18} total)</span>
            </p>
            <Heatmap days={heat} unit="contributions" label={`GitHub contributions per day over the last 18 weeks, ${total18} in total`} />
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Top repos this month</p>
            {repos.length === 0 ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" aria-hidden /> No repo activity yet this month.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {repos.map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate" title={r.name}>
                      {r.name}
                    </span>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
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
