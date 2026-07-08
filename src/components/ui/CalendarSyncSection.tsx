'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Calendar, Loader2 } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/components/auth/AuthContext';
import AppleCalendarSheet from '@/components/ui/AppleCalendarSheet';

export type CalendarConnectionInfo = {
  provider: 'google' | 'apple';
  status: 'active' | 'error' | 'reauth_required';
  errorMessage?: string;
  calendarDisplayName?: string;
  appleId?: string;
  lastSyncedAt?: string | null;
  settings?: {
    importTagId?: string;
    exportEnabled?: boolean;
    importEnabled?: boolean;
  };
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

let _cachedConnections: CalendarConnectionInfo[] = [];

export function getCalendarConnections() {
  return _cachedConnections;
}

export async function openGoogleCalendarConnect() {
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    // Google blocks OAuth consent inside embedded webviews — use the system
    // browser with a signed state token; the app polls connection status.
    const res = await fetch('/api/calendar/google/connect-token', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!data.token) return;
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({
      url: `${window.location.origin}/api/calendar/google/connect?t=${encodeURIComponent(data.token)}`,
    });
  } else {
    window.open(
      '/api/calendar/google/connect',
      'gcal-connect',
      'width=520,height=680,menubar=no,toolbar=no',
    );
  }
  window.dispatchEvent(new Event('calendar-connect-started'));
}

function useConnections() {
  const { user } = useAuth();
  const { data, mutate, isLoading } = useSWR<{
    connections: CalendarConnectionInfo[];
  }>(user ? '/api/calendar/connections' : null, fetcher);
  const connections = data?.connections ?? [];
  useEffect(() => {
    _cachedConnections = connections;
    window.dispatchEvent(new Event('calendar-connections-change'));
  }, [connections]);
  return { connections, mutate, isLoading };
}

function ProviderRow({
  icon,
  label,
  connection,
  connecting,
  onConnect,
  onDisconnect,
  subtitleOverride,
}: {
  icon: React.ReactNode;
  label: string;
  connection?: CalendarConnectionInfo;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  subtitleOverride?: string;
}) {
  const status = connection?.status;
  const subtitle =
    subtitleOverride ??
    (!connection
      ? 'Not connected'
      : status === 'reauth_required'
        ? 'Reconnect needed'
        : status === 'error'
          ? 'Sync issue — tap to retry'
          : connection.calendarDisplayName || 'Connected');

  const needsAction = !connection || status === 'reauth_required' || status === 'error';

  return (
    <div className="w-full flex items-center gap-3 px-4 py-3.5">
      <div className="h-9 w-9 flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate">{label}</div>
        <div
          className={`text-[11px] font-semibold truncate ${
            status === 'reauth_required' || status === 'error'
              ? 'text-red-500'
              : 'text-muted-foreground'
          }`}
        >
          {subtitle}
        </div>
      </div>
      {connecting ? (
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      ) : needsAction ? (
        <button
          type="button"
          onClick={onConnect}
          className="text-xs font-black px-3 py-1.5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
        >
          {connection ? 'Reconnect' : 'Connect'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onDisconnect}
          className="text-xs font-bold px-3 py-1.5 rounded-full bg-muted text-muted-foreground hover:bg-accent transition-colors"
        >
          Disconnect
        </button>
      )}
    </div>
  );
}

function ImportTagRow({
  connections,
  onChanged,
}: {
  connections: CalendarConnectionInfo[];
  onChanged: () => void;
}) {
  const { data } = useSWR<{ tags?: { id: string; name: string }[] }>(
    '/api/tags',
    fetcher,
  );
  const tags = data?.tags ?? [];
  const current = connections.find((c) => c.settings?.importTagId)?.settings
    ?.importTagId;

  const apply = useCallback(
    async (tagId: string) => {
      await Promise.all(
        connections.map((c) =>
          fetch('/api/calendar/connections', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: c.provider,
              importTagId: tagId || null,
            }),
          }),
        ),
      );
      onChanged();
    },
    [connections, onChanged],
  );

  if (connections.length === 0 || tags.length === 0) return null;

  return (
    <div className="w-full flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold">Tag imported events</div>
        <div className="text-[11px] font-semibold text-muted-foreground">
          Applied to new tasks from your calendar
        </div>
      </div>
      <select
        value={current ?? ''}
        onChange={(e) => void apply(e.target.value)}
        className="text-xs font-bold rounded-lg border border-border bg-background px-2 py-1.5 max-w-[130px]"
        aria-label="Tag for imported events"
      >
        <option value="">No tag</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function CalendarSyncSection() {
  const { connections, mutate, isLoading } = useConnections();
  const { user } = useAuth();
  const { data: userData } = useSWR<{ calendarSyncEnabled?: boolean }>(
    user ? '/api/user' : null,
    fetcher,
  );
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    setConnectingProvider(null);
  }, []);

  const startPolling = useCallback(
    (provider: 'google' | 'apple') => {
      setConnectingProvider(provider);
      let ticks = 0;
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(async () => {
        ticks++;
        const fresh = await mutate();
        const conn = fresh?.connections?.find(
          (c) => c.provider === provider && c.status === 'active',
        );
        if (conn || ticks > 60) {
          stopPolling();
          if (conn) window.dispatchEvent(new Event('board-refresh'));
        }
      }, 2000);
    },
    [mutate, stopPolling],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  const google = connections.find((c) => c.provider === 'google');
  const apple = connections.find((c) => c.provider === 'apple');
  const [appleSheetOpen, setAppleSheetOpen] = useState(false);

  const connectGoogle = useCallback(() => {
    void openGoogleCalendarConnect();
    startPolling('google');
  }, [startPolling]);

  const disconnect = useCallback(
    async (provider: 'google' | 'apple') => {
      await fetch(`/api/calendar/connections/${provider}`, { method: 'DELETE' });
      await mutate();
    },
    [mutate],
  );

  if (isLoading) return null;

  return (
    <>
      <ProviderRow
        icon={<Icon name="googleCalendar" label="Google Calendar" className="w-7 h-7" />}
        label="Google Calendar"
        connection={google}
        connecting={connectingProvider === 'google'}
        onConnect={connectGoogle}
        onDisconnect={() => disconnect('google')}
        subtitleOverride={
          !google && userData?.calendarSyncEnabled
            ? 'Sync got an upgrade — reconnect'
            : undefined
        }
      />
      <ProviderRow
        icon={<Calendar className="w-6 h-6 text-red-500" aria-label="Apple Calendar" />}
        label="Apple Calendar"
        connection={apple}
        connecting={connectingProvider === 'apple'}
        onConnect={() => setAppleSheetOpen(true)}
        onDisconnect={() => disconnect('apple')}
      />
      <ImportTagRow
        connections={connections.filter((c) => c.status === 'active')}
        onChanged={() => void mutate()}
      />
      <AppleCalendarSheet
        open={appleSheetOpen}
        onOpenChange={setAppleSheetOpen}
        onConnected={() => {
          void mutate();
          window.dispatchEvent(new Event('board-refresh'));
        }}
      />
    </>
  );
}
