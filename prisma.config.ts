import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved the connection URL out of schema.prisma. This config is used
// by the Prisma CLI (`migrate`, `db push`, `studio`). The Worker itself
// connects at runtime via the Neon driver adapter — see worker/index.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
