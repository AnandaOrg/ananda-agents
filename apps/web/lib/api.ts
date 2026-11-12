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
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
    window.location.href = '/login';
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.message;
    throw new ApiError(res.status, typeof msg === 'string' ? msg : 'error', body ?? {});
  }
  return body as T;
}

export const post = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const put = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body });
export const patch = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'PATCH', body });
