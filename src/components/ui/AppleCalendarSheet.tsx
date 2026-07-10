'use client';

import { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BaseSheet, type BaseSheetRenderProps } from '@/components/ui/BaseSheet';
import { Icon } from '@/components/ui/Icon';

export default function AppleCalendarSheet({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  const [appleId, setAppleId] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setBusy(false);
    setError(null);
  }, []);

  const close = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (!next) reset();
    },
    [onOpenChange, reset],
  );

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/calendar/apple/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appleId, appPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Connection failed');
        return;
      }
      onConnected();
      close(false);
    } catch {
      setError('Could not reach the server');
    } finally {
      setBusy(false);
    }
  }, [appleId, appPassword, onConnected, close]);

  return (
    <BaseSheet
      open={open}
      onOpenChange={close}
      zIndex={1380}
      closeAriaLabel="Close Apple Calendar setup"
    >
      {({ bindScroll }: BaseSheetRenderProps) => (
        <div
          ref={bindScroll}
          className="overflow-y-auto px-5 pb-8 pt-2 max-h-[80vh] md:max-h-[70vh]"
        >
          <div className="mb-1 flex items-center gap-2.5">
            <Icon name="appleCalendar" label="Apple Calendar" className="h-8 w-8" />
            <h2 className="text-lg font-black">Apple Calendar</h2>
          </div>

          <p className="text-sm text-muted-foreground font-semibold mb-4 leading-relaxed">
            Sign in with your Apple ID and an app-specific password to sync
            with iCloud Calendar. Frogress imports events from every calendar
            you have, and creates a private &ldquo;Frogress&rdquo; calendar
            for your tasks.
          </p>
          <ol className="text-[13px] text-muted-foreground font-semibold mb-4 space-y-1.5 list-decimal pl-4 leading-relaxed">
            <li>
              Go to{' '}
              <a
                href="https://account.apple.com/account/manage"
                target="_blank"
                rel="noreferrer"
                className="text-blue-500 underline"
              >
                account.apple.com
              </a>{' '}
              → Sign-In and Security
            </li>
            <li>Choose App-Specific Passwords and create one</li>
            <li>Paste the 16-character password below</li>
          </ol>
          <label className="block text-xs font-bold mb-1" htmlFor="apple-id">
            Apple ID
          </label>
          <input
            id="apple-id"
            type="email"
            autoComplete="username"
            value={appleId}
            onChange={(e) => setAppleId(e.target.value)}
            placeholder="you@icloud.com"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base md:text-sm font-semibold mb-3 outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <label className="block text-xs font-bold mb-1" htmlFor="apple-pass">
            App-specific password
          </label>
          <input
            id="apple-pass"
            type="password"
            autoComplete="off"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            placeholder="xxxx-xxxx-xxxx-xxxx"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base md:text-sm font-semibold mb-4 outline-none focus:ring-2 focus:ring-emerald-400"
          />
          {error && <p className="text-xs font-bold text-red-500 mb-3">{error}</p>}
          <button
            type="button"
            disabled={busy || !appleId || appPassword.replace(/-/g, '').length < 16}
            onClick={connect}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Start syncing
          </button>
        </div>
      )}
    </BaseSheet>
  );
}
