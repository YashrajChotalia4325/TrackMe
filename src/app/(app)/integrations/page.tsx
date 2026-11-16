import { Info, Share2 } from "lucide-react";
import { getContext } from "@/server/context";
import { PageHeader } from "@/components/common/ui";
import { GoogleIntegration } from "@/components/integrations/google-integration";
import { GithubIntegration } from "@/components/integrations/github-integration";
import { AiImportIntegration } from "@/components/integrations/ai-import-integration";
import { Note, ProviderCard } from "@/components/integrations/provider-card";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  await getContext();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Integrations"
        title="Connect your tools"
        description="Read-only connections that save you typing. TrackMe never posts, sends or edits anything on your behalf, and you can disconnect any time."
      />
      <GoogleIntegration />
      <GithubIntegration />
      <AiImportIntegration />
      <ProviderCard id="social" block="bg-block-stone" icon={Share2} title="Social media" description="Why Instagram, X and LinkedIn aren't here" status="not-set-up" statusLabel="Not available">
        <Note icon={Info} className="text-sm">
          <span className="text-muted-foreground">
            These platforms don&apos;t offer personal-use APIs for your own activity (LinkedIn&apos;s is partner-only, X&apos;s is paid, Instagram&apos;s only covers business accounts) and none
            report screen time. Use the networking log on the Career page for LinkedIn outreach, and your phone&apos;s Digital Wellbeing for screen time.
          </span>
        </Note>
      </ProviderCard>
    </div>
  );
}
