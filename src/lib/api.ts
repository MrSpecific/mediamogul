import { getAuthToken, clearAuthTokenCache } from "../auth";

/**
 * Base origin for the Worker API. On the web build this is empty, so requests
 * stay same-origin (`/api/...`). In a native (Capacitor) build the SPA is served
 * from a local `capacitor://` / `https://localhost` origin, so relative paths
 * would never reach the Worker — set `VITE_API_BASE_URL` to the deployed origin
 * (e.g. https://mediamogul.example.com) so the app targets it explicitly.
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Fetch wrapper for our Worker API. Injects the Neon Auth JWT as a bearer
 * token and JSON-encodes the body. Paths are relative to `/api`.
 */
export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const send = async (forceRefresh: boolean) => {
    const token = await getAuthToken(forceRefresh);
    const headers = new Headers(init.headers);
    if (init.body) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_BASE}/api${path}`, { ...init, headers });
  };

  let res = await send(false);
  // A 401 may just be an expired cached token — refresh the session once and
  // retry before surfacing it as an auth failure.
  if (res.status === 401) {
    clearAuthTokenCache();
    res = await send(true);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { error?: string }).error ?? res.statusText ?? "request_failed";
    throw new ApiError(res.status, message, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Upload a file as the raw request body (preserves its content-type). */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const send = async (forceRefresh: boolean) => {
    const token = await getAuthToken(forceRefresh);
    const headers = new Headers();
    headers.set("Content-Type", file.type || "application/octet-stream");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_BASE}/api${path}`, {
      method: "POST",
      body: file,
      headers,
    });
  };

  let res = await send(false);
  if (res.status === 401) {
    clearAuthTokenCache();
    res = await send(true);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      (body as { error?: string }).error ?? res.statusText,
      body,
    );
  }
  return (await res.json()) as T;
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiSend = <T>(method: string, path: string, body?: unknown) =>
  api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
