import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import { requireAdmin } from "../auth";
import { mediaType } from "../schemas";
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
    const created = await c.get("prisma").contentSubmission.create({
      data: {
        kind: input.kind,
        submitterId: c.get("user").id,
        targetMediaItemId: input.targetMediaItemId,
        duplicateMediaItemId: input.duplicateMediaItemId,
        proposedData: input.proposedData as Prisma.InputJsonValue | undefined,
        message: input.message,
      },
    });
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

submissions.post(
  "/:id/review",
  requireAdmin,
  zValidator("json", z.object({
    decision: z.enum(["APPROVE", "REJECT"]),
    adminNote: z.string().trim().max(5000).optional(),
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
    const { decision, adminNote } = c.req.valid("json");

    await prisma.$transaction(async (tx) => {
      if (decision === "APPROVE" && submission.kind === "MEDIA_EDIT") {
        if (!submission.targetMediaItemId) throw new Error("target_required");
        const patch = editableMedia.parse(submission.proposedData ?? {});
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
        const proposal = newMedia.parse(submission.proposedData ?? {});
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
