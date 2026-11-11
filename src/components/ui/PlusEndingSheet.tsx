'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { create } from 'zustand';
import { useAuth } from '@/components/auth/AuthContext';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { PlusSheetHero } from '@/components/ui/PlusMembershipSheet';
import { PerkLedger, PlusEarnedStrip, PlusGoldButton } from '@/components/ui/plus/PlusKit';
import { getPlusContext } from '@/lib/plusPaywall';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { whenScreenIsFree } from '@/lib/popupGate';
import {
  PLUS_STATUS_KEY,
  formatPlusDate,
  manageTarget,
  openExternal,
  plusPhase,
  prefetchPlusStatus,
  type PlusStatus,
} from '@/lib/plusStatus';
import { useUIStore } from '@/lib/uiStore';

type Via = 'push' | 'in_app';

const SEEN_KEY = 'frogress_plus_ending_seen';
const SWITCHING_OFF = getPlusContext('plus_ending').perks;
const DAY_MS = 86_400_000;

const usePlusEndingStore = create<{
  open: boolean;
  via: Via;
  status: PlusStatus | null;
}>(() => ({ open: false, via: 'in_app', status: null }));

let pending = false;

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeen(endsAt: string) {
  try {
    localStorage.setItem(SEEN_KEY, endsAt);
  } catch {
    /* ignore */
  }
}

function showPlusEnding(via: Via) {
  if (pending) return;
  pending = true;
  void prefetchPlusStatus()
    .catch(() => null)
    .then((status) => {
      if (status) void mutate(PLUS_STATUS_KEY, status, { revalidate: false });
      const phase = plusPhase(status ?? undefined);
      const endsAt = status?.subscription?.expiresAt;
      if (phase !== 'trial_cancelled' || !endsAt) {
        pending = false;
        if (via === 'push' && status && phase === 'inactive') {
          useUIStore.getState().setPremiumModalOpen(true, 'plus_trial_ended');
        }
        return;
      }
      writeSeen(endsAt);
      whenScreenIsFree(
        () => {
          pending = false;
          usePlusEndingStore.setState({ open: true, via, status });
        },
        { initialDelayMs: via === 'push' ? 400 : 2500 },
      );
    });
}

function storeLabel(store: string | undefined) {
  if (store === 'app_store') return 'the App Store';
  if (store === 'play_store') return 'Google Play';
  return null;
}

function endsWhen(iso: string) {
  const startOf = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOf(new Date(iso)) - startOf(new Date())) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `on ${formatPlusDate(iso)}`;
}

function PlusEndingTriggers() {
  const { user } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromPush = searchParams.get('plus') === 'ending';
  const { data } = useSWR<{ plusTrialEndsAt?: string | null }>(
    user ? '/api/user' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const endsAt = data?.plusTrialEndsAt ?? null;

  useEffect(() => {
    if (!fromPush || !user) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('plus');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
    showPlusEnding('push');
  }, [fromPush, user]);

  useEffect(() => {
    if (!endsAt || pathname !== '/') return;
    if (readSeen() === endsAt) return;
    showPlusEnding('in_app');
  }, [endsAt, pathname]);

  return null;
}

export function PlusEndingHost() {
  const { open, via, status } = usePlusEndingStore();
  return (
    <>
      <Suspense fallback={null}>
        <PlusEndingTriggers />
      </Suspense>
      <PlusEndingSheet
        open={open}
        via={via}
        status={status}
        onClose={() => usePlusEndingStore.setState({ open: false })}
      />
    </>
  );
}

function PlusEndingSheet({
  open,
  via,
  status,
  onClose,
}: {
  open: boolean;
  via: Via;
  status: PlusStatus | null;
  onClose: () => void;
}) {
  const sub = status?.subscription;
  const endsAt = sub?.expiresAt ?? null;
  const target = manageTarget(status ?? undefined);
  const store = storeLabel(sub?.store);
  const earnedFlies = status?.earned?.flies ?? 0;
  const earnedRare = status?.earned?.rareItems ?? 0;

  useEffect(() => {
    if (!open) return;
    trackAnalyticsEvent('plus_ending_viewed', { via, store: sub?.store });
  }, [open, via, sub?.store]);

  const keep = () => {
    if (target?.kind !== 'url') return;
    trackAnalyticsEvent('plus_ending_tapped', { via, store: sub?.store });
    openExternal(target.url);
    onClose();
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      zIndex={1360}
      hideHandle
      showClose={false}
      className="plus-paywall border-0 bg-background text-foreground sm:max-w-[420px]"
    >
      {({ bindScroll }) => (
        <div className="flex max-h-[92dvh] flex-col sm:max-h-[calc(100dvh-3rem)]">
          <div
            ref={bindScroll}
            className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
          >
            <PlusSheetHero
              headline={endsAt ? `Plus ends ${endsWhen(endsAt)}` : 'Plus is ending'}
              pill={{ label: `Trial ends ${formatPlusDate(endsAt)}`, tone: 'amber' }}
              onClose={onClose}
              greet="sweat"
            />
            <div className="px-5 pb-4 pt-4">
              {earnedFlies > 0 || earnedRare > 0 ? (
                <PlusEarnedStrip
                  earned={{ flies: earnedFlies, rareItems: earnedRare }}
                  label="So far, Plus got you"
                  className="mb-4"
                />
              ) : null}
              <PerkLedger perks={SWITCHING_OFF} freeLabel="After" plusLabel="Now" />
              {target?.kind === 'steps' ? (
                <p className="mt-4 rounded-xl bg-card px-3 py-2.5 text-[12.5px] font-bold leading-snug">
                  {target.steps}
                </p>
              ) : null}
            </div>
          </div>
          <div className="plus-dock shrink-0 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5">
            {target?.kind === 'url' ? (
              <PlusGoldButton onClick={keep}>
                Keep Plus
                <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" strokeWidth={2.75} aria-hidden />
              </PlusGoldButton>
            ) : null}
            <p className="mt-2.5 text-center text-[12.5px] font-bold leading-snug text-muted-foreground">
              {store
                ? `Turn auto-renew back on in ${store}. No charge before ${formatPlusDate(endsAt)}.`
                : 'Turn auto-renew back on to keep your perks.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 min-h-10 w-full rounded-xl text-[13.5px] font-black text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}
