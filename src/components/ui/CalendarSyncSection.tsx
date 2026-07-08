'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR from 'swr';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { Switch } from '@/components/ui/switch';
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

export function useCalendarConnections() {
  const { user } = useAuth();
  const { data, mutate, isLoading } = useSWR<{
    connections: CalendarConnectionInfo[];
  }>(user ? '/api/calendar/connections' : null, fetcher, {
    revalidateOnFocus: false,
  });
  return { connections: data?.connections ?? [], mutate, isLoading };
}

export async function openGoogleCalendarConnect(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      // Google blocks OAuth consent inside embedded webviews — use the system
      // browser with a signed state token; the app polls connection status.
      const res = await fetch('/api/calendar/google/connect-token', { method: 'POST' });
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
      await Browser.open({
        url: `${window.location.origin}/api/calendar/google/connect?t=${encodeURIComponent(data.token)}`,
      });
      return { ok: true };
    }
    const popup = window.open(
      '/api/calendar/google/connect',
      'gcal-connect',
      'width=520,height=680,menubar=no,toolbar=no',
    );
    if (!popup) {
      return { ok: false, reason: 'Popup blocked — allow popups for this site.' };
    }
    return { ok: true };
  } catch (err) {
    console.error('google connect open failed:', (err as Error)?.message);
    return { ok: false, reason: 'Could not open the Google sign-in. Update the app and try again.' };
  }
}

