import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 moved the connection URL out of schema.prisma. This config is used
// by the Prisma CLI (`migrate`, `db push`, `studio`). The Worker itself
// connects at runtime via the Neon driver adapter — see worker/index.ts.
//
// We read `process.env.DATABASE_URL` directly rather than Prisma's `env()`
// helper: `env()` throws eagerly when the variable is missing, which breaks
// `prisma generate` in CI (postinstall) where no DATABASE_URL is set. Generate
// doesn't need the URL — only migrate/db push/studio do, and those run in
// contexts where the variable is present.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
