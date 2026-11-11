'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useReducedMotion } from 'framer-motion';
import useSWR, { mutate } from 'swr';
import confetti from 'canvas-confetti';
import { X } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { PerkLedger, PlusGoldButton, PlusStage } from '@/components/ui/plus/PlusKit';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import { postPlusPreview, usePlusPreview } from '@/hooks/usePlusPreview';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { hapticCelebrate } from '@/lib/haptics';
import { PLUS_PREVIEW_DAYS, previewDaysLeft } from '@/lib/plus/preview';
import { getPlusContext } from '@/lib/plusPaywall';
import {
  holdAutoPopups,
  releaseAutoPopups,
  useAutoPopupHold,
  whenScreenIsFree,
} from '@/lib/popupGate';
import { useUIStore } from '@/lib/uiStore';

const START_HOLD = 'plus-preview-start';
const SHOW_DELAY_MS = 2500;

function refreshPlusState() {
  void mutate(() => true);
  mutateInventoryCaches();
}

export function endDayLabel(endsAt: string | null | undefined) {
  if (!endsAt) return '';
  return new Date(endsAt).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function previewLeftLabel(endsAt: string | null | undefined) {
  const days = previewDaysLeft(endsAt);
  if (days <= 1) return 'Last day';
  return `${days} days left`;
}

function PlusPreviewTriggers({ onStarted }: { onStarted: (endsAt: string) => void }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = usePlusPreview();
  const phase = preview?.phase ?? 'none';
  const fromPush = searchParams.get('plus') === 'preview';
  const started = useRef(false);
  const endShown = useRef(false);
  const wasActive = useRef(false);

  useEffect(() => {
    if (!user || phase !== 'eligible' || pathname !== '/') return;
    return whenScreenIsFree(
      () => {
        if (started.current) return;
        started.current = true;
        holdAutoPopups(START_HOLD);
        void postPlusPreview('start').then((payload) => {
          releaseAutoPopups(START_HOLD, 0);
          const next = payload?.preview;
          if (next?.phase !== 'active' || !next.endsAt) return;
          refreshPlusState();
          onStarted(next.endsAt);
        });
      },
      { initialDelayMs: SHOW_DELAY_MS },
    );
  }, [user, phase, pathname, onStarted]);

  useEffect(() => {
    if (phase === 'active') wasActive.current = true;
    if (phase !== 'ended') return;
    if (wasActive.current) {
      wasActive.current = false;
      refreshPlusState();
    }
    if (!user || pathname !== '/') return;
    return whenScreenIsFree(
      () => {
        if (endShown.current) return;
        endShown.current = true;
        useUIStore.getState().setPremiumModalOpen(true, 'plus_preview_ended');
        void postPlusPreview('end_seen').then(() => mutate('/api/user'));
      },
      { initialDelayMs: SHOW_DELAY_MS },
    );
  }, [user, phase, pathname]);

  useEffect(() => {
    if (!fromPush || !user || !preview) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('plus');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
    if (preview.phase !== 'active' && preview.phase !== 'offer') return;
    return whenScreenIsFree(
      () => useUIStore.getState().setPremiumModalOpen(true, 'plus_preview_push'),
      { initialDelayMs: 400 },
    );
  }, [fromPush, user, preview]);

  return null;
}

export function PlusPreviewHost() {
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [onStarted] = useState(() => (next: string) => {
    setEndsAt(next);
    setOpen(true);
  });
  return (
    <>
      <Suspense fallback={null}>
        <PlusPreviewTriggers onStarted={onStarted} />
      </Suspense>
      <PlusPreviewIntro open={open} endsAt={endsAt} onClose={() => setOpen(false)} />
    </>
  );
}

export function PlusPreviewIntro({
  open,
  endsAt,
  onClose,
}: {
  open: boolean;
  endsAt: string | null;
  onClose: () => void;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      zIndex={10010}
      hideHandle
      showClose={false}
      className="plus-paywall border-0 bg-background text-foreground sm:max-w-[420px]"
    >
      {({ entered, bindScroll }) => (
        <IntroContent entered={entered} bindScroll={bindScroll} endsAt={endsAt} onClose={onClose} />
      )}
    </BaseSheet>
  );
}

function IntroContent({
  entered,
  bindScroll,
  endsAt,
  onClose,
}: {
  entered: boolean;
  bindScroll: (el: HTMLElement | null) => void;
  endsAt: string | null;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const { user } = useAuth();
  const { indices } = useWardrobeIndices(true);
  const { data: me } = useSWR<{ frogName?: string | null }>(
    user ? '/api/user' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  useAutoPopupHold('plus-preview', true);
  const frogName = me?.frogName?.trim() || 'Your frog';
  const context = getPlusContext('plus_preview_intro', frogName);
  const endDay = endDayLabel(endsAt);

  useEffect(() => {
    if (!entered) return;
    hapticCelebrate();
    if (reduceMotion) return;
    confetti({
      particleCount: 80,
      spread: 78,
      startVelocity: 36,
      origin: { y: 0.28 },
      zIndex: 10020,
      colors: ['#f5c84c', '#fde68a', '#a78bfa', '#ffffff'],
      disableForReducedMotion: true,
    });
  }, [entered, reduceMotion]);

  return (
    <div className="flex max-h-[94dvh] flex-col sm:max-h-[calc(100dvh-3rem)]">
      <div
        ref={bindScroll}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <PlusStage look={indices} greet="tada">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.14)] transition-[background-color,transform] hover:bg-white/15 active:scale-90"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
          </button>
        </PlusStage>

        <div className="px-5 pb-4 pt-5 text-center short:pt-4">
          <h2
            id="plus-preview-title"
            className="text-balance text-[26px] font-black leading-[1.08] tracking-tight short:text-[23px]"
          >
            {frogName} got {PLUS_PREVIEW_DAYS} days of Plus.
            <br />
            <span className="text-primary">Our treat.</span>
          </h2>
          <p className="mx-auto mt-2.5 max-w-[19rem] text-pretty text-[14.5px] font-semibold leading-snug text-muted-foreground">
            No card and nothing to cancel.
            {endDay ? ` It switches off by itself on ${endDay}.` : ' It switches off by itself.'}
          </p>
          <PerkLedger perks={context.perks} className="mt-4 text-left" />
        </div>
      </div>

      <div className="plus-dock shrink-0 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5">
        <PlusGoldButton onClick={onClose}>Let’s go</PlusGoldButton>
        <p className="mt-2.5 text-center text-[12.5px] font-bold text-muted-foreground">
          You won’t be charged. Find it anytime in Settings.
        </p>
      </div>
    </div>
  );
}
