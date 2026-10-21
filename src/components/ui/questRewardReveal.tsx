'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { FlyGlyph, PlusOfferButton, RewardCard } from './gift-box/RewardCard';
import { afterAdPlacement } from '@/lib/plusPaywall';
import GiftBoxOpening from './gift-box/GiftBoxOpening';
import { RotatingRays } from './gift-box/RotatingRays';
import { RARITY_CONFIG as GIFT_RARITY_CONFIG } from './gift-box/constants';
import Fly from './fly';
import { FlyCounter } from './FlyCounter';
import { rarityRank, type ItemDef } from '@/lib/skins/catalog';
import {
  mutateInventoryCaches,
  patchInventoryFlies,
} from '@/hooks/useInventory';
import { markFlyEarn, markFliesFlown } from '@/lib/flyEarn';
import {
  flyCounterState,
  flyFliesToCounter,
  holdFlyCounter,
} from '@/lib/flyFlight';
import {
  creditRewardedAd,
  rewardedAdFailureMessage,
  rewardedAdsAvailable,
  showRewardedAd,
  takePlusOfferAfterAd,
} from '@/lib/ads';
import { useNotification } from '@/components/providers/NotificationProvider';
import { X } from 'lucide-react';
import { useUIStore } from '@/lib/uiStore';
import { hapticCelebrate, hapticSuccess, hapticTick } from '@/lib/haptics';
import { maybeRequestAppRating, type RatingMoment } from '@/lib/rateApp';
import { useRiveInteractionPause } from '@/lib/riveInteractionPause';
import { emitCampaignTrigger, setCampaignBusy } from '@/lib/campaigns/orchestrator';
import { useAutoPopupHold } from '@/lib/popupGate';
import { useRewardedAdPreload } from '@/hooks/useRewardedAdPreload';
import { cn } from '@/lib/utils';

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
  launch?: DOMRect;
  onLanded?: () => void;
};

type RevealHostState = {
  queue: QuestRewardRevealEntry[];
  giftOpening: {
    entry: QuestRewardRevealEntry;
    remaining: number;
    instance: number;
  } | null;
  flyGainToast: FlyGainToast | null;
  interlude: boolean;
  flyOffer: FlyDoubleOffer | null;
  flying: number;
};

type FlyDoubleOffer = {
  id: number;
  amount: number;
  placement: string;
  notBefore: number;
  run: () => Promise<{ bonus: number; balanceAfter?: number }>;
};

export type FlyRewardDouble = FlyDoubleOffer['run'];

// One reveal pipeline for the whole app: any page enqueues claim summaries,
// the single host (mounted in providers) plays them. Module-level so the
// toast's Claim works from home/planner without each page mounting its own.
const revealStore = createStore<RevealHostState>(() => ({
  queue: [],
  giftOpening: null,
  flyGainToast: null,
  interlude: false,
  flyOffer: null,
  flying: 0,
}));

type PressedSource = {
  el: Element;
  source: Element | null;
  rect: DOMRect;
  at: number;
};

let lastPressed: PressedSource | null = null;

function centerOf(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function nearestFlySource(pressed: Element): Element | null {
  const own = pressed.closest('[data-fly-source]');
  if (own) return own;
  const origin = centerOf(pressed.getBoundingClientRect());
  let node: Element | null = pressed.parentElement;
  for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
    if (node === document.body || node === document.documentElement) break;
    const found = Array.from(node.querySelectorAll('[data-fly-source]'));
    if (!found.length) continue;
    let best: Element | null = null;
    let bestDistance = Infinity;
    for (const candidate of found) {
      const point = centerOf(candidate.getBoundingClientRect());
      const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }
  return null;
}

if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!(event.target instanceof Element)) return;
      const el =
        event.target.closest('button,[role="button"],a') ?? event.target;
      const source = nearestFlySource(el);
      lastPressed = {
        el,
        source,
        rect: (source ?? el).getBoundingClientRect(),
        at: Date.now(),
      };
    },
    { capture: true, passive: true },
  );
}

