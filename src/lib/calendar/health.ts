import connectMongo from '@/lib/mongoose';
import CalendarConnectionModel, {
  type CalendarConnectionDoc,
  type CalendarConnectionStatus,
  type CalendarSyncErrorKind,
} from '@/lib/models/CalendarConnection';
import type { CalendarProvider } from './types';
import { invalidateConnectionCache } from './connections';

export const GOOGLE_POLL_MS = 15 * 60_000;
export const APPLE_POLL_MS = 5 * 60_000;

export const SYNC_TIMEOUT_MS = 90_000;
export const INITIAL_SYNC_TIMEOUT_MS = 5 * 60_000;

const BASE_BACKOFF_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
const DEGRADE_AFTER = 3;
const AUTO_PAUSE_AFTER = 8;
const AUTO_PAUSE_AFTER_MS = 24 * 60 * 60_000;
export const AUTO_DISCONNECT_AFTER_MS = 14 * 24 * 60 * 60_000;

/** Statuses the scheduler is still allowed to sync. */
export const SYNCABLE_STATUSES: CalendarConnectionStatus[] = ['active', 'error'];

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function classifySyncError(err: unknown): {
  kind: CalendarSyncErrorKind;
  message: string;
} {
  const e = err as { name?: string; message?: string; code?: string } | undefined;
  const name = e?.name ?? '';
  const raw = e?.message || String(err ?? 'unknown error');
  const msg = `${raw} ${e?.code ?? ''}`.toLowerCase();

  if (/ratelimitexceeded|userratelimitexceeded|quotaexceeded|\b429\b|too many requests/.test(msg)) {
    return { kind: 'rateLimit', message: raw };
  }
  if (
    name === 'GoogleAuthError' ||
    name === 'AppleAuthError' ||
    /invalid_grant|invalid_client|invalid_token|unauthorized|unauthoriz|\b401\b|authentication failed|no refresh token|missing credentials|insufficient permission/.test(
      msg,
    )
  ) {
    return { kind: 'auth', message: raw };
  }
  if (/\b404\b|\b410\b|not ?found|has been deleted|resource is gone/.test(msg)) {
    return { kind: 'gone', message: raw };
  }
  return { kind: 'transient', message: raw };
}

function backoffMs(failures: number): number {
  const exp = Math.min(BASE_BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS);
  return Math.round(exp * (0.85 + Math.random() * 0.3));
}

function pollMs(provider: CalendarProvider): number {
  return provider === 'google' ? GOOGLE_POLL_MS : APPLE_POLL_MS;
}

export async function recordSyncSuccess(conn: CalendarConnectionDoc): Promise<void> {
  await connectMongo();
  const wasBlocked = conn.status !== 'active';
  const now = new Date();
  await CalendarConnectionModel.updateOne(
    { _id: conn._id },
    {
      $set: {
        status: 'active',
        consecutiveFailures: 0,
        lastSuccessAt: now,
        nextPollAt: new Date(now.getTime() + pollMs(conn.provider)),
      },
      $unset: {
        errorMessage: 1,
        firstFailureAt: 1,
        lastFailureAt: 1,
        lastErrorKind: 1,
        pausedAt: 1,
        pausedReason: 1,
        syncRequestedAt: 1,
      },
    },
  );
  conn.status = 'active';
  conn.consecutiveFailures = 0;
  conn.firstFailureAt = undefined;
  if (wasBlocked) invalidateConnectionCache(conn.userId);
}

/**
 * Escalating guard: transient trouble retries with jittered backoff, a run of
 * failures degrades then auto-pauses the connection, and rejected credentials
 * stop it outright instead of hammering the provider.
 */
