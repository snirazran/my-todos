'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import type { SyncDirection } from '@/lib/calendar/direction';

export type { SyncDirection };

export type CalendarProvider = 'google' | 'apple';

export type CalendarConnectionInfo = {
  provider: CalendarProvider;
  status: 'active' | 'error' | 'paused' | 'reauth_required' | 'disconnected';
  errorMessage?: string;
  errorKind?: 'auth' | 'gone' | 'rateLimit' | 'transient';
  failureCount?: number;
  failingSince?: string | null;
  pausedReason?: string;
  calendarDisplayName?: string;
  appleId?: string;
  lastSyncedAt?: string | null;
  settings?: {
    importTagId?: string;
    exportEnabled?: boolean;
    importEnabled?: boolean;
  };
  direction?: SyncDirection;
  grantedScopes?: string[];
};

export type CalendarAvailability = Record<CalendarProvider, boolean>;

type ConnectionsResponse = {
  connections: CalendarConnectionInfo[];
  available?: CalendarAvailability;
};

export const CALENDAR_CONNECTIONS_KEY = '/api/calendar/connections';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useCalendarConnections() {
  const { user } = useAuth();
  const { data, mutate, isLoading } = useSWR<ConnectionsResponse>(
    user ? CALENDAR_CONNECTIONS_KEY : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return {
    connections: data?.connections ?? [],
    // Undefined until loaded — callers must not read it as "nothing works".
    available: data?.available,
    loaded: !!data,
    mutate,
    isLoading,
  };
}

export type GoogleConnectOpen =
  /** `closed` reports whether the consent window has gone away, if knowable. */
  | { ok: true; closed?: () => boolean }
  | { ok: false; reason: string };

export async function openGoogleCalendarConnect(
  direction: SyncDirection = 'two_way',
): Promise<GoogleConnectOpen> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      // Google blocks OAuth consent inside embedded webviews — use the system
      // browser with a signed state token; the app polls connection status.
      const res = await fetch('/api/calendar/google/connect-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        return {
          ok: false,
          reason:
            res.status === 503
              ? 'Calendar sync isn’t available on the server yet.'
              : 'Could not start the Google connection. Try again.',
        };
      }
      const { Browser } = await import('@capacitor/browser');
      let dismissed = false;
      let handle: { remove: () => Promise<void> } | null = null;
      handle = await Browser.addListener('browserFinished', () => {
        dismissed = true;
        void handle?.remove();
      });
      await Browser.open({
        url: `${window.location.origin}/api/calendar/google/connect?t=${encodeURIComponent(data.token)}`,
      });
      return { ok: true, closed: () => dismissed };
    }
    const popup = window.open(
      `/api/calendar/google/connect?direction=${encodeURIComponent(direction)}`,
      'gcal-connect',
      'width=520,height=680,menubar=no,toolbar=no',
    );
    if (!popup) {
      return { ok: false, reason: 'Popup blocked — allow popups for this site.' };
    }
    return { ok: true, closed: () => popup.closed };
  } catch (err) {
    console.error('google connect open failed:', (err as Error)?.message);
    return { ok: false, reason: 'Could not open the Google sign-in. Update the app and try again.' };
  }
}

const POLL_INTERVAL_MS = 2000;
const POLL_TICKS = 60;
/**
 * The consent window closes itself ~1.5s after the callback lands, so a closed
 * popup is not proof of failure — the callback may still be finishing. Keep
 * polling for a few ticks past the close before giving up.
 */
const GRACE_TICKS_AFTER_CLOSE = 3;

/**
 * The Google half of connecting: consent happens in a window this app does not
 * control, so completion is detected by polling the connection list until the
 * callback has written an active connection.
 */
export function useGoogleConnectFlow({
  mutate,
  onConnected,
  onCancelled,
}: {
  mutate: () => Promise<ConnectionsResponse | undefined>;
  onConnected?: () => void;
  /** The consent window was closed without finishing. */
  onCancelled?: () => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedRef = useRef(onConnected);
  connectedRef.current = onConnected;
  const cancelledRef = useRef(onCancelled);
  cancelledRef.current = onCancelled;

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setConnecting(false);
  }, []);

  const connect = useCallback(async (direction: SyncDirection = 'two_way') => {
    setError(null);
    setConnecting(true);
    const opened = await openGoogleCalendarConnect(direction);
    if (!opened.ok) {
      setConnecting(false);
      setError(opened.reason);
      return;
    }
    const isClosed = opened.closed;
    let ticks = 0;
    let ticksSinceClose = 0;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(async () => {
      ticks++;
      // Waiting the full budget on a window the user has already closed is the
      // difference between "cancelled" and a two-minute spinner.
      const closed = isClosed?.() ?? false;
      if (closed) ticksSinceClose++;
      const fresh = await mutate();
      const active = fresh?.connections?.find(
        (c) => c.provider === 'google' && c.status === 'active',
      );
      const gaveUp = closed && ticksSinceClose > GRACE_TICKS_AFTER_CLOSE;
      if (!active && !gaveUp && ticks <= POLL_TICKS) return;
      stop();
      if (active) {
        window.dispatchEvent(new Event('board-refresh'));
        connectedRef.current?.();
      } else if (gaveUp) {
        // The user shut the window themselves — that is a decision, not a
        // fault, so it gets no red text.
        cancelledRef.current?.();
      } else {
        setError('Connection didn’t complete. Try again.');
      }
    }, POLL_INTERVAL_MS);
  }, [mutate, stop]);

  useEffect(() => () => stop(), [stop]);

  const clearError = useCallback(() => setError(null), []);

  return { connecting, error, connect, cancel: stop, clearError };
}
