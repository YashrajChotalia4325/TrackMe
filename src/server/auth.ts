import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { bootstrapUser } from "./bootstrap";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Single-user by default; set ALLOW_SIGNUP=true to allow more accounts.
    disableSignUp: process.env.ALLOW_SIGNUP === "false",
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  /**
   * Integrations. Google / GitHub are used only to *link* data sources to an
   * existing TrackMe account (never to create one). Each is enabled only when
   * its client credentials are present in the environment. Extra scopes
   * (Calendar, Gmail) are requested incrementally from the Integrations page.
   */
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            accessType: "offline" as const,
            prompt: "consent" as const,
            disableSignUp: true,
            disableImplicitSignUp: true,
          },
        }
      : {}),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            disableSignUp: true,
            disableImplicitSignUp: true,
          },
        }
      : {}),
  },
  account: {
    // Your Google / GitHub email can differ from your TrackMe login email.
    accountLinking: { enabled: true, allowDifferentEmails: true, trustedProviders: ["google", "github"] },
    encryptOAuthTokens: true,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await bootstrapUser(user.id, user.name);
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** Returns the signed-in user id or redirects to /login. */
export const requireUserId = cache(async (): Promise<string> => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user.id;
});
