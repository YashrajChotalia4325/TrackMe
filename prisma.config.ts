import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection on hosts like Neon.
    // The app itself always uses DATABASE_URL (the pooled connection).
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
});
