import { getContext } from "@/server/context";
import { Panel } from "@/components/common/ui";
import { DashboardLayoutForm, PersonalWhyForm, StartPageForm } from "@/components/settings/personalize-forms";
import { MOTIVATION } from "@/lib/domain/constants";
import { normalizeLayout, normalizeStartPage } from "@/lib/domain/dashboard-layout";
import { formatDate, greeting } from "@/lib/time";

/** Settings → Personalize: personal why, dashboard layout and start page. */
export async function PersonalizeTab() {
  const ctx = await getContext();
  const s = ctx.settings;
  const motivation = MOTIVATION[Number(ctx.today.replaceAll("-", "")) % MOTIVATION.length];

  return (
    <div className="space-y-6">
      <Panel title="Your why" description="One line about what all of this is for. It replaces the rotating quote at the top of your dashboard.">
        <PersonalWhyForm
          initial={s.personalWhy ?? ""}
          preview={{ date: formatDate(ctx.today, "long"), greeting: `${greeting(ctx.nowMinute)}, ${ctx.name}.`, fallback: motivation }}
        />
      </Panel>

      <Panel title="Dashboard layout" description="Choose which panels appear and in what order. Hidden panels only leave the dashboard; nothing is deleted.">
        <DashboardLayoutForm initial={normalizeLayout(s.dashboardLayout)} />
      </Panel>

      <Panel title="Start page" description="Where TrackMe opens after you sign in.">
        <StartPageForm initial={normalizeStartPage(s.startPage)} />
      </Panel>
    </div>
  );
}
