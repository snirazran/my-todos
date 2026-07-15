'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { RewardCard } from './gift-box/RewardCard';
import GiftBoxOpening from './gift-box/GiftBoxOpening';
import { RotatingRays } from './gift-box/RotatingRays';
import { RARITY_CONFIG as GIFT_RARITY_CONFIG } from './gift-box/constants';
import Fly from './fly';
import { FlyCounter } from './FlyCounter';
import type { ItemDef } from '@/lib/skins/catalog';
import {
  mutateInventoryCaches,
  patchInventoryFlies,
} from '@/hooks/useInventory';
import { markFlyEarn } from '@/lib/flyEarn';
import { hapticCelebrate, hapticTick } from '@/lib/haptics';
import { showRewardedAd } from '@/lib/ads';
import { maybeRequestAppRating } from '@/lib/rateApp';
import { useRiveInteractionPause } from '@/lib/riveInteractionPause';

export type QuestRewardSummary = {
  fliesGranted?: number;
  flyBalanceBefore?: number;
  flyBalanceAfter?: number;
  grantedItemIds?: string[];
  grantedBackgroundIds?: string[];
  doubleClaimId?: string;
};

export type RevealCatalog = Record<
  string,
  Pick<ItemDef, 'id' | 'name' | 'rarity' | 'riveIndex'> & {
    slot: ItemDef['slot'] | 'background';
    imageUrl?: string;
  }
>;

type QuestRewardRevealEntry = {
  key: string;
  item: ItemDef & { kind?: 'item' | 'background'; imageUrl?: string };
  fliesGranted?: number;
  flyBalanceBefore?: number;
  flyBalanceAfter?: number;
  quantity?: number;
  baseQuantity?: number;
  baseFlies?: number;
  isQuestReward?: boolean;
  doubleClaimId?: string;
  doubled?: boolean;
  grantPremium?: boolean;
  suppressFlyPill?: boolean;
};

type FlyGainToast = {
  id: number;
  amount: number;
  from: number;
  to: number;
};

type RevealHostState = {
  queue: QuestRewardRevealEntry[];
  giftOpening: {
    entry: QuestRewardRevealEntry;
    remaining: number;
    instance: number;
  } | null;
  flyGainToast: FlyGainToast | null;
};

// One reveal pipeline for the whole app: any page enqueues claim summaries,
// the single host (mounted in providers) plays them. Module-level so the
// toast's Claim works from home/planner without each page mounting its own.
const revealStore = createStore<RevealHostState>(() => ({
  queue: [],
  giftOpening: null,
  flyGainToast: null,
}));

let revealIdCounter = 0;
let toastIdCounter = 0;
let knownFlyBalance = 0;
let doublingClaim = false;

function createFlyRewardItem(amount: number): ItemDef {
  return {
    id: `flies-${amount}`,
    name: `${amount} Flies`,
    slot: 'hand_item',
    rarity: 'uncommon',
    riveIndex: 0,
    icon: '',
  };
}

export function useQuestRevealQueueLength() {
  return useStore(revealStore, (state) => state.queue.length);
}

