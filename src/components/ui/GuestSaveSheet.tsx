'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { Check, Loader2 } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { create } from 'zustand';
import { useAuth } from '@/components/auth/AuthContext';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Frog from '@/components/ui/frog';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { StreakFlame } from '@/components/ui/TaskAdornments';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { AppleIcon } from '@/components/ui/AppleIcon';
import { useNudge } from '@/hooks/useNudge';
import { useInventory } from '@/hooks/useInventory';
import { useLoginStreak } from '@/hooks/useLoginStreak';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { hapticSuccess } from '@/lib/haptics';
import {
  GUEST_UPGRADE_PATH,
  guestLinkErrorMessage,
  isExistingAccountError,
  linkGuestAccountWith,
  type GuestLinkProvider,
} from '@/lib/guestLink';
import { cn } from '@/lib/utils';

export type GuestSaveSource = 'banner' | 'auto';

const AUTO_PATHS = ['/wardrobe', '/shop', '/quests', '/friends'];
const SAVED_HOLD_MS = 1400;
const MIN_GUEST_AGE_MS = 8 * 3600_000;

const useGuestSaveStore = create<{
  open: boolean;
  source: GuestSaveSource;
  saved: boolean;
}>(() => ({ open: false, source: 'banner', saved: false }));

export function openGuestSave(source: GuestSaveSource) {
  useGuestSaveStore.setState({ open: true, source });
}

export function useGuestSaved() {
  return useGuestSaveStore((s) => s.saved);
}

function localDay(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function cameBackLater(creationTime: string | undefined) {
  if (!creationTime) return false;
  const created = new Date(creationTime);
  if (Number.isNaN(created.getTime())) return false;
  return (
    Date.now() - created.getTime() >= MIN_GUEST_AGE_MS &&
    localDay(created) !== localDay(new Date())
  );
}

export function GuestSaveHost() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { open, source, saved } = useGuestSaveStore();
  const guest = !loading && !!user?.isAnonymous && !saved;
  const returning = guest && cameBackLater(user?.metadata.creationTime);
  const nudge = useNudge('guest_save', {
    enabled: returning && AUTO_PATHS.includes(pathname ?? ''),
    delayMs: 900,
  });

  useEffect(() => {
    if (nudge.show) openGuestSave('auto');
  }, [nudge.show]);

  const close = (outcome: 'dismissed' | 'engaged' | 'saved') => {
    useGuestSaveStore.setState(outcome === 'saved' ? { open: false, saved: true } : { open: false });
    if (source !== 'auto') return;
    if (outcome === 'dismissed') nudge.dismiss();
    else nudge.engage();
  };

  return <GuestSaveSheet open={open} source={source} onClose={close} />;
}

