/** The app's public address (production URL on Vercel, localhost in development), without a trailing slash. */
export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
