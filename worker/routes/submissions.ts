import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { requireAdmin } from "../auth";
import { mediaType } from "../schemas";
import {
  type MediaCandidate,
  searchBooks,
  searchScreenWikidata,
} from "../services/scrape";
import type { AppEnv } from "../types";

export const submissions = new Hono<AppEnv>();

const kind = z.enum([
  "MEDIA_EDIT",
  "NEW_MEDIA",
  "DUPLICATE",
  "INCORRECT_INFO",
  "ABUSE",
  "OTHER",
]);

const KIND_LABELS: Record<z.infer<typeof kind>, string> = {
  MEDIA_EDIT: "media edit",
  NEW_MEDIA: "new media",
  DUPLICATE: "duplicate report",
  INCORRECT_INFO: "correction",
  ABUSE: "abuse report",
  OTHER: "feedback",
};

const editableMedia = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  subtitle: z.string().trim().max(500).nullable().optional(),
  shortDescription: z.string().trim().max(500).nullable().optional(),
  synopsis: z.string().trim().nullable().optional(),
  wikipediaUrl: z.string().url().max(1000).nullable().optional(),
  releaseDate: z.string().date().nullable().optional(),
  originalLanguage: z.string().trim().max(20).nullable().optional(),
  publisher: z.string().trim().max(300).nullable().optional(),
  pageCount: z.number().int().positive().nullable().optional(),
  runtimeMinutes: z.number().int().positive().nullable().optional(),
  seasons: z.number().int().nonnegative().nullable().optional(),
  episodes: z.number().int().nonnegative().nullable().optional(),
}).strict();

const newMedia = editableMedia.extend({
  type: mediaType,
  title: z.string().trim().min(1).max(500),
});

submissions.post(
  "/",
  zValidator("json", z.object({
    kind,
    targetMediaItemId: z.string().optional(),
    duplicateMediaItemId: z.string().optional(),
    proposedData: z.record(z.string(), z.unknown()).optional(),
    message: z.string().trim().max(5000).optional(),
  })),
  async (c) => {
    const input = c.req.valid("json");
    if (input.kind !== "NEW_MEDIA" && !input.targetMediaItemId) {
      return c.json({ error: "target_required" }, 400);
    }
    if (input.kind === "DUPLICATE" && !input.duplicateMediaItemId) {
      return c.json({ error: "duplicate_required" }, 400);
    }
    if ((input.kind === "MEDIA_EDIT" || input.kind === "NEW_MEDIA") && !input.proposedData) {
      return c.json({ error: "proposed_data_required" }, 400);
    }
    const prisma = c.get("prisma");
    const created = await prisma.contentSubmission.create({
      data: {
        kind: input.kind,
        submitterId: c.get("user").id,
        targetMediaItemId: input.targetMediaItemId,
        duplicateMediaItemId: input.duplicateMediaItemId,
        proposedData: input.proposedData as Prisma.InputJsonValue | undefined,
        message: input.message,
      },
    });

    // Notify every admin so submissions don't sit unseen. Admins are resolved
    // from the DB role (ADMIN_EMAILS-only admins have no queryable row here).
    // Skip the submitter in case an admin filed it themselves.
    const submitter = c.get("profile");
    const admins = await prisma.user.findMany({
      where: { appRole: "ADMIN", id: { not: submitter.id } },
      select: { id: true },
    });
    if (admins.length > 0) {
      const who = submitter.displayName
        ? `${submitter.displayName} (@${submitter.username})`
        : `@${submitter.username}`;
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "CONTENT_SUBMISSION" as const,
          actorId: submitter.id,
          message: `${who} submitted a ${KIND_LABELS[input.kind]} for review`,
        })),
      });
    }

    return c.json(created, 201);
  },
);

submissions.get("/", requireAdmin, async (c) => {
  const status = z.enum(["PENDING", "APPROVED", "REJECTED"])
    .catch("PENDING")
    .parse(c.req.query("status"));
  const rows = await c.get("prisma").contentSubmission.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    include: {
      submitter: { select: { username: true, displayName: true } },
      targetMediaItem: { select: { id: true, title: true, type: true } },
      duplicateMediaItem: { select: { id: true, title: true, type: true } },
    },
  });
  return c.json(rows);
});

