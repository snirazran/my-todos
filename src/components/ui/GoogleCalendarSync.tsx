'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/components/auth/AuthContext';
import { useNotification } from '@/components/providers/NotificationProvider';

// Module-level lock to prevent duplicate syncs
let syncInFlight = false;

// Module-level cache for sync status so quick tiles can read it without mounting GoogleCalendarSync
let _cachedEnabled: boolean | null = null;
let _cachedLoaded = false;

export function getCalendarSyncStatus() {
  return { enabled: _cachedEnabled ?? false, loaded: _cachedLoaded };
}

function goToConnect() {
  window.location.href = '/api/calendar/google/connect';
}

function currentTz() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

type SyncOutcome = 'DONE' | 'REAUTH_NEEDED' | 'NOT_CONNECTED';

async function runSync(): Promise<{
  outcome: SyncOutcome;
  created: number;
}> {
  if (syncInFlight) return { outcome: 'DONE', created: 0 };
  syncInFlight = true;
  try {
    const res = await fetch('/api/calendar/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: currentTz() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return { outcome: 'REAUTH_NEEDED', created: 0 };
    if (res.status === 400 && data.error?.includes('not connected'))
      return { outcome: 'NOT_CONNECTED', created: 0 };
    if (!res.ok) return { outcome: 'DONE', created: 0 };
    return { outcome: 'DONE', created: data.created ?? 0 };
  } catch {
    return { outcome: 'DONE', created: 0 };
  } finally {
    syncInFlight = false;
  }
}

function SyncedNotification({ created }: { created: number }) {
  return (
    <div className="flex items-center gap-3 pr-2">
      <Icon name="googleCalendar" label="Google Calendar" className="w-7 h-7 shrink-0" />
      <div className="flex flex-col leading-none">
        <span className="font-black text-base">
          {created} event{created > 1 ? 's' : ''} synced
        </span>
        <span className="text-[10px] text-muted-foreground font-bold mt-0.5 uppercase tracking-wider">
          Google Calendar
        </span>
      </div>
    </div>
  );
}

/**
 * GlobalCalendarSync — renders nothing visible.
 * Mount once in providers.tsx to auto-sync on every page load when enabled.
 */
export function GlobalCalendarSync() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const hasSynced = useRef(false);

  const doSyncGlobal = useCallback(async () => {
    const { outcome, created } = await runSync();
    if (outcome === 'DONE' && created > 0) {
      showNotification(<SyncedNotification created={created} />);
    }
    if (outcome === 'DONE') window.dispatchEvent(new Event('board-refresh'));
    return outcome;
  }, [showNotification]);

  // Handle the OAuth callback redirect (?calendar=connected|denied|error)
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get('calendar');
    if (!status) return;
    params.delete('calendar');
    const rest = params.toString();
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (rest ? `?${rest}` : ''),
    );
    if (status === 'connected') {
      _cachedEnabled = true;
      _cachedLoaded = true;
      window.dispatchEvent(new Event('gcal-status-change'));
      void doSyncGlobal();
    }
  }, [user, doSyncGlobal]);

  // Auto-sync on page load
  useEffect(() => {
    if (!user || hasSynced.current) return;
    hasSynced.current = true;

    (async () => {
      try {
        const res = await fetch('/api/user');
        if (!res.ok) return;
        const data = await res.json();
        _cachedEnabled = data.calendarSyncEnabled || false;
        _cachedLoaded = true;
        window.dispatchEvent(new Event('gcal-status-change'));
        if (!data.calendarSyncEnabled) return;
        const outcome = await doSyncGlobal();
        if (outcome === 'REAUTH_NEEDED' || outcome === 'NOT_CONNECTED') {
          _cachedEnabled = false;
          window.dispatchEvent(new Event('gcal-status-change'));
        }
      } catch {
        // silent
      }
    })();
  }, [user, doSyncGlobal]);

  // Listen for manual sync trigger from quick tile
  useEffect(() => {
    const trigger = async () => {
      if (!user) return;
      const outcome = await doSyncGlobal();
      if (outcome === 'REAUTH_NEEDED' || outcome === 'NOT_CONNECTED') {
        goToConnect();
        return;
      }
      await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarSyncEnabled: true }),
      });
      _cachedEnabled = true;
      window.dispatchEvent(new Event('gcal-status-change'));
    };
    window.addEventListener('gcal-sync-trigger', trigger);
    return () => window.removeEventListener('gcal-sync-trigger', trigger);
  }, [user, doSyncGlobal]);

  return null;
}

/**
 * GoogleCalendarSync — compact toggle for the settings menu.
 * Connect runs through the server OAuth flow; disconnect removes the app's
 * calendar from Google and imported calendar tasks from the app.
 */
export default function GoogleCalendarSync() {
  const { user: authUser } = useAuth();
  const { showNotification } = useNotification();
  const [enabled, setEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!authUser) return;
    (async () => {
      try {
        const res = await fetch('/api/user');
        if (res.ok) {
          const data = await res.json();
          const val = data.calendarSyncEnabled || false;
          setEnabled(val);
          _cachedEnabled = val;
        }
      } catch {
        // silent
      } finally {
        setLoaded(true);
        _cachedLoaded = true;
      }
    })();
  }, [authUser]);

  const handleToggle = useCallback(
    async (checked: boolean) => {
      if (syncing) return;
      setEnabled(checked);
      _cachedEnabled = checked;
      window.dispatchEvent(new Event('gcal-status-change'));

      if (checked) {
        setSyncing(true);
        const { outcome, created } = await runSync();
        if (outcome === 'REAUTH_NEEDED' || outcome === 'NOT_CONNECTED') {
          goToConnect();
          return;
        }
        await fetch('/api/user', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calendarSyncEnabled: true }),
        });
        if (created > 0) showNotification(<SyncedNotification created={created} />);
        window.dispatchEvent(new Event('board-refresh'));
        setSyncing(false);
      } else {
        setSyncing(true);
        try {
          await fetch('/api/calendar/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone: currentTz() }),
          });
          showNotification(
            <div className="flex items-center gap-3 pr-2">
              <Icon
                name="googleCalendar"
                label="Google Calendar"
                className="w-7 h-7 shrink-0"
              />
              <div className="flex flex-col leading-none">
                <span className="font-black text-base">Calendar disconnected</span>
                <span className="text-[10px] text-muted-foreground font-bold mt-0.5 uppercase tracking-wider">
                  Synced tasks and events removed
                </span>
              </div>
            </div>,
          );
          window.dispatchEvent(new Event('board-refresh'));
        } catch {
          // silent
        } finally {
          setSyncing(false);
        }
      }
    },
    [syncing, showNotification],
  );

  if (!loaded) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={enabled}
      onClick={() => handleToggle(!enabled)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggle(!enabled);
        }
      }}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/50 cursor-pointer"
    >
      <div className="h-9 w-9 flex items-center justify-center shrink-0">
        <Icon name="googleCalendar" label="Google Calendar" className="w-7 h-7" />
      </div>
      <span className="flex-1 text-sm font-bold truncate">Google Calendar sync</span>
      {syncing && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        className="data-[state=checked]:bg-blue-500 pointer-events-none"
      />
    </div>
  );
}
