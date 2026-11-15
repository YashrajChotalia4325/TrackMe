import { Info } from "lucide-react";
import { getContext } from "@/server/context";
import { PageHeader, Panel } from "@/components/common/ui";
import { GoogleIntegration } from "@/components/integrations/google-integration";
import { GithubIntegration } from "@/components/integrations/github-integration";
import { AiImportIntegration } from "@/components/integrations/ai-import-integration";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  await getContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Connect your tools"
        description="Read-only connections that save you typing. TrackMe never posts, sends or edits anything on your behalf, and you can disconnect any time."
      />
      <GoogleIntegration />
      <GithubIntegration />
      <AiImportIntegration />
      <Panel title="Social media" description="Why Instagram, X and LinkedIn aren't here">
        <p className="flex gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            These platforms don&apos;t offer personal-use APIs for your own activity (LinkedIn&apos;s is partner-only, X&apos;s is paid, Instagram&apos;s only covers business accounts) and none
            report screen time. Use the networking log on the Career page for LinkedIn outreach, and your phone&apos;s Digital Wellbeing for screen time.
          </span>
        </p>
      </Panel>
    </div>
  );
}
