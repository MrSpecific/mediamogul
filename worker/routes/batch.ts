import type { Context } from "hono";
import { getPrisma } from "../db";
import { bulkImport, type BulkImportItem } from "./media";
import { trueUpCovers } from "../services/cover-ingest";
import { mediaType } from "../schemas";
import { z } from "zod";
import type { AppEnv } from "../types";

/** Shared-secret check for the script/tooling endpoints. */
function checkBatchToken(c: Context<AppEnv>): Response | null {
  const secret = c.env.BATCH_TOKEN;
  if (!secret) return c.json({ error: "batch_not_configured" }, 501);
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (token !== secret) return c.json({ error: "unauthorized" }, 401);
  return null;
}

const batchBody = z.object({
  items: z
    .array(
      z.object({
        query: z.string().min(1).max(300),
        type: mediaType.optional(),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * Token-guarded bulk import for tooling/scripts (`POST /api/batch/import`).
 * Mounted OUTSIDE the session-auth group and authorized by a shared secret
 * (`BATCH_TOKEN`) via `Authorization: Bearer <token>`, so CLI/cron flows don't
 * need a Neon Auth JWT. Imports are attributed to `BATCH_USER_ID` if set.
 */
export async function handleBatchImport(c: Context<AppEnv>): Promise<Response> {
  const denied = checkBatchToken(c);
  if (denied) return denied;

  const parsed = batchBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);

  const prisma = getPrisma(c.env);
  const results = await bulkImport(
    prisma,
    c.env,
    parsed.data.items as BulkImportItem[],
    c.env.BATCH_USER_ID ?? null,
  );

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  return c.json({ summary, results });
}

const trueUpBody = z.object({
  // Small pages: each item costs an image fetch + R2 put + several DB calls,
  // all of which count against the Worker's per-request subrequest budget.
  limit: z.number().int().min(1).max(25).default(10),
  cursor: z.string().optional(),
  dryRun: z.boolean().default(false),
});

/**
 * One page of the cover true-up (`POST /api/batch/true-up-covers`) — ingests
 * historic remote-linked covers into R2. Same BATCH_TOKEN guard as the bulk
 * import; driven page-by-page by scripts/true-up-covers.mjs.
 *
 * IMPORTANT: run against the DEPLOYED worker (or a dry run). Local dev pairs
 * the real database with a simulated local R2, so a non-dry local run would
 * point production rows at objects that only exist on your machine.
 */
export async function handleCoverTrueUp(c: Context<AppEnv>): Promise<Response> {
  const denied = checkBatchToken(c);
  if (denied) return denied;

  const parsed = trueUpBody.safeParse(
    (await c.req.json().catch(() => null)) ?? {},
  );
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);

  const prisma = getPrisma(c.env);
  return c.json(await trueUpCovers(prisma, c.env, parsed.data));
}
