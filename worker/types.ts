import type { PrismaClient } from "./generated/prisma/client";
import type { AuthUser } from "./auth";

/** Shared Hono generics: bindings (env) + per-request context variables. */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: AuthUser;
    prisma: PrismaClient;
  };
};
