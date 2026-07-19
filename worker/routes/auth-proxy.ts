import type { Context } from "hono";
import type { AppEnv } from "../types";

/** Strip any Domain attribute so the browser binds the cookie to OUR host
 *  (host-only) instead of the upstream auth origin. */
function rebindCookie(setCookie: string): string {
  return setCookie
    .split(";")
    .filter((part) => !/^\s*domain\s*=/i.test(part))
    .join(";");
}

/**
 * Same-origin reverse proxy for the Neon Auth server.
 *
 * The auth server lives on a separate origin, so its session cookie is a
 * third-party cookie from the SPA's point of view — and Safari, Firefox, and
 * incognito Chrome block those. Symptoms: OAuth completes but the session
 * evaporates on the next load, so users have to sign in twice and logins never
 * persist. Routing all auth traffic through the Worker at /api/auth/* makes
 * the session cookie first-party, which every browser keeps.
 *
 * The OAuth redirect dance still happens on the Neon origin (Google's redirect
 * URI is registered there); it hands the SPA a one-time `session_verifier`
 * query param, and the SDK's get-session call — now proxied here — exchanges
 * it for a session whose cookie we re-issue against our host.
 */
export async function proxyNeonAuth(c: Context<AppEnv>) {
  const suffix = c.req.path.slice("/api/auth".length) || "/";
  const upstream = new URL(c.env.NEON_AUTH_URL.replace(/\/+$/, "") + suffix);
  upstream.search = new URL(c.req.url).search;

  const headers = new Headers(c.req.raw.headers);
  // Strip our proxy-identity headers: fetch derives Host from the upstream
  // URL, and Neon's edge rejects requests whose (X-Forwarded-)Host doesn't
  // match it ("Invalid hostname header").
  for (const h of [
    "host",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-forwarded-for",
    "forwarded",
    "x-real-ip",
  ]) {
    headers.delete(h);
  }

  const res = await fetch(upstream, {
    method: c.req.method,
    headers,
    body: c.req.raw.body,
    // Pass 3xx responses through untouched — the auth client (or browser)
    // must follow them itself, exactly as if it talked to Neon directly.
    redirect: "manual",
  });

  const outHeaders = new Headers(res.headers);
  outHeaders.delete("set-cookie");
  for (const sc of res.headers.getSetCookie()) {
    outHeaders.append("set-cookie", rebindCookie(sc));
  }
  // fetch already decoded the body; stale encoding headers would corrupt it.
  outHeaders.delete("content-encoding");
  outHeaders.delete("content-length");

  return new Response(res.body, { status: res.status, headers: outHeaders });
}