export function enqueueQuestRewardReveal(
  summary: QuestRewardSummary | undefined,
  options: {
    catalog: RevealCatalog;
    isPremium: boolean;
    // Pages whose own header counter already animates the gain (home) pass
    // false so the balance isn't celebrated twice.
    showFlyGainPill?: boolean;
  },
): number {
  const { catalog, isPremium } = options;
  const suppressFlyPill = options.showFlyGainPill === false;
  const grantedItemIds = Array.isArray(summary?.grantedItemIds)
    ? summary.grantedItemIds
    : [];
  const nextEntries: QuestRewardRevealEntry[] = [];
  const fliesGranted = Math.max(0, Math.floor(summary?.fliesGranted ?? 0));

  if (fliesGranted > 0) {
    const baseFlies = isPremium ? Math.floor(fliesGranted / 2) : fliesGranted;
    const flyBalanceBefore =
      typeof summary?.flyBalanceBefore === 'number'
        ? summary.flyBalanceBefore
        : knownFlyBalance;
    const flyBalanceAfter =
      typeof summary?.flyBalanceAfter === 'number'
        ? summary.flyBalanceAfter
        : flyBalanceBefore + fliesGranted;
    knownFlyBalance = flyBalanceAfter;
    nextEntries.push({
      key: `flies-${fliesGranted}-${revealIdCounter}`,
      item: createFlyRewardItem(fliesGranted),
      fliesGranted,
      flyBalanceBefore,
      flyBalanceAfter,
      baseFlies: isPremium ? baseFlies : undefined,
      isQuestReward: true,
      doubleClaimId: summary?.doubleClaimId,
      grantPremium: isPremium,
      suppressFlyPill,
    });
    revealIdCounter += 1;
  }

  // Consolidate duplicate item IDs into single entries with quantity
  const itemCounts: Record<string, number> = {};
  for (const itemId of grantedItemIds) {
    itemCounts[itemId] = (itemCounts[itemId] ?? 0) + 1;
  }

  const uniqueItemIds = Object.keys(itemCounts);
  for (const itemId of uniqueItemIds) {
    const item = catalog[itemId];
    if (!item) continue;
    const count = itemCounts[itemId];
    const key = `${item.id}-${revealIdCounter}`;
    revealIdCounter += 1;
    const baseCount = isPremium ? Math.floor(count / 2) || 1 : count;
    nextEntries.push({
      key,
      item: item as QuestRewardRevealEntry['item'],
      quantity: count > 1 ? count : undefined,
      baseQuantity: isPremium && count > 1 ? baseCount : undefined,
      isQuestReward: true,
      doubleClaimId: summary?.doubleClaimId,
      grantPremium: isPremium,
      suppressFlyPill,
    });
  }

  // Background rewards — reveal each as a card showing the background image.
  const grantedBackgroundIds = Array.isArray(summary?.grantedBackgroundIds)
    ? summary.grantedBackgroundIds
    : [];
  const bgCounts: Record<string, number> = {};
  for (const bgId of grantedBackgroundIds) {
    bgCounts[bgId] = (bgCounts[bgId] ?? 0) + 1;
  }
  for (const bgId of Object.keys(bgCounts)) {
    const meta = catalog[bgId] as (ItemDef & { imageUrl?: string }) | undefined;
    if (!meta) continue;
    const count = bgCounts[bgId];
    const key = `${bgId}-${revealIdCounter}`;
    revealIdCounter += 1;
    const baseCount = isPremium ? Math.floor(count / 2) || 1 : count;
    nextEntries.push({
      key,
      item: {
        id: meta.id,
        name: meta.name,
        slot: 'skin',
        rarity: meta.rarity,
        riveIndex: 0,
        icon: '',
        priceFlies: 0,
        kind: 'background',
        imageUrl: meta.imageUrl,
      },
      quantity: count > 1 ? count : undefined,
      baseQuantity: isPremium && count > 1 ? baseCount : undefined,
      isQuestReward: true,
      doubleClaimId: summary?.doubleClaimId,
      grantPremium: isPremium,
      suppressFlyPill,
    });
  }

  if (!nextEntries.length) return 0;
  revealStore.setState((state) => ({
    queue: [...state.queue, ...nextEntries],
  }));
  return nextEntries.length;
}

function showFlyGainToast(entry: QuestRewardRevealEntry) {
  if (!entry.fliesGranted) return;
  const amount = Math.max(0, Math.floor(entry.fliesGranted));
  if (amount <= 0) return;
  const from =
    typeof entry.flyBalanceBefore === 'number'
      ? entry.flyBalanceBefore
      : Math.max(0, knownFlyBalance - amount);
  const to =
    typeof entry.flyBalanceAfter === 'number'
      ? entry.flyBalanceAfter
      : from + amount;

  revealStore.setState({
    flyGainToast: { id: ++toastIdCounter, amount, from, to },
  });
}

function handleClaim(entry?: QuestRewardRevealEntry) {
  if (entry?.fliesGranted && !entry.suppressFlyPill) {
    showFlyGainToast(entry);
  }
  if (entry?.isQuestReward) {
    markFlyEarn();
    // Patch the shared balance caches synchronously — waiting for the
    // revalidation round-trip lets a fast navigation land on a page whose
    // counter still holds the old balance and replays the gain.
    if (typeof entry.flyBalanceAfter === 'number') {
      patchInventoryFlies(entry.flyBalanceAfter);
    }
    mutateInventoryCaches();
  }
  revealStore.setState((state) => ({ queue: state.queue.slice(1) }));
}

function handleOpenGift(entry: QuestRewardRevealEntry) {
  if (entry.item.slot !== 'container') {
    handleClaim(entry);
    return;
  }
  if (revealStore.getState().giftOpening) return;

  // Launch the full "tap to unwrap" gift-box experience. Each box is
  // unwrapped (and its prize revealed) by GiftBoxOpening itself.
  revealStore.setState({
    giftOpening: {
      entry,
      remaining: entry.quantity ?? 1,
      instance: 0,
    },
  });
}

