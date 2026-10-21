'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { create } from 'zustand';
import { useAuth } from '@/components/auth/AuthContext';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { FlyAmount } from '@/components/ui/FlyAmount';
import { Icon } from '@/components/ui/Icon';
import { PlusSheetHero } from '@/components/ui/PlusMembershipSheet';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { BENEFITS } from '@/lib/plusBenefits';
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
import { cn } from '@/lib/utils';

type Via = 'push' | 'in_app';

const SEEN_KEY = 'frogress_plus_ending_seen';
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
  const firstRunGuided = useUIStore((state) => state.isFirstRunGuided);
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
    if (!endsAt || pathname !== '/' || firstRunGuided) return;
    if (readSeen() === endsAt) return;
    showPlusEnding('in_app');
  }, [endsAt, pathname, firstRunGuided]);

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
      className="border-0 sm:max-w-[400px]"
    >
      {({ entered, bindScroll }) => (
        <div className="flex max-h-[92dvh] flex-col sm:max-h-[calc(100dvh-3rem)]">
          <PlusSheetHero
            headline={endsAt ? `Plus ends ${endsWhen(endsAt)}` : 'Plus is ending'}
            pill={{ label: `Trial ends ${formatPlusDate(endsAt)}`, tone: 'amber' }}
            onClose={onClose}
            entered={entered}
          />
          <div
            ref={bindScroll}
            className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
          >
            {(earnedFlies > 0 || earnedRare > 0) && (
              <section className="mb-4">
                <h3 className="px-1 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
                  Plus got you
                </h3>
                <div
                  className={cn(
                    'mt-2 grid gap-2',
                    earnedFlies > 0 && earnedRare > 0 ? 'grid-cols-2' : 'grid-cols-1',
                  )}
                >
                  {earnedFlies > 0 && (
                    <div className="rounded-2xl border border-border/50 bg-card px-3 py-3">
                      <FlyAmount amount={earnedFlies} size={20} className="font-black" />
                      <span className="mt-1 block text-[12px] font-semibold text-muted-foreground">
                        extra flies
                      </span>
                    </div>
                  )}
                  {earnedRare > 0 && (
                    <div className="rounded-2xl border border-border/50 bg-card px-3 py-3">
                      <span className="flex items-center gap-1.5 text-[20px] font-black tabular-nums leading-none">
                        <Icon name="wardrobe" className="h-6 w-6" />
                        {earnedRare}
                      </span>
                      <span className="mt-1 block text-[12px] font-semibold text-muted-foreground">
                        rare+ {earnedRare === 1 ? 'outfit' : 'outfits'}
                      </span>
                    </div>
                  )}
                </div>
              </section>
            )}
            <h3 className="px-1 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
              Switching off
            </h3>
            <ul className="mt-2 space-y-2">
              {BENEFITS.map((benefit) => (
                <li
                  key={benefit.title}
                  className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-3 py-2.5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/15">
                    <Icon name={benefit.icon} className="h-7 w-7" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-black leading-tight">
                      {benefit.title}
                    </span>
                    <span className="block text-[12px] font-semibold leading-snug text-muted-foreground">
                      {benefit.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {target?.kind === 'url' ? (
              <button
                type="button"
                onClick={keep}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-[15px] font-black text-white shadow-[0_3px_0_0_#064e3b] transition-all hover:brightness-110 active:scale-[0.98]"
              >
                Keep Plus
                <ExternalLink className="h-3.5 w-3.5 opacity-70" strokeWidth={2.75} />
              </button>
            ) : target?.kind === 'steps' ? (
              <p className="mt-5 rounded-xl bg-card px-3 py-2.5 text-[12.5px] font-bold leading-snug text-foreground ring-1 ring-border/60">
                {target.steps}
              </p>
            ) : null}
            <p className="mt-2.5 text-center text-[12px] font-semibold leading-snug text-muted-foreground">
              {store
                ? `Turn auto-renew back on in ${store}. No charge before ${formatPlusDate(endsAt)}.`
                : 'Turn auto-renew back on to keep your perks.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 h-11 w-full text-[14px] font-black text-muted-foreground transition-colors hover:text-foreground"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </BaseSheet>
  );
}
