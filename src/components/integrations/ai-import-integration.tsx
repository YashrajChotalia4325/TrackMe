import "server-only";
import { Bot, Info, ShieldCheck } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { Panel } from "@/components/common/ui";
import { Bars } from "@/components/charts/charts";
import { AiDeleteButton, AiImportButton } from "./ai-import-uploader";
import { AI_PROVIDERS, AI_PROVIDER_META, type AiProvider } from "@/lib/domain/ai-export-parser";
import { addDays, formatDate, nowIn } from "@/lib/time";

const EXPORT_STEPS: Record<AiProvider, string[]> = {
  CHATGPT: ["In ChatGPT, open Settings → Data controls → Export data.", "Open the download link ChatGPT emails you.", "Unzip the archive and pick conversations.json."],
  CLAUDE: ["In Claude, open Settings → Privacy → Export data.", "Open the download link Claude emails you.", "Unzip the archive and pick conversations.json."],
};

function formatImportedAt(d: Date, tz: string) {
  const { date } = nowIn(tz, d);
  return formatDate(date);
}

/** ChatGPT & Claude export import cards for the Integrations page. */
export async function AiImportIntegration() {
  const ctx = await getContext();
  const [totals, states] = await Promise.all([
    db.aiChatActivity.groupBy({
      by: ["provider"],
      where: { userId: ctx.userId },
      _sum: { messages: true },
      _count: { _all: true },
      _min: { date: true },
      _max: { date: true },
    }),
    db.integration.findMany({ where: { userId: ctx.userId, provider: { in: [...AI_PROVIDERS] } } }),
  ]);

  return (
    <Panel
      id="ai-import"
      title="ChatGPT & Claude"
      description="Neither offers an API for your own chat history, so import the official data export instead."
    >
      <p className="mb-4 flex gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>
          <span className="font-medium">Parsed on your device.</span>{" "}
          <span className="text-muted-foreground">Your conversations never leave the browser — only daily counts and conversation titles are saved. You can delete them any time.</span>
        </span>
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {AI_PROVIDERS.map((provider) => {
          const meta = AI_PROVIDER_META[provider];
          const t = totals.find((x) => x.provider === provider);
          const state = states.find((s) => s.provider === provider);
          const days = t?._count._all ?? 0;
          const hasData = days > 0;
          return (
            <article key={provider} className="flex flex-col rounded-xl border border-border p-4" aria-labelledby={`ai-${provider}-title`}>
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-muted" aria-hidden>
                  <Bot className="size-4" style={{ color: meta.color }} />
                </span>
                <div className="min-w-0">
                  <h3 id={`ai-${provider}-title`} className="text-sm font-semibold">
                    {meta.label}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {state?.lastSyncedAt ? `Last imported ${formatImportedAt(state.lastSyncedAt, ctx.tz)}` : "Not imported yet"}
                  </p>
                </div>
              </div>

              {hasData ? (
                <div className="mt-4">
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/50 px-2 py-2">
                      <dt className="text-[11px] text-muted-foreground">Messages</dt>
                      <dd className="tabular text-base font-semibold">{(t?._sum.messages ?? 0).toLocaleString()}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-2 py-2">
                      <dt className="text-[11px] text-muted-foreground">Active days</dt>
                      <dd className="tabular text-base font-semibold">{days.toLocaleString()}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-2 py-2">
                      <dt className="text-[11px] text-muted-foreground">Per active day</dt>
                      <dd className="tabular text-base font-semibold">{Math.round((t?._sum.messages ?? 0) / Math.max(1, days))}</dd>
                    </div>
                  </dl>
                  {t?._min.date && t._max.date && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Covers {formatDate(t._min.date)} – {formatDate(t._max.date)}
                    </p>
                  )}
                </div>
              ) : (
                <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                  {EXPORT_STEPS[provider].map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                <AiImportButton provider={provider} timeZone={ctx.tz} hasData={hasData} />
                {(hasData || state) && <AiDeleteButton provider={provider} days={days} />}
              </div>
              {hasData && (
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none hover:text-foreground">How to get a fresh export</summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    {EXPORT_STEPS[provider].map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

/** ChatGPT / Claude usage panel for the AI & Technology page; null when nothing imported. */
export async function AiUsagePanel() {
  const ctx = await getContext();
  const any = await db.aiChatActivity.findFirst({ where: { userId: ctx.userId }, select: { id: true } });
  if (!any) return null;

  const firstWeek = addDays(ctx.weekStart, -7 * 11);
  const rows = await db.aiChatActivity.findMany({
    where: { userId: ctx.userId, date: { gte: firstWeek, lte: addDays(ctx.weekStart, 6) } },
    select: { provider: true, date: true, conversations: true, messages: true, titles: true },
    orderBy: { date: "desc" },
  });

  const weeks = Array.from({ length: 12 }, (_, i) => addDays(firstWeek, i * 7));
  const data = weeks.map((ws) => {
    const end = addDays(ws, 6);
    const point = { label: formatDate(ws, "dm"), CHATGPT: 0, CLAUDE: 0 };
    for (const r of rows) {
      if (r.date >= ws && r.date <= end && (r.provider === "CHATGPT" || r.provider === "CLAUDE")) point[r.provider] += r.messages;
    }
    return point;
  });

  const thisWeek = rows.filter((r) => r.date >= ctx.weekStart);
  const weekChats = thisWeek.reduce((s, r) => s + r.conversations, 0);
  const weekMessages = thisWeek.reduce((s, r) => s + r.messages, 0);
  const topics: string[] = [];
  const seen = new Set<string>();
  for (const r of thisWeek) {
    for (const t of r.titles) {
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      topics.push(t);
      if (topics.length >= 10) break;
    }
    if (topics.length >= 10) break;
  }

  return (
    <Panel title="AI assistant usage" description="Imported from your ChatGPT and Claude exports · messages you sent per week">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <Bars
            data={data}
            keys={AI_PROVIDERS.map((p) => ({ key: p, label: AI_PROVIDER_META[p].label, color: AI_PROVIDER_META[p].color }))}
            stacked
            ariaLabel="Messages sent to ChatGPT and Claude per week for the last 12 weeks"
            emptyText="No imported chats in the last 12 weeks"
          />
          <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
            {AI_PROVIDERS.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: AI_PROVIDER_META[p].color }} aria-hidden />
                {AI_PROVIDER_META[p].label}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Chats this week</p>
              <p className="tabular mt-1 text-xl font-semibold">{weekChats}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Messages this week</p>
              <p className="tabular mt-1 text-xl font-semibold">{weekMessages}</p>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">This week&apos;s topics</p>
            {topics.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {topics.map((t) => (
                  <li key={t} className="truncate" title={t}>
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing imported for this week yet — re-import a fresh export to see recent topics.</p>
            )}
          </div>
        </div>
      </div>
      <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>Usage is context, not learning time — it doesn&apos;t count toward your targets. If a chat was learning, log it as a session above.</span>
      </p>
    </Panel>
  );
}
