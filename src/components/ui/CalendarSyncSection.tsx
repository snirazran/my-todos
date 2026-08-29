'use client';

import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR from 'swr';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { Switch } from '@/components/ui/switch';
import AppleCalendarSheet from '@/components/ui/AppleCalendarSheet';
import AiConnectionsSection from '@/components/ui/AiConnectionsSection';
import {
  useCalendarConnections,
  useGoogleConnectFlow,
  type CalendarConnectionInfo,
} from '@/hooks/useCalendarSync';

export {
  useCalendarConnections,
  openGoogleCalendarConnect,
  type CalendarConnectionInfo,
} from '@/hooks/useCalendarSync';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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

const STATUS_PILL: Record<
  CalendarConnectionInfo['status'],
  { label: string; className: string }
> = {
  active: { label: 'Connected', className: 'bg-emerald-500/12 text-emerald-600' },
  error: { label: 'Retrying', className: 'bg-amber-500/15 text-amber-600' },
  paused: { label: 'Paused', className: 'bg-amber-500/15 text-amber-600' },
  reauth_required: { label: 'Reconnect', className: 'bg-red-500/12 text-red-500' },
  disconnected: { label: 'Disconnected', className: 'bg-red-500/12 text-red-500' },
};

function StatusPill({ status }: { status?: CalendarConnectionInfo['status'] }) {
  if (!status) return null;
  const { label, className: styles } = STATUS_PILL[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-black ${styles}`}
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

function statusNotice(
  provider: 'google' | 'apple',
  connection?: CalendarConnectionInfo,
): string | null {
  switch (connection?.status) {
    case 'error':
      return 'Syncing hit a snag and is retrying on its own. Nothing to do — we’ll keep trying.';
    case 'paused':
      return connection.pausedReason === 'calendar-unavailable'
        ? 'That calendar is no longer reachable, so syncing is paused. Resume once it’s back, or reconnect.'
        : 'Syncing kept failing, so it’s paused for now. Resume to try again.';
    case 'reauth_required':
      return provider === 'google'
        ? 'Frogress lost access to this calendar. Reconnect to resume syncing.'
        : 'Sign-in expired. Reconnect with a new app-specific password.';
    case 'disconnected':
      return 'Syncing was turned off after two weeks of failures. Your tasks and events are untouched — reconnect to start again.';
    default:
      return null;
  }
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

  const resume = useCallback(async () => {
    setSyncing(true);
    try {
      await patch({ resume: true });
      await fetch('/api/calendar/sync-now', { method: 'POST' });
      window.dispatchEvent(new Event('board-refresh'));
      onChanged();
    } finally {
      setSyncing(false);
    }
  }, [patch, onChanged]);

  const status = connection?.status;
  const connected = status === 'active' || status === 'error';
  const paused = status === 'paused';
  const needsReauth = status === 'reauth_required' || status === 'disconnected';
  const notice = statusNotice(provider, connection);
  const lastSynced = timeAgo(connection?.lastSyncedAt);
  const metaLine = connected
    ? [
        provider === 'apple'
          ? 'All iCloud calendars'
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

      {notice && (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-[11px] font-semibold leading-snug text-amber-700 dark:text-amber-400">
            {notice}
          </p>
        </div>
      )}

      {!connection || needsReauth || paused ? (
        <div className="px-4 pb-4">
          {paused ? (
            <button
              type="button"
              disabled={syncing}
              onClick={() => void resume()}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
            >
              {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
              Resume syncing
            </button>
          ) : (
            <button
              type="button"
              disabled={connecting}
              onClick={onConnect}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
            >
              {connecting && <Loader2 className="h-4 w-4 animate-spin" />}
              {connecting ? 'Waiting for Google…' : connection ? 'Reconnect' : 'Connect'}
            </button>
          )}
          {connection && (
            <>
              {paused && (
                <button
                  type="button"
                  disabled={connecting}
                  onClick={onConnect}
                  className="mt-2 w-full rounded-2xl bg-muted py-2.5 text-xs font-black transition-colors hover:bg-accent disabled:opacity-60"
                >
                  Reconnect instead
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="mt-2 w-full rounded-2xl py-2 text-xs font-bold text-red-500 transition-colors hover:bg-red-500/10"
              >
                Disconnect
              </button>
            </>
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
  const { connections, available, mutate, isLoading } = useCalendarConnections();
  const [appleSheetOpen, setAppleSheetOpen] = useState(false);
  const {
    connecting: connectingGoogle,
    error: connectError,
    connect: connectGoogle,
  } = useGoogleConnectFlow({ mutate });

  const google = connections.find((c) => c.provider === 'google');
  const apple = connections.find((c) => c.provider === 'apple');

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // A provider the server cannot serve is hidden rather than offered — its
  // connect button would only 503. An existing connection always stays visible.
  const showGoogle = available?.google !== false || !!google;
  const showApple = available?.apple !== false || !!apple;

  return (
    <div className="space-y-4">
      {showGoogle && (
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
      )}
      {connectError && (
        <p className="px-1 text-xs font-bold text-red-500">{connectError}</p>
      )}
      {showApple && (
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
      )}

      <p className="px-1 text-[11px] font-semibold leading-relaxed text-muted-foreground">
        Sync runs automatically in the background. If a task and an event are
        edited at the same time, your changes in Frogress always win.
      </p>

      <AiConnectionsSection />

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