function timeAgo(iso?: string | null) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 90_000) return 'just now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function StatusPill({ status }: { status?: CalendarConnectionInfo['status'] }) {
  if (!status) return null;
  const styles =
    status === 'active'
      ? 'bg-emerald-500/12 text-emerald-600'
      : status === 'reauth_required'
        ? 'bg-amber-500/15 text-amber-600'
        : 'bg-red-500/12 text-red-500';
  const label =
    status === 'active' ? 'Connected' : status === 'reauth_required' ? 'Reconnect' : 'Issue';
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${styles}`}
    >
      {label}
    </span>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight">{label}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground leading-snug">
          {hint}
        </p>
      </div>
      {children}
    </div>
  );
}

function ConfirmDisconnect({
  providerLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  providerLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/50 backdrop-blur-sm px-5"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-label={`Disconnect ${providerLabel}`}
        className="w-full max-w-sm rounded-3xl bg-card border border-border/60 px-6 pt-6 pb-5 shadow-xl"
      >
        <p className="text-base font-black tracking-tight">
          Disconnect {providerLabel}?
        </p>
        <p className="mt-2 text-[13px] font-semibold text-muted-foreground leading-relaxed">
          Syncing stops, but nothing is deleted — tasks stay in Frogress and
          events stay in your calendar. You can reconnect anytime.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl bg-muted py-3 text-sm font-black transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-red-500 py-3 text-sm font-black text-white transition-colors hover:bg-red-600 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Disconnect
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TagSelect({
  connection,
  onPatch,
}: {
  connection: CalendarConnectionInfo;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const { data } = useSWR<{ tags?: { id: string; name: string }[] }>('/api/tags', fetcher, {
    revalidateOnFocus: false,
  });
  const tags = data?.tags ?? [];
  if (tags.length === 0) return null;
  return (
    <SettingRow label="Tag imported events" hint="Added to new tasks from this calendar">
      <select
        value={connection.settings?.importTagId ?? ''}
        onChange={(e) => void onPatch({ importTagId: e.target.value || null })}
        className="max-w-[120px] shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-bold"
        aria-label="Tag for imported events"
      >
        <option value="">No tag</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </SettingRow>
  );
}

function ProviderCard({
  provider,
  label,
  icon,
  description,
  connection,
  connecting,
  onConnect,
  onChanged,
}: {
  provider: 'google' | 'apple';
  label: string;
  icon: React.ReactNode;
  description: string;
  connection?: CalendarConnectionInfo;
  connecting: boolean;
  onConnect: () => void;
  onChanged: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      await fetch('/api/calendar/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, ...body }),
      });
      onChanged();
    },
    [provider, onChanged],
  );

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(`/api/calendar/connections/${provider}`, { method: 'DELETE' });
      setConfirmOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }, [provider, onChanged]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch('/api/calendar/sync-now', { method: 'POST' });
      window.dispatchEvent(new Event('board-refresh'));
      onChanged();
    } finally {
      setSyncing(false);
    }
  }, [onChanged]);

  const connected = connection?.status === 'active';
  const needsReauth =
    connection?.status === 'reauth_required' || connection?.status === 'error';
  const lastSynced = timeAgo(connection?.lastSyncedAt);
  const metaLine = connected
    ? [
        provider === 'apple'
          ? connection?.calendarDisplayName
          : connection?.calendarDisplayName || 'Primary calendar',
        lastSynced ? `Synced ${lastSynced}` : 'Syncing…',
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <div className="rounded-2xl bg-card border border-border/50 overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted/60">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black tracking-tight leading-tight">{label}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground leading-snug line-clamp-2">
            {metaLine ?? description}
          </p>
        </div>
        {connected && (
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing}
            aria-label={`Sync ${label} now`}
            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        )}
        <StatusPill status={connection?.status} />
      </div>

      {needsReauth && (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-[11px] font-semibold leading-snug text-amber-700 dark:text-amber-400">
            {provider === 'google'
              ? 'Frogress lost access to this calendar. Reconnect to resume syncing.'
              : 'Sign-in expired. Reconnect with a new app-specific password.'}
          </p>
        </div>
      )}

      {!connection || needsReauth ? (
        <div className="px-4 pb-4">
          <button
            type="button"
            disabled={connecting}
            onClick={onConnect}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
          >
            {connecting && <Loader2 className="h-4 w-4 animate-spin" />}
            {connecting ? 'Waiting for Google…' : connection ? 'Reconnect' : 'Connect'}
          </button>
          {connection && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="mt-2 w-full rounded-2xl py-2 text-xs font-bold text-red-500 transition-colors hover:bg-red-500/10"
            >
              Disconnect
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border/50 border-t border-border/50">
          <SettingRow label="Import events" hint="Calendar events show up as tasks">
            <Switch
              checked={connection.settings?.importEnabled !== false}
              onCheckedChange={(v) => void patch({ importEnabled: v })}
              className="data-[state=checked]:bg-emerald-500"
              aria-label={`Import events from ${label}`}
            />
          </SettingRow>
          <SettingRow label="Export tasks" hint="Your tasks appear in this calendar">
            <Switch
              checked={connection.settings?.exportEnabled !== false}
              onCheckedChange={(v) => void patch({ exportEnabled: v })}
              className="data-[state=checked]:bg-emerald-500"
              aria-label={`Export tasks to ${label}`}
            />
          </SettingRow>
          <TagSelect connection={connection} onPatch={patch} />
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="w-full px-4 py-3 text-left text-sm font-bold text-red-500 transition-colors hover:bg-red-500/5"
          >
            Disconnect
          </button>
        </div>
      )}

      {confirmOpen && (
        <ConfirmDisconnect
          providerLabel={label}
          busy={busy}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void disconnect()}
        />
      )}
    </div>
  );
}

export default function IntegrationsPanel() {
  const { connections, mutate, isLoading } = useCalendarConnections();
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [appleSheetOpen, setAppleSheetOpen] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    setConnectingGoogle(false);
  }, []);

  const connectGoogle = useCallback(async () => {
    setConnectError(null);
    setConnectingGoogle(true);
    const opened = await openGoogleCalendarConnect();
    if (!opened.ok) {
      setConnectingGoogle(false);
      setConnectError(opened.reason);
      return;
    }
    let ticks = 0;
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      ticks++;
      const fresh = await mutate();
      const active = fresh?.connections?.find(
        (c) => c.provider === 'google' && c.status === 'active',
      );
      if (active || ticks > 60) {
        stopPolling();
        if (active) window.dispatchEvent(new Event('board-refresh'));
        else setConnectError('Connection didn’t complete. Try again.');
      }
    }, 2000);
  }, [mutate, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const google = connections.find((c) => c.provider === 'google');
  const apple = connections.find((c) => c.provider === 'apple');

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProviderCard
        provider="google"
        label="Google Calendar"
        icon={<Icon name="googleCalendar" label="Google Calendar" className="h-7 w-7" />}
        description="Two-way sync between your events and tasks"
        connection={google}
        connecting={connectingGoogle}
        onConnect={() => void connectGoogle()}
        onChanged={() => void mutate()}
      />
      {connectError && (
        <p className="px-1 text-xs font-bold text-red-500">{connectError}</p>
      )}
      <ProviderCard
        provider="apple"
        label="Apple Calendar"
        icon={<Icon name="appleCalendar" label="Apple Calendar" className="h-7 w-7" />}
        description="Sync with iCloud Calendar on all your devices"
        connection={apple}
        connecting={false}
        onConnect={() => setAppleSheetOpen(true)}
        onChanged={() => void mutate()}
      />

      <p className="px-1 text-[11px] font-semibold leading-relaxed text-muted-foreground">
        Sync runs automatically in the background. If a task and an event are
        edited at the same time, your changes in Frogress always win.
      </p>

      <AppleCalendarSheet
        open={appleSheetOpen}
        onOpenChange={setAppleSheetOpen}
        onConnected={() => {
          void mutate();
          window.dispatchEvent(new Event('board-refresh'));
        }}
      />
    </div>
  );
}
