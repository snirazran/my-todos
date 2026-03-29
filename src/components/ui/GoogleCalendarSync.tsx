'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Loader2, CalendarRange } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/components/auth/AuthContext';
import { useNotification } from '@/components/providers/NotificationProvider';

// Module-level lock to prevent duplicate syncs
let syncInFlight = false;

/**
 * GlobalCalendarSync — renders nothing visible.
 * Mount once in providers.tsx to auto-sync on every page load when enabled.
 */
export function GlobalCalendarSync() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (!user || hasSynced.current) return;
    hasSynced.current = true;

    (async () => {
      try {
        const res = await fetch('/api/user');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.calendarSyncEnabled) return;

        if (syncInFlight) return;
        syncInFlight = true;

        const syncRes = await fetch('/api/calendar/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });

        const syncData = await syncRes.json().catch(() => ({}));
        syncInFlight = false;

        if (!syncRes.ok) return;

        if (syncData.created > 0) {
          showNotification(
            <div className="flex items-center gap-3 pr-2">
              <CalendarRange className="w-5 h-5 text-blue-500 shrink-0" />
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
    })();
  }, [user, showNotification]);

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
          setEnabled(data.calendarSyncEnabled || false);
        }
      } catch {
        // silent
      } finally {
        setLoaded(true);
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
            <CalendarRange className="w-5 h-5 text-blue-500 shrink-0" />
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

  const handleToggle = async (checked: boolean) => {
    setEnabled(checked);

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
  };

  if (!loaded) return null;

  return (
    <button
      onClick={() => handleToggle(!enabled)}
      className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
    >
      <span className="text-[10px] uppercase font-black text-muted-foreground tracking-wider group-hover:text-foreground transition-colors">
        Calendar Sync
      </span>
      <div className="flex items-center gap-2">
        {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          className="data-[state=checked]:bg-blue-500 pointer-events-none"
        />
      </div>
    </button>
  );
}
