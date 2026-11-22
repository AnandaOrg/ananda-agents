// Same-origin calls to the NestJS API (proxied by next.config rewrites). Errors carry the API's
// message code, which the UI maps to translated text under `errors.*`.
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public body: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export const SIGNED_OUT_EVENT = 'aa:signed-out';

const STATUS_CODES: Record<number, string> = { 400: 'invalid', 403: 'forbidden', 404: 'not_found', 500: 'server', 502: 'server', 503: 'server' };

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  // Session expired: the shell shows a "You've been signed out" dialog over the page instead of
  // throwing the person out mid-task (README › Errors › Signed out).
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
    // Signed in with a link or Google but no authenticator code yet: finish the second step.
    if (body?.message === 'mfa_required') {
      const here = window.location.pathname + window.location.search;
      window.location.replace(`/login/two-step?next=${encodeURIComponent(here)}`);
    } else window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  }
  if (!res.ok) {
    const msg = body?.message;
    // API codes are snake_case; anything else (framework defaults) falls back to a code per status.
    const code = typeof msg === 'string' && /^[a-z_]+$/.test(msg) ? msg : STATUS_CODES[res.status] ?? 'error';
    throw new ApiError(res.status, code, body ?? {});
  }
  return body as T;
}

export const post = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const put = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body });
export const patch = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PATCH', body });
