import { NextRequest } from 'next/server';
import type { AuthContext } from '@/lib/auth';
import { runWithAuth } from '@/lib/authContext';

const INTERNAL_ORIGIN = 'http://internal.local';

type RouteHandler = (req: NextRequest) => Promise<Response>;

/**
 * Invokes an existing API route handler in-process on behalf of an already
 * authenticated MCP caller, so tools inherit every side effect the app relies
 * on (fly awards, quest counters, streak credit, analytics, device sync).
 */
export async function callRoute(
  handler: RouteHandler,
  auth: AuthContext,
  init: {
    path: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    query?: Record<string, string | undefined>;
    body?: unknown;
  },
): Promise<any> {
  const url = new URL(init.path, INTERNAL_ORIGIN);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const req = new NextRequest(url, {
    method: init.method,
    ...(init.body === undefined
      ? {}
      : {
          body: JSON.stringify(init.body),
          headers: { 'content-type': 'application/json' },
        }),
  });

  const res = await runWithAuth(auth, () => handler(req));
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(
      payload?.error ?? `Request failed with status ${res.status}`,
    );
  }
  return payload;
}
