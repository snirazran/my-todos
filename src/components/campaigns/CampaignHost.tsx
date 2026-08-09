'use client';

import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/lib/uiStore';
import { useSheetStore } from '@/lib/sheetStore';
import { useAuth } from '@/components/auth/AuthContext';
import { hapticTick } from '@/lib/haptics';
import {
  emitCampaignTrigger,
  setCampaignBusy,
  useCampaignStore,
} from '@/lib/campaigns/orchestrator';
import {
  isBlockingTemplate,
  type CampaignElement,
  type CampaignPayload,
  type CtaAction,
} from '@/lib/campaigns/types';
import { resolveRiveSignal } from '@/lib/campaigns/riveSignals';
import { NudgeBannerCard } from './CampaignSurfaces';
import { CampaignModal } from './CampaignModal';
import type { RiveSignal } from './CampaignRiveArt';

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
  const openSheets = useSheetStore((s) => s.count);

  const { data } = useSWR<{ campaigns: CampaignPayload[] }>(
    user ? `/api/campaigns?platform=${platformHint()}` : null,
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  useEffect(() => {
    if (data?.campaigns) setCampaigns(data.campaigns);
  }, [data, setCampaigns]);

  // Anything the user opened themselves outranks anything we want to say —
  // including any sheet at all, which is what the global sheet count is for.
  // Our own popup is a sheet too, but by then a campaign is already active and
  // the busy check no longer applies.
  useEffect(() => {
    setCampaignBusy(
      'ui',
      isFlyShopOpen ||
        isWardrobeOpen ||
        isPremiumModalOpen ||
        isCinematicActive ||
        !!activeHint ||
        openSheets > 0,
    );
  }, [
    isFlyShopOpen,
    isWardrobeOpen,
    isPremiumModalOpen,
    isCinematicActive,
    activeHint,
    openSheets,
  ]);

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

  const runAction = useCallback(
    (
      action: CtaAction,
      options: { path?: string; packId?: string; campaignId: string },
    ) => {
      switch (action) {
        case 'open_fly_shop':
          openFlyShop(undefined, options.packId || undefined);
          break;
        case 'open_wardrobe':
          openWardrobe();
          break;
        case 'open_premium':
          setPremiumModalOpen(true, `campaign:${options.campaignId}`);
          break;
        case 'navigate':
          if (options.path) router.push(options.path);
          break;
        default:
          break;
      }
    },
    [openFlyShop, openWardrobe, router, setPremiumModalOpen],
  );

  const runCta = useCallback(() => {
    const campaign = useCampaignStore.getState().active;
    if (!campaign) return;
    hapticTick();
    close('click');
    runAction(campaign.cta.action, {
      path: campaign.cta.path,
      packId: campaign.offer.packId,
      campaignId: campaign.id,
    });
  }, [close, runAction]);

  /**
   * A button drawn on the artwork behaves like any other button, and reports
   * itself by id so the admin can see which one on the popup was pressed.
   */
  const runElement = useCallback(
    (element: CampaignElement) => {
      const campaign = useCampaignStore.getState().active;
      if (!campaign) return;
      hapticTick();
      const action = element.action ?? 'dismiss';
      if (action === 'dismiss') {
        close('dismiss', element.id);
        return;
      }
      close('click', element.id);
      runAction(action, {
        path: element.path || campaign.cta.path,
        packId: element.packId || campaign.offer.packId,
        campaignId: campaign.id,
      });
    },
    [close, runAction],
  );

  /**
   * A button drawn in Rive behaves exactly like a button drawn in the app:
   * it reports what it did and, unless the admin says otherwise, closes.
   * Unmapped signals are ignored — a file is free to fire whatever it likes
   * for its own animation states.
   */
  const runSignal = useCallback(
    (signal: RiveSignal) => {
      const campaign = useCampaignStore.getState().active;
      if (!campaign) return;

      const resolved = resolveRiveSignal(campaign, signal);
      if (!resolved) return;

      hapticTick();
      if (resolved.closes) close('click');
      runAction(resolved.action, {
        path: resolved.path,
        packId: resolved.packId,
        campaignId: campaign.id,
      });
    },
    [close, runAction],
  );

  if (!active) return null;

  const dismiss = () => close('dismiss');

  if (!isBlockingTemplate(active.template)) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[1400] mx-auto max-w-md"
        >
          <NudgeBannerCard
            campaign={active}
            onCta={runCta}
            onDismiss={dismiss}
            onSignal={runSignal}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <CampaignModal
      campaign={active}
      onActivate={runElement}
      onDismiss={dismiss}
      onSignal={runSignal}
    />
  );
}
