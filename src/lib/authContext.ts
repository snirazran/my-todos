import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthContext } from '@/lib/auth';

/**
 * Lets server-side code invoke existing route handlers on behalf of an already
 * authenticated caller. Only ever populated by trusted in-process callers (the
 * MCP server), never from request data.
 */
export const authOverrideStore = new AsyncLocalStorage<AuthContext>();

export function runWithAuth<T>(ctx: AuthContext, fn: () => Promise<T>) {
  return authOverrideStore.run(ctx, fn);
}