async function handleWatchAdDouble(entry: QuestRewardRevealEntry) {
  const claimId = entry.doubleClaimId;
  if (!claimId || entry.doubled || doublingClaim) return;
  doublingClaim = true;
  try {
    const outcome = await showRewardedAd('quest_reward_double');
    if (outcome !== 'rewarded') return;
    const res = await fetch('/api/rewards/double', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimId }),
    });
    const data = await res.json();
    if (!res.ok || !data?.granted) return;
    markFlyEarn();
    mutateInventoryCaches();
    revealStore.setState((state) => ({
      queue: state.queue.map((e) => {
        if (e.doubleClaimId !== claimId) return e;
        const next: QuestRewardRevealEntry = { ...e, doubled: true };
        if (e.fliesGranted) {
          const balanceAfter =
            typeof data?.summary?.flyBalanceAfter === 'number'
              ? data.summary.flyBalanceAfter
              : (e.flyBalanceAfter ?? 0) + e.fliesGranted;
          next.baseFlies = e.fliesGranted;
          next.fliesGranted = e.fliesGranted * 2;
          next.flyBalanceAfter = balanceAfter;
          knownFlyBalance = balanceAfter;
        } else {
          const base = e.quantity ?? 1;
          next.baseQuantity = base;
          next.quantity = base * 2;
        }
        return next;
      }),
    }));
  } finally {
    doublingClaim = false;
  }
}

// Called when a single gift box from the tap-to-unwrap flow is dismissed
// (prize claimed or closed). Advance to the next copy, or finish and remove
// the gift entry from the reveal queue once every box is done.
function handleGiftBoxClosed() {
  markFlyEarn();
  mutateInventoryCaches();
  const current = revealStore.getState().giftOpening;
  if (!current) return;
  const remaining = current.remaining - 1;
  if (remaining > 0) {
    revealStore.setState({
      giftOpening: { ...current, remaining, instance: current.instance + 1 },
    });
    return;
  }
  revealStore.setState((state) => ({
    giftOpening: null,
    queue:
      state.queue[0]?.key === current.entry.key
        ? state.queue.slice(1)
        : state.queue,
  }));
}

export function QuestRewardRevealHost() {
  const { queue, giftOpening, flyGainToast } = useStore(revealStore);

  // The reveal covers the page with a near-opaque backdrop, but it isn't a
  // sheet, so nothing paused the ambient Rives (home frog flies, card flies)
  // burning frames underneath it. Hold the global interaction pause while a
  // reveal or gift-opening is on screen; the overlay's own Rives opt out via
  // alwaysPlay.
  const revealActive = queue.length > 0 || !!giftOpening;
  useEffect(() => {
    if (!revealActive) return;
    const { acquire, release } = useRiveInteractionPause.getState();
    acquire();
    return release;
  }, [revealActive]);

  const prevRevealCountRef = useRef(0);
  useEffect(() => {
    if (prevRevealCountRef.current > 0 && queue.length === 0) {
      maybeRequestAppRating();
    }
    prevRevealCountRef.current = queue.length;
  }, [queue.length]);

  useEffect(() => {
    if (!flyGainToast) return;
    const timeout = window.setTimeout(
      () => revealStore.setState({ flyGainToast: null }),
      3200,
    );
    return () => window.clearTimeout(timeout);
  }, [flyGainToast]);

  return (
    <>
      <QuestRewardRevealOverlay
        queue={queue}
        onClaim={handleClaim}
        onOpenGift={handleOpenGift}
        onWatchAd={handleWatchAdDouble}
        paused={false}
      />
      {giftOpening && (
        <GiftBoxOpening
          key={`${giftOpening.entry.key}-${giftOpening.instance}`}
          giftBoxId={giftOpening.entry.item.id}
          onClose={handleGiftBoxClosed}
          onWin={() => {
            markFlyEarn();
            mutateInventoryCaches();
          }}
        />
      )}
      <FlyGainToastPill toast={flyGainToast} />
    </>
  );
}

