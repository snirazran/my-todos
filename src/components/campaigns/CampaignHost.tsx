'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/uiStore';
import { useAuth } from '@/components/auth/AuthContext';
import { hapticTick } from '@/lib/haptics';
import {
  emitCampaignTrigger,
  setCampaignBusy,
  useCampaignStore,
} from '@/lib/campaigns/orchestrator';
import { isBlockingTemplate, type CampaignPayload } from '@/lib/campaigns/types';
import { getFlyPack } from '@/lib/flyPacks';

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json());

const platformHint = () =>
  (window as typeof window & { Capacitor?: { getPlatform?: () => string } }).Capacitor
    ?.getPlatform?.() ?? 'web';

const LAST_VISIT_KEY = 'frogress.campaigns.lastVisit';

const daysSinceLastVisit = () => {
  try {
    const last = Number(window.localStorage.getItem(LAST_VISIT_KEY)) || 0;
    if (!last) return 0;
    return Math.floor((Date.now() - last) / 86_400_000);
  } catch {
    return 0;
  }
};

const markVisited = () => {
  try {
    window.localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
  } catch {
    /* best effort */
  }
};

/**
 * The single mount point for every admin-authored popup.
 *
 * One host means one place that knows what's on screen, so campaigns can never
 * stack on top of each other or on top of a sheet the user opened themselves.
 */
export function CampaignHost() {
  const router = useRouter();
  const { user } = useAuth();
  const active = useCampaignStore((s) => s.active);
  const setCampaigns = useCampaignStore((s) => s.setCampaigns);
  const close = useCampaignStore((s) => s.close);
  const flushPending = useCampaignStore((s) => s.flushPending);
  const busyReasons = useCampaignStore((s) => s.busyReasons);
  const pending = useCampaignStore((s) => s.pending);

  const openFlyShop = useUIStore((s) => s.openFlyShop);
  const openWardrobe = useUIStore((s) => s.openWardrobe);
  const setPremiumModalOpen = useUIStore((s) => s.setPremiumModalOpen);
  const isFlyShopOpen = useUIStore((s) => s.isFlyShopOpen);
  const isWardrobeOpen = useUIStore((s) => s.isWardrobeOpen);
  const isPremiumModalOpen = useUIStore((s) => s.isPremiumModalOpen);
  const isCinematicActive = useUIStore((s) => s.isCinematicActive);
  const activeHint = useUIStore((s) => s.activeHint);

  const { data } = useSWR<{ campaigns: CampaignPayload[] }>(
    user ? `/api/campaigns?platform=${platformHint()}` : null,
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  useEffect(() => {
    if (data?.campaigns) setCampaigns(data.campaigns);
  }, [data, setCampaigns]);

  // Anything the user opened themselves outranks anything we want to say.
  useEffect(() => {
    setCampaignBusy(
      'ui',
      isFlyShopOpen || isWardrobeOpen || isPremiumModalOpen || isCinematicActive || !!activeHint,
    );
  }, [isFlyShopOpen, isWardrobeOpen, isPremiumModalOpen, isCinematicActive, activeHint]);

  // Session start fires once the campaign list has landed. A long gap since
  // the last visit is its own trigger, so comeback campaigns can outrank the
  // everyday session-start ones.
  useEffect(() => {
    if (!data?.campaigns?.length) return;
    const days = daysSinceLastVisit();
    markVisited();
    if (days > 0) emitCampaignTrigger('returned_after_absence', { days });
    emitCampaignTrigger('session_start');
  }, [data]);

  useEffect(() => {
    if (pending && busyReasons.length === 0) flushPending();
  }, [pending, busyReasons, flushPending]);

  if (!active) return null;

  const runCta = () => {
    hapticTick();
    const { action, path } = active.cta;
    close('click');
    switch (action) {
      case 'open_fly_shop':
        openFlyShop(undefined, active.offer.packId || undefined);
        break;
      case 'open_wardrobe':
        openWardrobe();
        break;
      case 'open_premium':
        setPremiumModalOpen(true, `campaign:${active.id}`);
        break;
      case 'navigate':
        if (path) router.push(path);
        break;
      default:
        break;
    }
  };

  const dismiss = () => close('dismiss');

  if (!isBlockingTemplate(active.template)) {
    return <NudgeBanner campaign={active} onCta={runCta} onDismiss={dismiss} />;
  }

  return (
    <BaseSheet
      open
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
      zIndex={1750}
      backdropClassName="bg-black/70 backdrop-blur-sm"
      className="max-h-[90vh] bg-popover sm:max-h-[85vh] sm:max-w-md"
      closeAriaLabel="Close offer"
    >
      {() => (
        <div className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2 sm:px-6 sm:pb-6 sm:pt-6">
          {active.imageUrl ? (
            <div
              className={cn(
                'mx-auto flex w-full items-center justify-center overflow-hidden rounded-[24px] bg-muted/40',
                active.template === 'hero-offer' ? 'aspect-[4/3]' : 'aspect-[16/9]',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={active.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}

          {active.copy.eyebrow ? (
            <span className="mt-4 self-center rounded-full bg-primary/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
              {active.copy.eyebrow}
            </span>
          ) : null}

          <h2 className="mt-3 text-center text-2xl font-black leading-tight tracking-tight text-foreground">
            {active.copy.headline}
          </h2>

          {active.copy.body ? (
            <p className="mx-auto mt-2 max-w-[19rem] text-center text-sm font-medium leading-relaxed text-muted-foreground">
              {active.copy.body}
            </p>
          ) : null}

          {active.template === 'pack-offer' ? (
            <PackSummary campaign={active} />
          ) : null}

          <button
            type="button"
            onClick={runCta}
            className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-[#4f9149] text-base font-black tracking-wide text-white shadow-[0_5px_0_0_#34631f] transition-all hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
          >
            {active.copy.ctaLabel}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {active.copy.dismissLabel}
          </button>
        </div>
      )}
    </BaseSheet>
  );
}

function PackSummary({ campaign }: { campaign: CampaignPayload }) {
  const pack = campaign.offer.packId ? getFlyPack(campaign.offer.packId) : undefined;
  if (!pack) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl bg-muted/50 px-4 py-3">
      <Fly size={30} y={-6} paused />
      <span className="text-2xl font-black tabular-nums text-foreground">
        {pack.amount.toLocaleString()}
      </span>
      {campaign.offer.bonusLabel ? (
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400">
          {campaign.offer.bonusLabel}
        </span>
      ) : null}
    </div>
  );
}

function NudgeBanner({
  campaign,
  onCta,
  onDismiss,
}: {
  campaign: CampaignPayload;
  onCta: () => void;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[1400] mx-auto max-w-md"
      >
        <div className="flex items-center gap-3 rounded-[20px] bg-popover p-3 shadow-xl ring-1 ring-border">
          {campaign.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={campaign.imageUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-2xl object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-foreground">
              {campaign.copy.headline}
            </p>
            {campaign.copy.body ? (
              <p className="truncate text-xs font-semibold text-muted-foreground">
                {campaign.copy.body}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCta}
            className="shrink-0 rounded-xl bg-[#4f9149] px-3 py-2 text-xs font-black text-white"
          >
            {campaign.copy.ctaLabel}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