function visibleRect(el: Element | null | undefined): DOMRect | null {
  if (!el || !el.isConnected) return null;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight
    ? rect
    : null;
}

function launchRect(source?: Element | DOMRect | null): DOMRect {
  if (source instanceof DOMRect) return source;
  const explicit = visibleRect(source);
  if (explicit) return explicit;
  const pressed =
    lastPressed && Date.now() - lastPressed.at < 8000 ? lastPressed : null;
  if (pressed) {
    const live = visibleRect(pressed.source);
    if (live) return live;
    const snap = pressed.rect;
    if (snap.width > 0 && snap.bottom > 0 && snap.top < window.innerHeight) {
      return snap;
    }
    const button = visibleRect(pressed.el);
    if (button) return button;
  }
  return new DOMRect(window.innerWidth / 2 - 20, window.innerHeight * 0.55, 40, 40);
}

let flyOfferCounter = 0;

const COUNTER_WAIT_MS = 900;

function landFlies(
  amount: number,
  balanceAfter: number | undefined,
  source?: Element | DOMRect | null,
) {
  if (amount <= 0) return;
  const from = launchRect(source);
  revealStore.setState((state) => ({ flying: state.flying + 1 }));
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    revealStore.setState((state) => ({ flying: Math.max(0, state.flying - 1) }));
  };

  const start = (counterVisible: boolean) => {
    const before =
      typeof balanceAfter === 'number' ? balanceAfter - amount : knownFlyBalance;
    const release = holdFlyCounter();
    markFlyEarn();
    markFliesFlown(amount);
    if (typeof balanceAfter === 'number') {
      knownFlyBalance = balanceAfter;
      patchInventoryFlies(balanceAfter);
    }
    mutateInventoryCaches();
    hapticSuccess();
    if (!counterVisible) {
      release();
      revealStore.setState({
        flyGainToast: {
          id: ++toastIdCounter,
          amount,
          from: Math.max(0, before),
          to: Math.max(0, before) + amount,
          launch: from,
          onLanded: done,
        },
      });
      window.setTimeout(done, 3200);
      return;
    }
    flyFliesToCounter({
      from,
      count: amount,
      onFirstLand: release,
      onAllLanded: done,
    });
    window.setTimeout(release, 2500);
    window.setTimeout(done, 3200);
  };

  const counter = flyCounterState();
  if (counter === 'shown') {
    start(true);
    return;
  }
  if (counter === 'faded' || !useUIStore.getState().isFirstRunGuided) {
    start(false);
    return;
  }
  const waitStarted = Date.now();
  const poll = () => {
    if (flyCounterState() === 'shown') {
      window.setTimeout(() => start(true), 120);
    } else if (Date.now() - waitStarted > COUNTER_WAIT_MS) {
      start(false);
    } else {
      window.setTimeout(poll, 60);
    }
  };
  poll();
}

/**
 * Flies are the everyday reward, so they skip the reveal card: they fly from
 * whatever was pressed straight into the counter, and doubling is offered as a
 * dismissible toast instead of a second decision on a blocking card.
 */
export function presentFlyReward({
  amount,
  balanceAfter,
  source,
  double,
  placement = 'double_reward',
  offerDelayMs = 650,
}: {
  amount: number;
  balanceAfter?: number;
  source?: Element | DOMRect | null;
  double?: FlyRewardDouble | null;
  placement?: string;
  offerDelayMs?: number;
}) {
  const granted = Math.max(0, Math.floor(amount));
  if (granted <= 0) return;
  landFlies(granted, balanceAfter, source);
  if (double && rewardedAdsAvailable()) {
    revealStore.setState({
      flyOffer: {
        id: ++flyOfferCounter,
        amount: granted,
        placement,
        notBefore: Date.now() + offerDelayMs,
        run: double,
      },
    });
  }
}