function GuestSaveSheet({
  open,
  source,
  onClose,
}: {
  open: boolean;
  source: GuestSaveSource;
  onClose: (outcome: 'dismissed' | 'engaged' | 'saved') => void;
}) {
  const { data: inventory } = useInventory(open, true);
  const { data: profile } = useSWR<{ frogName?: string | null }>(
    open ? '/api/user' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const { view: streak } = useLoginStreak(open);
  const { indices } = useWardrobeIndices(open);
  const [pending, setPending] = useState<GuestLinkProvider | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleFirst, setAppleFirst] = useState(false);
  const holdRef = useRef<number | null>(null);

  const frogName = profile?.frogName?.trim() || null;
  const flies = inventory?.wardrobe?.flies ?? 0;
  const streakDays = streak?.alive ? streak.count : 0;
  const busy = pending !== null || saved;

  useEffect(() => {
    setAppleFirst(Capacitor.getPlatform() === 'ios');
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    trackAnalyticsEvent('guest_save_prompt', { source, action: 'shown' });
  }, [open, source]);

  useEffect(
    () => () => {
      if (holdRef.current !== null) window.clearTimeout(holdRef.current);
    },
    [],
  );

  const save = async (provider: GuestLinkProvider) => {
    if (busy) return;
    setPending(provider);
    setError(null);
    try {
      await linkGuestAccountWith(provider);
      trackAnalyticsEvent('guest_save_prompt', { source, action: 'linked', provider });
      setSaved(true);
      hapticSuccess();
      void mutate(() => true);
      holdRef.current = window.setTimeout(() => onClose('saved'), SAVED_HOLD_MS);
    } catch (err) {
      if (isExistingAccountError(err)) {
        trackAnalyticsEvent('guest_save_prompt', { source, action: 'existing_account', provider });
        onClose('engaged');
        window.location.assign(GUEST_UPGRADE_PATH);
        return;
      }
      trackAnalyticsEvent('guest_save_prompt', { source, action: 'failed', provider });
      setError(guestLinkErrorMessage(provider, err));
    } finally {
      setPending(null);
    }
  };

  const saveWithEmail = () => {
    trackAnalyticsEvent('guest_save_prompt', { source, action: 'email' });
    onClose('engaged');
    window.location.assign(GUEST_UPGRADE_PATH);
  };

  const notNow = () => {
    if (busy) return;
    trackAnalyticsEvent('guest_save_prompt', { source, action: 'dismissed' });
    onClose('dismissed');
  };

  const google = (primary: boolean) => (
    <SaveButton
      key="google"
      primary={primary}
      onClick={() => void save('google')}
      disabled={busy}
      loading={pending === 'google'}
    >
      <GoogleIcon className="h-[18px] w-[18px] shrink-0" /> Continue with Google
    </SaveButton>
  );
  const apple = (primary: boolean) => (
    <SaveButton
      key="apple"
      primary={primary}
      onClick={() => void save('apple')}
      disabled={busy}
      loading={pending === 'apple'}
    >
      <AppleIcon className="h-[18px] w-[18px] shrink-0" /> Continue with Apple
    </SaveButton>
  );

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && notNow()}
      closeAriaLabel="Not now"
      className="sm:max-w-md"
    >
      {({ entered, bindScroll }) => (
        <div
          ref={bindScroll}
          className="flex max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] flex-col overflow-y-auto overscroll-contain px-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-8 text-center sm:max-h-[calc(100dvh-3rem)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(56,189,248,0.16)_0%,transparent_70%)] dark:bg-[radial-gradient(120%_90%_at_50%_0%,rgba(56,189,248,0.12)_0%,transparent_70%)]"
          />
          <div className="relative mx-auto h-[104px] w-56">
            {entered && (
              <div className="absolute inset-x-0 bottom-0 flex justify-center">
                <Frog width={210} height={188} indices={indices} arrive="pop" />
              </div>
            )}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={saved ? 'saved' : 'unsaved'}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                className={cn(
                  'absolute bottom-[58px] right-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-black shadow-[0_2px_6px_-2px_rgba(15,23,42,0.25)]',
                  saved
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
                )}
              >
                {saved ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                ) : (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inset-0 rounded-full bg-amber-500 motion-safe:animate-ping" />
                    <span className="relative h-2 w-2 rounded-full bg-amber-500" />
                  </span>
                )}
                {saved ? 'Saved' : 'Not saved'}
              </motion.span>
            </AnimatePresence>
          </div>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground">
            {saved
              ? `${frogName ?? 'Your frog'} is safe`
              : `Keep ${frogName ?? 'your frog'} safe`}
          </h2>
          <p className="mx-auto mt-1.5 max-w-[19rem] text-[15px] font-medium leading-snug text-muted-foreground">
            {saved
              ? 'Sign in on any phone and pick up right where you left off.'
              : `${frogName ?? 'Your frog'} only lives on this device. Delete the app or switch phones, and ${frogName ? `${frogName} is` : 'it’s'} gone.`}
          </p>

          {(streakDays > 0 || flies > 0) && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {streakDays > 0 && (
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-orange-500/10 px-3 text-[13px] font-black text-orange-600 dark:text-orange-400">
                  <StreakFlame />
                  {streakDays}-day streak
                </span>
              )}
              {flies > 0 && (
                <span className="inline-flex h-8 items-center rounded-full bg-emerald-500/10 px-3 text-[13px] font-black text-emerald-700 dark:text-emerald-300">
                  <FlyAmount amount={`${flies} ${flies === 1 ? 'fly' : 'flies'}`} size={16} />
                </span>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2.5">
            {appleFirst ? [apple(true), google(false)] : [google(true), apple(false)]}
          </div>

          {error && (
            <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] font-black text-destructive">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={saveWithEmail}
            disabled={busy}
            className="mx-auto mt-3 h-9 px-3 text-[14px] font-bold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-60"
          >
            Save with email instead
          </button>
          <button
            type="button"
            onClick={notNow}
            disabled={busy}
            className="h-11 w-full rounded-2xl text-base font-black tracking-tight text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
          >
            Not now
          </button>
        </div>
      )}
    </BaseSheet>
  );
}

function SaveButton({
  children,
  onClick,
  disabled,
  loading,
  primary,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  primary: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl text-[16px] font-black transition-[transform,box-shadow,opacity] [-webkit-tap-highlight-color:transparent] active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60',
        primary
          ? 'bg-foreground text-background shadow-[0_3px_0_0_rgba(0,0,0,0.35)] dark:shadow-[0_3px_0_0_rgba(255,255,255,0.25)]'
          : 'bg-card text-foreground shadow-[0_3px_0_0_hsl(var(--border))] ring-1 ring-border',
      )}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}
