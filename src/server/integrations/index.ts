import "server-only";
import type { UserContext } from "../context";
import { syncGoogleIfDue } from "./google";
import { syncGithubIfDue } from "./github";

/**
 * Background syncs run from the app layout's maintenance pass. Each provider
 * throttles itself and swallows its own errors (recorded on its Integration row)
 * so an integration problem never breaks page rendering.
 */
export async function runIntegrationSyncs(ctx: UserContext) {
  await Promise.allSettled([syncGoogleIfDue(ctx), syncGithubIfDue(ctx)]);
}