const INTERLUDE_MS = 1100;
let interludeTimer: ReturnType<typeof setTimeout> | null = null;

function startInterlude() {
  if (interludeTimer) clearTimeout(interludeTimer);
  revealStore.setState({ interlude: true });
  interludeTimer = setTimeout(() => {
    interludeTimer = null;
    revealStore.setState({ interlude: false });
  }, INTERLUDE_MS);
}

let revealIdCounter = 0;
let toastIdCounter = 0;
let knownFlyBalance = 0;
let doublingClaim = false;
let revealWasDelightful = false;
let revealMoment: RatingMoment = 'quest_reward';

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
  return useStore(revealStore, (state) => state.queue.length + state.flying);
}

export function enqueueQuestRewardReveal(
  summary: QuestRewardSummary | undefined,
  options: {
    catalog: RevealCatalog;
    isPremium: boolean;
    // Pages whose own header counter already animates the gain (home) pass
    // false so the balance isn't celebrated twice.
    showFlyGainPill?: boolean;
    moment?: RatingMoment;
    source?: Element | DOMRect | null;
  },
): number {
  const { catalog, isPremium } = options;
  if (options.moment) {
    revealWasDelightful = true;
    revealMoment = options.moment;
  }
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
    // Doubling only ever touches flies and the prizes inside a gift, so an item
    // card carries neither the "×2 Plus" split nor the watch-an-ad offer.
    nextEntries.push({
      key,
      item: item as QuestRewardRevealEntry['item'],
      quantity: count > 1 ? count : undefined,
      isQuestReward: true,
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
      isQuestReward: true,
      grantPremium: isPremium,
      suppressFlyPill,
    });
  }

  if (!nextEntries.length) return 0;
  const [flyEntry, ...prizeEntries] = nextEntries;
  if (flyEntry.fliesGranted) {
    const claimId = flyEntry.doubleClaimId;
    presentFlyReward({
      amount: flyEntry.fliesGranted,
      balanceAfter: flyEntry.flyBalanceAfter,
      source: options.source,
      placement: 'quest_reward_double',
      offerDelayMs: prizeEntries.length ? 1400 : 650,
      double:
        claimId && !isPremium
          ? async () => {
              const res = await fetch('/api/rewards/double', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ claimId }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok || !data?.granted) {
                throw new Error('Could not double this reward — try again later.');
              }
              const balanceAfter =
                typeof data?.summary?.flyBalanceAfter === 'number'
                  ? data.summary.flyBalanceAfter
                  : knownFlyBalance + (flyEntry.fliesGranted ?? 0);
              return { bonus: flyEntry.fliesGranted ?? 0, balanceAfter };
            }
          : null,
    });
    if (prizeEntries.length) {
      window.setTimeout(() => {
        revealStore.setState((state) => ({
          queue: [...state.queue, ...prizeEntries],
        }));
      }, 900);
    }
    return prizeEntries.length;
  }
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
  if (
    entry &&
    entry.item.slot !== 'container' &&
    rarityRank[entry.item.rarity] >= rarityRank.rare
  ) {
    revealWasDelightful = true;
  }
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
  if (
    entry &&
    entry.item.slot !== 'container' &&
    revealStore.getState().queue.length > 1
  ) {
    startInterlude();
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
    const res = await fetch('/api/rewards/double', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.granted) {
      throw new Error('Could not double this reward — try again later.');
    }
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
          next.item = createFlyRewardItem(next.fliesGranted);
          next.flyBalanceAfter = balanceAfter;
          knownFlyBalance = balanceAfter;
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
  revealWasDelightful = true;
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

const OFFER_MS = 8000;
const OFFER_ENTER_DELAY_MS = 650;

function FlyDoubleOffer() {
  const offer = useStore(revealStore, (state) => state.flyOffer);
  const { showNotification } = useNotification();
  const setPremiumModalOpen = useUIStore((state) => state.setPremiumModalOpen);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const remainingRef = useRef(OFFER_MS);

  useRewardedAdPreload(offer?.placement ?? 'double_reward', visible && !!offer);

  const revealBusy = useStore(
    revealStore,
    (state) => state.queue.length > 0 || !!state.giftOpening,
  );

  useEffect(() => {
    if (!offer) return;
    remainingRef.current = OFFER_MS;
    setBusy(false);
    setHeld(false);
  }, [offer]);

  const shownOfferRef = useRef<number | null>(null);
  useEffect(() => {
    if (!offer || revealBusy || visible || shownOfferRef.current === offer.id) return;
    const wait = Math.max(OFFER_ENTER_DELAY_MS, offer.notBefore - Date.now());
    const enter = window.setTimeout(() => {
      const state = revealStore.getState();
      if (state.queue.length > 0 || state.giftOpening) return;
      shownOfferRef.current = offer.id;
      setVisible(true);
    }, wait);
    return () => window.clearTimeout(enter);
  }, [offer, revealBusy, visible]);

  useEffect(() => {
    if (!visible || busy || held) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => setVisible(false), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [visible, busy, held]);

  if (typeof document === 'undefined') return null;

  const dismiss = () => setVisible(false);
  const double = async () => {
    if (!offer || busy) return;
    setBusy(true);
    try {
      const outcome = await showRewardedAd(offer.placement);
      if (outcome !== 'rewarded') {
        if (outcome === 'failed') showNotification(rewardedAdFailureMessage());
        return;
      }
      const { bonus, balanceAfter } = await offer.run().catch((err) => {
        creditRewardedAd(offer.placement);
        throw err;
      });
      landFlies(bonus, balanceAfter, panelRef.current);
      setVisible(false);
      if (takePlusOfferAfterAd()) {
        window.setTimeout(() => setPremiumModalOpen(true, afterAdPlacement(offer.placement)), 1600);
      }
    } catch (err) {
      showNotification(
        err instanceof Error && err.message
          ? err.message
          : 'Could not double this reward — try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <AnimatePresence
      onExitComplete={() => {
        if (!revealStore.getState().flyOffer) return;
        revealStore.setState({ flyOffer: null });
      }}
    >
      {offer && visible && (
        <motion.div
          key={offer.id}
          ref={panelRef}
          role="region"
          aria-label="Double your flies"
          initial={{ opacity: 0, y: 28, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96, transition: { duration: 0.2, ease: 'easeIn' } }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocusCapture={() => setHeld(true)}
          onBlurCapture={() => setHeld(false)}
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-[1310] mx-auto w-[min(calc(100vw-24px),360px)] md:bottom-[calc(env(safe-area-inset-bottom)+24px)]"
        >
          <PlusOfferButton
            mode="ad"
            intent="double"
            visual={<FlyGlyph />}
            badge="×2"
            title="Double your reward"
            anchor={{ from: offer.amount, to: offer.amount * 2, unit: 'flies', ready: true }}
            busy={busy}
            busyLabel="Loading ad..."
            onClick={() => void double()}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-5 -bottom-1.5 h-[3px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
          >
            <span
              key={offer.id}
              className="block h-full origin-left rounded-full bg-amber-400"
              style={{
                animation: `toast-countdown ${OFFER_MS}ms linear forwards`,
                animationPlayState: busy || held ? 'paused' : 'running',
              }}
            />
          </span>
          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            aria-label="No thanks"
            className="absolute -right-2 -top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-slate-900/80 text-white shadow-md ring-2 ring-white/70 transition-transform active:scale-90 disabled:opacity-50 dark:ring-black/40"
          >
            <X className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function QuestRewardRevealHost() {
  const { queue, giftOpening, flyGainToast, interlude } = useStore(revealStore);

  // The reveal covers the page with a near-opaque backdrop, but it isn't a
  // sheet, so nothing paused the ambient Rives (home frog flies, card flies)
  // burning frames underneath it. Hold the global interaction pause while a
  // reveal or gift-opening is on screen; the overlay's own Rives opt out via
  // alwaysPlay.
  const revealActive = queue.length > 0 || !!giftOpening;
  useAutoPopupHold('quest-reveal', revealActive);
  useEffect(() => {
    if (!revealActive) return;
    const { acquire, release } = useRiveInteractionPause.getState();
    acquire();
    return release;
  }, [revealActive]);

  useEffect(() => {
    setCampaignBusy('quest-reveal', revealActive);
  }, [revealActive]);

  const prevRevealCountRef = useRef(0);
  useEffect(() => {
    if (prevRevealCountRef.current > 0 && queue.length === 0) {
      emitCampaignTrigger('quest_claimed');
      if (revealWasDelightful) maybeRequestAppRating(revealMoment);
      revealWasDelightful = false;
      revealMoment = 'quest_reward';
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
        interlude={interlude}
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
      <FlyDoubleOffer />
    </>
  );
}

function QuestRewardRevealOverlay({
  queue,
  onClaim,
  onOpenGift,
  onWatchAd,
  interlude = false,
  paused = false,
}: {
  queue: QuestRewardRevealEntry[];
  onClaim: (entry: QuestRewardRevealEntry) => void;
  onOpenGift: (entry: QuestRewardRevealEntry) => void;
  onWatchAd: (entry: QuestRewardRevealEntry) => void | Promise<void>;
  interlude?: boolean;
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
          className={cn(
            'fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden',
            interlude ? 'pointer-events-none' : 'pointer-events-auto',
          )}
        >
          <motion.div
            className="absolute inset-0"
            initial={false}
            animate={{ opacity: interlude ? 0 : 1 }}
            transition={{ duration: interlude ? 0.22 : 0.3, ease: 'easeOut' }}
          >
            <div className="absolute inset-0 bg-slate-950/90" />
            <div className="absolute inset-0 z-0 flex items-center justify-center">
              <RotatingRays
                colorClass={GIFT_RARITY_CONFIG[entry.item.rarity].rays}
              />
              <div className="absolute inset-0 bg-radial-gradient from-transparent to-slate-950/80" />
            </div>
          </motion.div>
          <AnimatePresence mode="wait">
          {!interlude && (
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
              isPremium={
                isPremium && !!entry.isQuestReward && !!entry.fliesGranted
              }
              showDoubleUpsell={
                !isPremium &&
                !!entry.isQuestReward &&
                !!entry.doubleClaimId &&
                !entry.doubled
              }
              onWatchAd={() => onWatchAd(entry)}
              doublePlacement="quest_reward_double"
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
              flyCollectAmount={entry.fliesGranted}
            />
          </motion.div>
          )}
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
const PILL_ENTER_MS = 420;

function FlyGainPill({ toast }: { toast: FlyGainToast }) {
  const [value, setValue] = useState(toast.from);
  const pillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const { launch, onLanded } = toast;
    if (!launch) {
      const startTimer = window.setTimeout(() => setValue(toast.to), 260);
      return () => window.clearTimeout(startTimer);
    }
    const launchTimer = window.setTimeout(() => {
      const pill = pillRef.current;
      flyFliesToCounter({
        from: launch,
        to: pill?.querySelector('.fly-purse-pad') ?? pill,
        count: toast.amount,
        onFirstLand: () => setValue(toast.to),
        onAllLanded: onLanded,
      });
    }, PILL_ENTER_MS);
    return () => window.clearTimeout(launchTimer);
  }, [toast]);

  return (
    <motion.div
      ref={pillRef}
      className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3rem)] z-[10000] flex justify-center px-4"
      initial={{ opacity: 1, y: -42, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 1, y: -140, scale: 0.96 }}
      transition={{ duration: PILL_ENTER_MS / 1000, ease: [0.32, 0.72, 0, 1] }}
    >
      <FlyCounter balance={value} variant="desktop" alwaysCelebrate />
    </motion.div>
  );
}
