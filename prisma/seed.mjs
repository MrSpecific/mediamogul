// Seeds the genres table. Idempotent (upsert by name). Run: npm run db:seed
// Uses the Neon HTTP driver directly (the generated Prisma client targets
// workerd, so it can't run under Node).
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const M = "MOVIE";
const T = "TV_SHOW";
const B = "BOOK";
const A = "AUDIOBOOK";
const G = "MAGAZINE";
const SCREEN = [M, T];
const LIT = [B, A]; // books + audiobooks share literary genres
const STORY = [M, T, B, A];

/** [name, applicableTypes] — empty array = applies to every type. */
const GENRES = [
  // Cross-medium story genres
  ["Action", STORY],
  ["Adventure", STORY],
  ["Comedy", STORY],
  ["Drama", STORY],
  ["Fantasy", STORY],
  ["Horror", STORY],
  ["Mystery", STORY],
  ["Romance", STORY],
  ["Science Fiction", STORY],
  ["Thriller", STORY],
  ["Crime", STORY],
  ["Historical", STORY],
  ["Historical Fiction", LIT.concat(SCREEN)],
  ["War", STORY],
  ["Western", STORY],
  ["Family", STORY],
  ["Dystopian", STORY],
  ["Coming-of-age", STORY],
  // Screen-specific
  ["Documentary", [M, T, G]],
  ["Animation", SCREEN],
  ["Anime", SCREEN],
  ["Musical", SCREEN],
  ["Superhero", STORY],
  ["Film Noir", [M]],
  ["Biopic", SCREEN],
  ["Short Film", [M]],
  ["Sitcom", [T]],
  ["Reality", [T]],
  ["Game Show", [T]],
  ["Soap Opera", [T]],
  ["Talk Show", [T]],
  ["Stand-up Comedy", SCREEN],
  ["Sports", [M, T, G]],
  // Literary (books + audiobooks)
  ["Literary Fiction", LIT],
  ["Non-fiction", LIT],
  ["Biography", LIT],
  ["Memoir", LIT],
  ["Self-Help", LIT],
  ["Poetry", LIT],
  ["Essays", LIT],
  ["Young Adult", LIT],
  ["Children's", [B]],
  ["Picture Book", [B]],
  ["Textbook", [B]],
  ["Reference", [B]],
  ["Cookbook", [B]],
  ["Graphic Novel", [B]],
  ["Manga", [B]],
  ["Short Stories", LIT],
  ["Philosophy", LIT],
  ["Religion", LIT],
  ["True Crime", LIT],
  ["Humor", LIT],
  ["Business", [B, A, G]],
  ["Science", [B, A, G]],
  ["Travel", [B, A, G]],
  ["Nature", [B, A, M, T, G]],
  ["Technology", [B, A, G]],
  // Magazine-specific
  ["News", [G]],
  ["Fashion", [G]],
  ["Lifestyle", [G]],
  ["Gaming", [G]],
  ["Arts & Culture", [G]],
  ["Food & Drink", [G]],
  ["Health & Fitness", [G]],
  ["Home & Garden", [G]],
  ["Automotive", [G]],
  ["Music", [G]],
  ["Politics", [G, B, A]],
  ["Photography", [G, B]],
];

const slugify = (n) =>
  n
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

let count = 0;
for (const [name, types] of GENRES) {
  await sql`
    insert into genres (id, name, slug, applicable_types, created_at)
    values (gen_random_uuid(), ${name}, ${slugify(name)}, ${types}::"MediaType"[], now())
    on conflict (name) do update set applicable_types = excluded.applicable_types
  `;
  count++;
}
console.log(`Seeded ${count} genres.`);