/**
 * Admin scrape-assist for a submission: search the free public sources for the
 * submission's title/type and return normalized candidates (unsaved). The admin
 * can then fold selected fields into the proposal and pass them back to the
 * review endpoint. Never mutates the submission.
 */
submissions.get("/:id/scrape", requireAdmin, async (c) => {
  const prisma = c.get("prisma");
  const submission = await prisma.contentSubmission.findUnique({
    where: { id: c.req.param("id") },
    include: { targetMediaItem: { select: { title: true, type: true } } },
  });
  if (!submission) return c.json({ error: "not_found" }, 404);

  const proposed = (submission.proposedData ?? {}) as Record<string, unknown>;
  const type =
    (typeof proposed.type === "string" ? proposed.type : undefined) ??
    submission.targetMediaItem?.type;
  const q =
    c.req.query("q")?.trim() ||
    (typeof proposed.title === "string" ? proposed.title : "") ||
    submission.targetMediaItem?.title ||
    "";
  if (!q) return c.json({ error: "no_query", items: [] }, 400);

  let items: MediaCandidate[] = [];
  try {
    if (type === "MOVIE" || type === "TV_SHOW") {
      items = (await searchScreenWikidata(q, 0, 6)).slice(0, 5);
    } else {
      // Books/audiobooks (and unknown types) resolve well against Open Library.
      items = (await searchBooks(q, 6, 1, 5)).slice(0, 5);
    }
  } catch (e) {
    return c.json({ error: (e as Error).message, items: [] }, 502);
  }
  return c.json({ items });
});

submissions.post(
  "/:id/review",
  requireAdmin,
  zValidator("json", z.object({
    decision: z.enum(["APPROVE", "REJECT"]),
    adminNote: z.string().trim().max(5000).optional(),
    // When approving a MEDIA_EDIT/NEW_MEDIA, the admin may override the stored
    // proposal — e.g. after merging in scraped fields the submitter didn't
    // provide. Falls back to the submitted proposal when omitted.
    proposedData: z.record(z.string(), z.unknown()).optional(),
  })),
  async (c) => {
    const prisma = c.get("prisma");
    const submission = await prisma.contentSubmission.findUnique({
      where: { id: c.req.param("id") },
    });
    if (!submission) return c.json({ error: "not_found" }, 404);
    if (submission.status !== "PENDING") {
      return c.json({ error: "already_reviewed" }, 409);
    }
    const { decision, adminNote, proposedData } = c.req.valid("json");
    const effectiveProposal = proposedData ?? submission.proposedData ?? {};

    await prisma.$transaction(async (tx) => {
      if (decision === "APPROVE" && submission.kind === "MEDIA_EDIT") {
        if (!submission.targetMediaItemId) throw new Error("target_required");
        const patch = editableMedia.parse(effectiveProposal);
        const { releaseDate, ...rest } = patch;
        await tx.mediaItem.update({
          where: { id: submission.targetMediaItemId },
          data: {
            ...rest,
            ...(releaseDate !== undefined
              ? { releaseDate: releaseDate ? new Date(releaseDate) : null }
              : {}),
          },
        });
      }
      if (decision === "APPROVE" && submission.kind === "NEW_MEDIA") {
        const proposal = newMedia.parse(effectiveProposal);
        const { releaseDate, ...rest } = proposal;
        await tx.mediaItem.create({
          data: {
            ...rest,
            releaseDate: releaseDate ? new Date(releaseDate) : undefined,
            source: "USER_SUBMITTED",
            createdById: submission.submitterId,
          },
        });
      }
      await tx.contentSubmission.update({
        where: { id: submission.id },
        data: {
          status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewerId: c.get("user").id,
          adminNote,
          reviewedAt: new Date(),
        },
      });
    });
    return c.json({ status: decision === "APPROVE" ? "APPROVED" : "REJECTED" });
  },
);
