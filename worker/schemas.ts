import { z } from "zod";

// zod enums whose values mirror the Prisma enums (string unions match, so the
// parsed values are assignable to Prisma inputs directly).
export const mediaType = z.enum([
  "MOVIE",
  "TV_SHOW",
  "BOOK",
  "AUDIOBOOK",
  "MAGAZINE",
]);
export const mediaRelationType = z.enum([
  "ALTERNATE_FORMAT",
  "ADAPTATION",
  "TRANSLATION",
]);
export const mediaSource = z.enum(["OFFICIAL", "USER_SUBMITTED", "SCRAPED"]);
export const externalSource = z.enum([
  "IMDB",
  "TMDB",
  "GOODREADS",
  "ISBN",
  "OPEN_LIBRARY",
  "WIKIDATA",
  "CUSTOM",
]);
export const entryStatus = z.enum([
  "PLANNED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "ABANDONED",
]);
export const visibility = z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]);
export const creditRole = z.enum([
  "AUTHOR",
  "ILLUSTRATOR",
  "EDITOR",
  "DIRECTOR",
  "CREATOR",
  "NARRATOR",
  "WRITER",
  "PRODUCER",
  "CAST",
  "OTHER",
]);

export const username = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_]+$/, "lowercase letters, numbers and underscore only");
