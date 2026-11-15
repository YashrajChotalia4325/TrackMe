import "server-only";
import { db } from "../db";
import { auth } from "../auth";

export type LinkedProvider = "google" | "github";

export function providerConfigured(provider: LinkedProvider): boolean {
  if (provider === "google") return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

/** The user's linked account for a provider (Better Auth `account` row), if any. */
export async function linkedAccount(userId: string, provider: LinkedProvider) {
  return db.account.findFirst({ where: { userId, providerId: provider }, orderBy: { updatedAt: "desc" } });
}

/** Granted OAuth scopes for the linked account (space/comma separated in the DB). */
export function grantedScopes(account: { scope: string | null } | null): string[] {
  if (!account?.scope) return [];
  return account.scope.split(/[\s,]+/).filter(Boolean);
}

/**
 * A valid access token for the linked provider, refreshed by Better Auth when
 * expired. Returns null when the account is not linked or the token can't be refreshed.
 */
export async function providerAccessToken(userId: string, provider: LinkedProvider): Promise<string | null> {
  const account = await linkedAccount(userId, provider);
  if (!account) return null;
  try {
    const res = await auth.api.getAccessToken({ body: { accountId: account.id, userId } });
    return res.accessToken ?? null;
  } catch {
    return null;
  }
}

/** Upsert per-provider sync state. */
export async function setIntegrationState(userId: string, provider: string, data: { lastSyncedAt?: Date; lastError?: string | null; enabled?: boolean; settings?: object }) {
  return db.integration.upsert({
    where: { userId_provider: { userId, provider } },
    update: data,
    create: { userId, provider, ...data },
  });
}

/** Whether a provider's automatic sync is due (default every 30 minutes). */
export async function syncDue(userId: string, provider: string, everyMinutes = 30): Promise<boolean> {
  const state = await db.integration.findUnique({ where: { userId_provider: { userId, provider } } });
  if (state && !state.enabled) return false;
  if (!state?.lastSyncedAt) return true;
  return Date.now() - state.lastSyncedAt.getTime() > everyMinutes * 60_000;
}
