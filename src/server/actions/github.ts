"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { auth } from "../auth";
import { getContext } from "../context";
import { linkedAccount, providerAccessToken, providerConfigured } from "../integrations/tokens";
import { revokeGithubGrant, syncGithub } from "../integrations/github";
import { GITHUB_PROVIDER } from "@/lib/domain/github";
import { firstError, type ActionResult } from "@/lib/validation";

const MANUAL_SYNC_COOLDOWN_MS = 15_000;
const noInput = z.undefined().or(z.object({}).strict());

function refresh() {
  for (const p of ["/integrations", "/ai", "/dashboard"]) revalidatePath(p);
}

/** Pull GitHub activity right now (read-only). */
export async function syncGithubNow(raw?: unknown): Promise<ActionResult> {
  const parsed = noInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  try {
    const ctx = await getContext();
    if (!providerConfigured("github")) return { ok: false, error: "GitHub isn't set up yet. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .env first." };
    const account = await linkedAccount(ctx.userId, "github");
    if (!account) return { ok: false, error: "Connect GitHub first." };
    const state = await db.integration.findUnique({ where: { userId_provider: { userId: ctx.userId, provider: GITHUB_PROVIDER } } });
    if (state?.lastSyncedAt && Date.now() - state.lastSyncedAt.getTime() < MANUAL_SYNC_COOLDOWN_MS) {
      return { ok: false, error: "Synced moments ago. Give it a few seconds." };
    }
    const r = await syncGithub(ctx);
    refresh();
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, data: undefined, message: r.warning ?? "GitHub activity synced" };
  } catch (e) {
    // Let Next handle its own control flow (e.g. the sign-in redirect from getContext).
    unstable_rethrow(e);
    return { ok: false, error: "Couldn't sync GitHub right now. Please try again." };
  }
}

/**
 * Disconnect GitHub: revoke the OAuth grant (best effort), unlink the account,
 * and delete the stored GitHub activity and sync state.
 */
export async function disconnectGithub(raw?: unknown): Promise<ActionResult> {
  const parsed = noInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  try {
    const ctx = await getContext();
    const userId = ctx.userId;
    const account = await linkedAccount(userId, "github");
    if (account) {
      // Check before touching anything: never remove the user's only way to sign in.
      const others = await db.account.count({ where: { userId, providerId: { not: "github" } } });
      if (others === 0) return { ok: false, error: "GitHub is your only sign-in method, so it can't be disconnected." };

      const token = await providerAccessToken(userId, "github");
      if (token) await revokeGithubGrant(token);
      try {
        await auth.api.unlinkAccount({ body: { accountId: account.id }, headers: await headers() });
      } catch (e) {
        unstable_rethrow(e);
        // Better Auth refuses when the session isn't fresh; the cleanup below covers it.
      }
      // Remove every GitHub link for this user (also covers the fallback above and duplicate links).
      await db.account.deleteMany({ where: { userId, providerId: "github" } });
    }
    await db.$transaction([
      db.githubActivity.deleteMany({ where: { userId } }),
      db.integration.deleteMany({ where: { userId, provider: GITHUB_PROVIDER } }),
    ]);
    refresh();
    return { ok: true, data: undefined, message: "GitHub disconnected and its activity removed from TrackMe" };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: "Couldn't disconnect GitHub. Please try again." };
  }
}
