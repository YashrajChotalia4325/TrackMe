import { redirect } from "next/navigation";
import { getContext } from "@/server/context";
import { normalizeStartPage } from "@/lib/domain/dashboard-layout";

/** Send the signed-in user to their chosen start page (Settings → Personalize). */
export default async function Home() {
  // getContext() redirects to /login when there is no session.
  const ctx = await getContext();
  if (!ctx.settings.onboardedAt) redirect("/onboarding");
  redirect(normalizeStartPage(ctx.settings.startPage));
}
