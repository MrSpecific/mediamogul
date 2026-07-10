import { getAuthToken } from "../auth";

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
  const token = await getAuthToken();
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { error?: string }).error ?? res.statusText ?? "request_failed";
    throw new ApiError(res.status, message, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiSend = <T>(method: string, path: string, body?: unknown) =>
  api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
