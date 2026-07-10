// Image storage abstraction. Backed by Cloudflare R2 today; swap the body of
// uploadImage()/serving for Cloudflare Images later without touching callers.

export interface StoredImage {
  provider: string;
  key: string;
  url: string;
  contentType: string;
  size: number;
}

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function uploadImage(
  env: Env,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<StoredImage> {
  if (!ALLOWED.has(contentType)) {
    throw new Error("unsupported_image_type");
  }
  if (bytes.byteLength === 0) throw new Error("empty_file");
  if (bytes.byteLength > MAX_BYTES) throw new Error("file_too_large");

  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  const key = `covers/${crypto.randomUUID()}.${ext}`;
  await env.MEDIA_BUCKET.put(key, bytes, {
    httpMetadata: { contentType },
  });

  // Served by the Worker at /uploads/<key> (see worker/index.ts).
  return {
    provider: "r2",
    key,
    url: `/uploads/${key}`,
    contentType,
    size: bytes.byteLength,
  };
}
