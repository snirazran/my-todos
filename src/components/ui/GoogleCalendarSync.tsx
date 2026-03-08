'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Loader2, CalendarRange, Check, AlertCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/components/auth/AuthContext';

type SyncState = 'idle' | 'loading' | 'success' | 'error';

export default function GoogleCalendarSync({
  variant = 'desktop',
}: {
  variant?: 'desktop' | 'mobile';
}) {
  const { user: authUser } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<SyncState>('idle');
  const [message, setMessage] = useState('');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const hasSyncedOnMount = useRef(false);
  const isToggling = useRef(false);

  // Fetch current sync status on mount
  useEffect(() => {
    if (!authUser) return;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/user');
        if (res.ok) {
          const data = await res.json();
          setEnabled(data.calendarSyncEnabled || false);
        }
      } catch (err) {
        console.error('Failed to fetch calendar status:', err);
      } finally {
        setIsInitialLoad(false);
      }
    };
    fetchStatus();
  }, [authUser]);

  const triggerSync = useCallback(async (token?: string) => {
    setState('loading');
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
      
      if (!res.ok) {
        throw new Error(data.error || `Sync failed (${res.status})`);
      }

      if (data.created === 0 && data.skipped > 0) {
        setMessage('Up to date');
      } else if (data.created === 0 && data.deleted === 0) {
        setMessage('No new events');
      } else {
        setMessage(`${data.created} added, ${data.deleted} removed`);
      }

      setState('success');
      window.dispatchEvent(new Event('board-refresh'));
      setTimeout(() => {
        setState('idle');
        setMessage('');
      }, 4000);
    } catch (err: any) {
      console.error('Sync error:', err);
      setMessage(err.message || 'Connection error');
      setState('error');
      setTimeout(() => { setState('idle'); setMessage(''); }, 5000);
    }
    return 'DONE';
  }, []);

  const handleReauthAndSync = useCallback(async () => {
    setState('loading');
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
      await triggerSync(credential.accessToken);
    } catch (err: any) {
      console.error('Re-auth failed:', err);
      setState('error');
      setMessage('Login failed');
      setTimeout(() => { setState('idle'); setMessage(''); }, 3000);
    }
  }, [triggerSync]);

  // Auto-sync on mount ONLY (prevent triggering on manual toggle)
  useEffect(() => {
    if (!isInitialLoad && enabled && !hasSyncedOnMount.current && !isToggling.current) {
      hasSyncedOnMount.current = true;
      const autoSync = async () => {
        const result = await triggerSync();
        if (result === 'REAUTH_NEEDED') {
          setState('error');
          setMessage('Reconnect required');
        }
      };
      autoSync();
    }
  }, [isInitialLoad, enabled, triggerSync]);

  const handleToggle = async (checked: boolean) => {
    isToggling.current = true;
    setEnabled(checked);
    
    if (checked) {
      const result = await triggerSync();
      if (result === 'REAUTH_NEEDED' || result === 'NOT_CONNECTED') {
        await handleReauthAndSync();
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
      setMessage('');
      setState('idle');
    }
    
    // Allow auto-sync again after some time or next mount
    setTimeout(() => { isToggling.current = false; }, 1000);
  };

  const statusLabel = state === 'loading' ? 'Syncing now...' : message || (enabled ? 'Connected' : 'Not connected');

  return (
    <div className={`
      w-full overflow-hidden transition-all duration-300 rounded-2xl border-2
      ${enabled 
        ? 'bg-blue-50/50 dark:bg-blue-500/5 border-blue-200/50 dark:border-blue-500/20 shadow-sm' 
        : 'bg-muted/30 border-border/50 opacity-80 hover:opacity-100'}
    `}>
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className={`
            flex-shrink-0 p-2 rounded-xl shadow-sm border transition-all duration-300
            ${enabled 
              ? 'bg-blue-500 border-blue-400 text-white' 
              : 'bg-muted border-border text-muted-foreground'}
            ${state === 'error' ? 'bg-red-500 border-red-400 text-white' : ''}
          `}>
            {state === 'loading' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : state === 'error' ? (
              <AlertCircle className="h-5 w-5" />
            ) : (
              <CalendarRange className="h-5 w-5" />
            )}
          </div>
          
          <div className="flex-1 min-w-0 py-0.5">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground/80 leading-none mb-1">
              Google Calendar
            </h3>
            <div className="flex items-center gap-1.5 min-w-0">
              {state === 'success' && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
              <p className={`
                text-[10px] font-bold truncate transition-colors duration-300
                ${state === 'error' ? 'text-red-500' : enabled ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}
              `}>
                {statusLabel}
              </p>
            </div>
          </div>

          <div className="pt-1">
            <Switch 
              checked={enabled} 
              onCheckedChange={handleToggle}
              className="data-[state=checked]:bg-blue-500"
            />
          </div>
        </div>
      </div>
      
      {enabled && (
        <div className="bg-blue-100/30 dark:bg-blue-500/10 px-3 py-1.5 border-t border-blue-200/30 dark:border-blue-500/10">
          <p className="text-[9px] font-medium text-blue-600/80 dark:text-blue-400/80 flex items-center justify-between">
            <span>Automated event sync</span>
            <span className={`w-1.5 h-1.5 rounded-full ${state === 'loading' ? 'bg-amber-500 animate-bounce' : 'bg-blue-500 animate-pulse'}`} />
          </p>
        </div>
      )}
    </div>
  );
}
