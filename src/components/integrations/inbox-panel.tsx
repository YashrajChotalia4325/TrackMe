import Link from "next/link";
import { db } from "@/server/db";
import { getContext } from "@/server/context";
import { applicationOptions, newInsightViews } from "@/server/integrations/google";
import { Panel } from "@/components/common/ui";
import { Button } from "@/components/ui/button";
import { InsightList } from "./google-insights";

/** Dashboard panel of Gmail suggestions; returns null when there is nothing to show. */
export async function InboxPanel() {
  const ctx = await getContext();
  const total = await db.emailInsight.count({ where: { userId: ctx.userId, status: "NEW" } });
  if (total === 0) return null;
  const [insights, applications] = await Promise.all([newInsightViews(ctx, 5), applicationOptions(ctx)]);
  if (insights.length === 0) return null;

  return (
    <Panel
      title="From your inbox"
      description="Spotted in recent emails — nothing is added to your plan until you accept."
      action={
        <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/integrations#google" />}>
          {total > insights.length ? `View all ${total}` : "Manage"}
        </Button>
      }
    >
      <InsightList insights={insights} applications={applications} today={ctx.today} />
    </Panel>
  );
}