function QuestRewardRevealOverlay({
  queue,
  onClaim,
  onOpenGift,
  onWatchAd,
  paused = false,
}: {
  queue: QuestRewardRevealEntry[];
  onClaim: (entry: QuestRewardRevealEntry) => void;
  onOpenGift: (entry: QuestRewardRevealEntry) => void;
  onWatchAd: (entry: QuestRewardRevealEntry) => void | Promise<void>;
  paused?: boolean;
}) {
  const entry = queue[0] ?? null;
  const isPremium = entry?.grantPremium ?? false;

  const entryKey = entry?.key ?? null;
  useEffect(() => {
    if (entryKey != null) hapticCelebrate();
  }, [entryKey]);

  if (typeof document === 'undefined') return null;

  // The backdrop + rays mount ONCE for the whole queue and only the card
  // swaps per entry — chained claims used to tear down and re-rasterize the
  // giant ray layer (with a black flash) on every single claim.
  return createPortal(
    <AnimatePresence>
      {entry && (
        <motion.div
          key="reveal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden pointer-events-auto"
        >
          <div className="absolute inset-0 bg-slate-950/90" />
          <div className="absolute inset-0 z-0 flex items-center justify-center">
            <RotatingRays
              colorClass={GIFT_RARITY_CONFIG[entry.item.rarity].rays}
            />
            <div className="absolute inset-0 bg-radial-gradient from-transparent to-slate-950/80" />
          </div>
          <AnimatePresence mode="wait">
          <motion.div
            key={entry.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 flex flex-col items-center justify-center w-full max-w-md p-6"
          >
            <RewardCard
              key={entry.key}
              prize={entry.item}
              claiming={false}
              onClaim={
                entry.item.slot === 'container'
                  ? () => onOpenGift(entry)
                  : () => onClaim(entry)
              }
              onOpenLater={
                entry.item.slot === 'container' ? () => onClaim(entry) : undefined
              }
              quantity={entry.quantity}
              baseQuantity={entry.baseQuantity}
              isPremium={isPremium && !!entry.isQuestReward}
              showDoubleUpsell={
                !isPremium &&
                !!entry.isQuestReward &&
                !!entry.doubleClaimId &&
                !entry.doubled
              }
              onWatchAd={() => onWatchAd(entry)}
              rewardAmount={entry.fliesGranted || undefined}
              paused={paused}
              customPreview={
                entry.fliesGranted ? (
                  entry.baseFlies ? (
                    <PremiumFlyCounter
                      baseAmount={entry.baseFlies}
                      finalAmount={entry.fliesGranted}
                    />
                  ) : (
                    <div className="relative flex items-center justify-center w-full h-full">
                      <Fly
                        size={132}
                        paused={paused}
                        interactive={false}
                        alwaysPlay
                      />
                      <span className="absolute z-40 px-3 py-1 text-sm font-black text-white border shadow-sm right-3 top-3 rounded-xl border-white/20 bg-black/45 backdrop-blur-sm">
                        x{entry.fliesGranted}
                      </span>
                    </div>
                  )
                ) : undefined
              }
              slotLabel={entry.fliesGranted ? 'currency' : undefined}
            />
          </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function PremiumFlyCounter({
  baseAmount,
  finalAmount,
  paused = false,
}: {
  baseAmount: number;
  finalAmount: number;
  paused?: boolean;
}) {
  const [displayAmount, setDisplayAmount] = useState(baseAmount);
  const [showDouble, setShowDouble] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const doubleTimer = setTimeout(() => {
      setShowDouble(true);
      // Animate counting up from base to final
      const duration = 600;
      const steps = 20;
      const increment = (finalAmount - baseAmount) / steps;
      let current = baseAmount;
      let step = 0;
      interval = setInterval(() => {
        step++;
        const next = Math.min(
          baseAmount + Math.round(increment * step),
          finalAmount,
        );
        if (next !== current) hapticTick();
        current = next;
        setDisplayAmount(current);
        if (step >= steps) clearInterval(interval);
      }, duration / steps);
    }, 800);
    return () => {
      clearTimeout(doubleTimer);
      if (interval) clearInterval(interval);
    };
  }, [baseAmount, finalAmount]);

  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <Fly size={132} paused={paused} interactive={false} alwaysPlay />
      <motion.span
        key={displayAmount}
        animate={showDouble ? { scale: [1.3, 1] } : {}}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        className="absolute z-40 px-3 py-1 text-sm font-black text-white border shadow-sm right-3 top-3 rounded-xl border-white/20 bg-black/45 backdrop-blur-sm"
      >
        x{displayAmount}
      </motion.span>
    </div>
  );
}

function FlyGainToastPill({ toast }: { toast: FlyGainToast | null }) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {toast && <FlyGainPill key={toast.id} toast={toast} />}
    </AnimatePresence>,
    document.body,
  );
}

// Shows the same FlyCounter used in the home header, sliding in at the top of
// the event overlay. Mounts at `from` so the count-up + "+N" pulse fire when
// the balance ticks to `to` (FlyCounter skips the bump on its first render).
function FlyGainPill({ toast }: { toast: FlyGainToast }) {
  const [value, setValue] = useState(toast.from);

  useEffect(() => {
    const startTimer = window.setTimeout(() => setValue(toast.to), 260);
    return () => window.clearTimeout(startTimer);
  }, [toast.to]);

  return (
    <motion.div
      className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3rem)] z-[10000] flex justify-center px-4"
      initial={{ opacity: 1, y: -42, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 1, y: -140, scale: 0.96 }}
      transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
    >
      <FlyCounter balance={value} variant="desktop" alwaysCelebrate />
    </motion.div>
  );
}
