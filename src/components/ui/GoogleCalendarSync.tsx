'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
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

/**
 * GlobalCalendarSync — renders nothing visible.
 * Mount once in providers.tsx to auto-sync on every page load when enabled.
 */
export function GlobalCalendarSync() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const hasSynced = useRef(false);

  const doSyncGlobal = useCallback(async (token?: string) => {
    if (syncInFlight) return 'DONE' as const;
    syncInFlight = true;
    try {
      const syncRes = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: token,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const syncData = await syncRes.json().catch(() => ({}));
      syncInFlight = false;

      if (syncRes.status === 401) return 'REAUTH_NEEDED' as const;
      if (syncRes.status === 400 && syncData.error?.includes('not connected')) return 'NOT_CONNECTED' as const;
      if (!syncRes.ok) return 'DONE' as const;

      if (syncData.created > 0) {
        showNotification(
          <div className="flex items-center gap-3 pr-2">
            <Icon name="googleCalendar" label="Google Calendar" className="w-7 h-7 shrink-0" />
            <div className="flex flex-col leading-none">
              <span className="font-black text-base">
                {syncData.created} event{syncData.created > 1 ? 's' : ''} synced
              </span>
              <span className="text-[10px] text-muted-foreground font-bold mt-0.5 uppercase tracking-wider">
                Google Calendar
              </span>
            </div>
          </div>,
        );
      }

      window.dispatchEvent(new Event('board-refresh'));
    } catch {
      syncInFlight = false;
    }
    return 'DONE' as const;
  }, [showNotification]);

  const handleReauthGlobal = useCallback(async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) throw new Error('No access token');

      await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarSyncEnabled: true,
          calendarAccessToken: credential.accessToken,
        }),
      });
      _cachedEnabled = true;
      window.dispatchEvent(new Event('gcal-status-change'));
      await doSyncGlobal(credential.accessToken);
    } catch {
      // silent
    }
  }, [doSyncGlobal]);

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
        await doSyncGlobal();
      } catch {
        // silent
      }
    })();
  }, [user, doSyncGlobal]);

  // Listen for manual sync trigger from quick tile
  useEffect(() => {
    const trigger = async () => {
      if (!user) return;
      const result = await doSyncGlobal();
      if (result === 'REAUTH_NEEDED' || result === 'NOT_CONNECTED') {
        await handleReauthGlobal();
      } else {
        await fetch('/api/user', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calendarSyncEnabled: true }),
        });
        _cachedEnabled = true;
        window.dispatchEvent(new Event('gcal-status-change'));
      }
    };
    window.addEventListener('gcal-sync-trigger', trigger);
    return () => window.removeEventListener('gcal-sync-trigger', trigger);
  }, [user, doSyncGlobal, handleReauthGlobal]);

  return null;
}

/**
 * GoogleCalendarSync — compact toggle for the settings menu.
 * Shown on all pages. Only handles enable/disable + re-auth.
 */
export default function GoogleCalendarSync() {
  const { user: authUser } = useAuth();
  const { showNotification } = useNotification();
  const [enabled, setEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Fetch current sync status on mount
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

  const doSync = useCallback(async (token?: string) => {
    if (syncInFlight) return 'DONE';
    syncInFlight = true;
    setSyncing(true);
    try {
      const res = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: token,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return 'REAUTH_NEEDED';
      if (res.status === 400 && data.error?.includes('not connected')) return 'NOT_CONNECTED';
      if (!res.ok) return 'DONE';

      if (data.created > 0) {
        showNotification(
          <div className="flex items-center gap-3 pr-2">
            <Icon name="googleCalendar" label="Google Calendar" className="w-7 h-7 shrink-0" />
            <div className="flex flex-col leading-none">
              <span className="font-black text-base">
                {data.created} event{data.created > 1 ? 's' : ''} synced
              </span>
              <span className="text-[10px] text-muted-foreground font-bold mt-0.5 uppercase tracking-wider">
                Google Calendar
              </span>
            </div>
          </div>,
        );
      }

      window.dispatchEvent(new Event('board-refresh'));
    } catch {
      // silent
    } finally {
      syncInFlight = false;
      setSyncing(false);
    }
    return 'DONE';
  }, [showNotification]);

  const handleReauth = useCallback(async () => {
    setSyncing(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) throw new Error('No access token');

      await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarSyncEnabled: true,
          calendarAccessToken: credential.accessToken,
        }),
      });
      await doSync(credential.accessToken);
    } catch {
      setSyncing(false);
    }
  }, [doSync]);

  const handleToggle = useCallback(async (checked: boolean) => {
    setEnabled(checked);
    _cachedEnabled = checked;
    window.dispatchEvent(new Event('gcal-status-change'));

    if (checked) {
      const result = await doSync();
      if (result === 'REAUTH_NEEDED' || result === 'NOT_CONNECTED') {
        await handleReauth();
      } else {
        await fetch('/api/user', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calendarSyncEnabled: true }),
        });
      }
    } else {
      await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarSyncEnabled: false }),
      });
    }
  }, [doSync, handleReauth]);

  if (!loaded) return null;

  return (
    <button
      onClick={() => handleToggle(!enabled)}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/50"
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
    </button>
  );
}
