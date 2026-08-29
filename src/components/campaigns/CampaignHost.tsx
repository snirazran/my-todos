'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useUIStore } from '@/lib/uiStore';
import { useSheetStore } from '@/lib/sheetStore';
import { useAuth } from '@/components/auth/AuthContext';
import { hapticTick } from '@/lib/haptics';
import {
  emitCampaignTrigger,
  markCampaignConverted,
  setCampaignBusy,
  useCampaignStore,
} from '@/lib/campaigns/orchestrator';
import type { FlyPackId } from '@/lib/flyPacks';
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

/** Actions that own their own closing, because they can still fail or be
 *  cancelled after the tap. */
const DEFERS_CLOSE: CtaAction[] = ['buy_pack', 'buy_product', 'claim_reward'];

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
  const reportClick = useCampaignStore((s) => s.reportClick);
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

  const [buying, setBuying] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  useEffect(() => {
    if (!purchaseError) return;
    const timer = window.setTimeout(() => setPurchaseError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [purchaseError]);

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

  /**
   * A purchase raised from the popup itself. The store's own sheet is the only
   * confirmation step, so the popup stays up behind it: closing first would
   * leave someone who cancels staring at the screen they were trying to leave,
   * with no way back to the offer.
   */
  const runDirectPurchase = useCallback(
    async (
      kind: 'pack' | 'product',
      options: {
        packId?: string;
        productId?: string;
        elementId?: string;
        campaignId: string;
      },
    ) => {
      const id = kind === 'pack' ? options.packId : options.productId;
      if (!id) return;
      reportClick(options.elementId);
      setBuying(true);
      try {
        const { purchaseFlyPack, purchaseStoreProduct } = await import('@/lib/purchases');
        const outcome =
          kind === 'pack'
            ? await purchaseFlyPack(id as FlyPackId)
            : await purchaseStoreProduct(id, `campaign:${options.campaignId}`);

        if (outcome === 'purchased') {
          markCampaignConverted(options.campaignId);
          close('click');
          // Flies land through the store webhook, so the shop is where the new
          // balance actually appears — and where a "still processing" state is
          // already handled.
          if (kind === 'pack') openFlyShop(undefined, id);
          emitCampaignTrigger('purchase_completed');
        }
      } catch (error) {
        setPurchaseError(
          error instanceof Error && /does not offer|No web package/.test(error.message)
            ? 'That offer is not available on this device.'
            : 'The purchase could not be started.',
        );
      } finally {
        setBuying(false);
      }
    },
    [close, openFlyShop, reportClick],
  );

  /**
   * The grant itself is the server's decision; this only reports which button
   * was pressed. A failure leaves the popup open so the user can try again.
   */
  const runClaim = useCallback(
    async (campaignId: string, elementId?: string) => {
      reportClick(elementId);
      setBuying(true);
      try {
        const res = await fetch('/api/campaigns/claim', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId, elementId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPurchaseError(data.error ?? 'That reward could not be collected.');
          return;
        }
        markCampaignConverted(campaignId);
        close('click', elementId);
        void mutate(() => true, undefined, { revalidate: true });
      } catch {
        setPurchaseError('That reward could not be collected.');
      } finally {
        setBuying(false);
      }
    },
    [close, reportClick],
  );

  const runAction = useCallback(
    (
      action: CtaAction,
      options: {
        path?: string;
        packId?: string;
        productId?: string;
        elementId?: string;
        campaignId: string;
      },
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
        case 'buy_pack':
          void runDirectPurchase('pack', options);
          break;
        case 'buy_product':
          void runDirectPurchase('product', options);
          break;
        case 'claim_reward':
          void runClaim(options.campaignId, options.elementId);
          break;
        case 'navigate':
          if (options.path) router.push(options.path);
          break;
        default:
          break;
      }
    },
    [openFlyShop, openWardrobe, router, runClaim, runDirectPurchase, setPremiumModalOpen],
  );

  const runCta = useCallback(() => {
    const campaign = useCampaignStore.getState().active;
    if (!campaign) return;
    hapticTick();
    // A purchase or a claim closes itself once it has actually succeeded, so
    // closing here would hide the popup behind a sheet the user may cancel.
    if (!DEFERS_CLOSE.includes(campaign.cta.action)) close('click');
    runAction(campaign.cta.action, {
      path: campaign.cta.path,
      packId: campaign.offer.packId,
      productId: campaign.cta.productId || campaign.offer.productId,
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
      if (!DEFERS_CLOSE.includes(action)) close('click', element.id);
      runAction(action, {
        path: element.path || campaign.cta.path,
        packId: element.packId || campaign.offer.packId,
        productId: element.productId || campaign.offer.productId,
        elementId: element.id,
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
      if (resolved.closes && !DEFERS_CLOSE.includes(resolved.action)) close('click');
      runAction(resolved.action, {
        path: resolved.path,
        packId: resolved.packId,
        productId: resolved.productId,
        campaignId: campaign.id,
      });
    },
    [close, runAction],
  );

  if (!active) return null;

  // A tap that opened a payment sheet must not be tappable again behind it,
  // and a claim in flight must not be claimable twice.
  const dismiss = () => {
    if (buying) return;
    close('dismiss');
  };

  const status = (
    <>
      {buying ? (
        <div className="fixed inset-0 z-[1800] flex items-center justify-center bg-black/30">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-popover shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-foreground" />
          </span>
        </div>
      ) : null}
      {purchaseError ? (
        <div className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-[1850] mx-auto max-w-sm rounded-2xl bg-foreground px-4 py-3 text-center text-xs font-black text-background shadow-xl">
          {purchaseError}
        </div>
      ) : null}
    </>
  );

  if (!isBlockingTemplate(active.template)) {
    return (
      <>
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
        {status}
      </>
    );
  }

  return (
    <>
      <CampaignModal
        campaign={active}
        onActivate={runElement}
        onDismiss={dismiss}
        onSignal={runSignal}
      />
      {status}
    </>
  );
}