export async function recordSyncFailure(
  conn: CalendarConnectionDoc,
  err: unknown,
): Promise<{ kind: CalendarSyncErrorKind; status: CalendarConnectionStatus }> {
  const { kind, message } = classifySyncError(err);
  await connectMongo();

  const now = Date.now();
  const failures = (conn.consecutiveFailures ?? 0) + 1;
  const firstFailureAt = conn.firstFailureAt ?? new Date(now);

  const set: Record<string, unknown> = {
    consecutiveFailures: failures,
    firstFailureAt,
    lastFailureAt: new Date(now),
    lastErrorKind: kind,
    errorMessage: message.slice(0, 300),
  };

  let status: CalendarConnectionStatus;
  if (kind === 'auth') {
    status = 'reauth_required';
  } else if (kind === 'gone') {
    status = 'paused';
    set.pausedReason = 'calendar-unavailable';
  } else {
    const failingForMs = now - firstFailureAt.getTime();
    const exhausted =
      kind !== 'rateLimit' &&
      (failures >= AUTO_PAUSE_AFTER || failingForMs >= AUTO_PAUSE_AFTER_MS);
    if (exhausted) {
      status = 'paused';
      set.pausedReason = 'repeated-failures';
    } else {
      status = failures >= DEGRADE_AFTER ? 'error' : 'active';
      set.nextPollAt = new Date(now + backoffMs(failures));
    }
  }

  set.status = status;
  if (status === 'paused') set.pausedAt = new Date(now);

  await CalendarConnectionModel.updateOne(
    { _id: conn._id },
    { $set: set, $unset: { syncRequestedAt: 1 } },
  );

  conn.status = status;
  conn.consecutiveFailures = failures;
  conn.firstFailureAt = firstFailureAt;
  if (!SYNCABLE_STATUSES.includes(status)) invalidateConnectionCache(conn.userId);

  return { kind, status };
}

/**
 * Runs one sync pass under a timeout and records the outcome on the
 * connection. Always rethrows so callers can still react.
 */
export async function runGuardedSync<T>(
  conn: CalendarConnectionDoc,
  label: string,
  fn: () => Promise<T>,
  opts?: { timeoutMs?: number },
): Promise<T> {
  try {
    const result = await withTimeout(
      fn(),
      opts?.timeoutMs ?? SYNC_TIMEOUT_MS,
      `${conn.provider} ${label}`,
    );
    await recordSyncSuccess(conn);
    return result;
  } catch (err) {
    const { kind, status } = await recordSyncFailure(conn, err);
    console.error(
      `[calendar] ${label} failed (${conn.provider}/${conn.userId}) kind=${kind} -> ${status}:`,
      (err as Error)?.message,
    );
    throw err;
  }
}

/** User-initiated retry: clears the failure streak and asks for a sync now. */
export async function resumeConnection(userId: string, provider: CalendarProvider) {
  await connectMongo();
  const conn = await CalendarConnectionModel.findOne({ userId, provider });
  if (!conn) return null;
  if (conn.status === 'disconnected') return conn;

  await CalendarConnectionModel.updateOne(
    { _id: conn._id },
    {
      $set: {
        status: 'active',
        consecutiveFailures: 0,
        nextPollAt: new Date(),
        syncRequestedAt: new Date(),
      },
      $unset: {
        errorMessage: 1,
        firstFailureAt: 1,
        lastFailureAt: 1,
        lastErrorKind: 1,
        pausedAt: 1,
        pausedReason: 1,
      },
    },
  );
  invalidateConnectionCache(userId);
  conn.status = 'active';
  conn.consecutiveFailures = 0;
  return conn;
}

/**
 * Connections that have been broken past the grace period are disconnected on
 * their own: credentials are wiped and push channels torn down, so the app
 * stops holding access it can no longer use.
 */
export async function sweepStaleConnections(): Promise<number> {
  await connectMongo();
  const cutoff = new Date(Date.now() - AUTO_DISCONNECT_AFTER_MS);
  const stale = await CalendarConnectionModel.find({
    status: { $in: ['paused', 'reauth_required'] },
    $or: [
      { firstFailureAt: { $lte: cutoff } },
      { firstFailureAt: { $exists: false }, updatedAt: { $lte: cutoff } },
    ],
  }).limit(25);

  let count = 0;
  for (const conn of stale) {
    try {
      const { autoDisconnectConnection } = await import('./disconnect');
      await autoDisconnectConnection(
        conn,
        conn.status === 'reauth_required' ? 'credentials-expired' : 'sync-unhealthy',
      );
      count++;
    } catch (err) {
      console.error(
        `[calendar] auto-disconnect failed (${conn.provider}/${conn.userId}):`,
        (err as Error)?.message,
      );
    }
  }
  return count;
}
