import { isFirebaseConfigured, firebaseAuth } from "@/services/firebase";

/** Error thrown by apiFetch. `status` is the HTTP status, or 0 for network/timeout failures. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiFetchOptions {
  method?: string;
  /** JSON-encoded and sent as the request body when present. */
  body?: unknown;
  /** Bearer token for the Authorization header. */
  auth?: string | null;
  /** Abort the request after this many ms (default 15000). */
  timeoutMs?: number;
  /** Optional external abort signal, combined with the timeout. */
  signal?: AbortSignal;
}

/** Shared fetch wrapper: JSON in/out, Bearer auth, timeout, consistent ApiError on failure. */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { method, body, auth, timeoutMs = 15000, signal } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) headers["Authorization"] = `Bearer ${auth}`;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort);
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, timedOut ? "Request timed out" : "Network error");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Current user's Firebase ID token, or null when signed out / Firebase not configured. */
export async function getIdToken(): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  const user = firebaseAuth().currentUser;
  if (!user) return null;
  return user.getIdToken().catch(() => null);
}
