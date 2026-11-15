/**
 * Seed: creates the instance owner account and initial configuration
 * (settings, categories, weekly targets, achievements catalog, known exam
 * period, long-term goals). No fake activity history is created.
 *
 * Run with: npm run db:seed
 * Credentials come from SEED_USER_EMAIL / SEED_USER_PASSWORD in .env.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/server/db";
import { bootstrapUser, ensureAchievementCatalog } from "../src/server/bootstrap";
import { INITIAL_PROFILE } from "../src/lib/domain/initial-context";

async function main() {
  await ensureAchievementCatalog();

  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;
  if (!email || !password) {
    console.log("SEED_USER_EMAIL / SEED_USER_PASSWORD not set — skipping user creation. Register in the app instead.");
    return;
  }
  if (password.length < 8) throw new Error("SEED_USER_PASSWORD must be at least 8 characters.");

  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    const id = randomUUID();
    user = await db.user.create({
      data: {
        id,
        name: INITIAL_PROFILE.displayName,
        email,
        emailVerified: true,
        accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(password) } },
      },
    });
    console.log(`Created user ${email}`);
  } else {
    console.log(`User ${email} already exists — ensuring defaults.`);
  }
  await bootstrapUser(user.id, user.name);
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
