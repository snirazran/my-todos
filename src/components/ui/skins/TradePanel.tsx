'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  generateLinearEasing,
  motion,
  spring,
  supportsLinearEasing,
  useReducedMotion,
} from 'framer-motion';
import { Check, ChevronRight, ChevronsUp, Heart, Shirt, Sparkles, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { hapticCelebrate, hapticSelect, hapticTick } from '@/lib/haptics';
import {
  creditRewardedAd,
  rewardedAdFailureMessage,
  rewardedAdsAvailable,
  showRewardedAd,
} from '@/lib/ads';
import { useRewardedAdPreload } from '@/hooks/useRewardedAdPreload';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { RewardCard, SkipAdsLink } from '@/components/ui/gift-box/RewardCard';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { skipAdsPlacement } from '@/lib/plusPaywall';
import { useAutoPopupHold } from '@/lib/popupGate';
import { useTradeConfig } from '@/hooks/useTradeConfig';
import { Icon } from '@/components/ui/Icon';
import { warmFrogStamps } from '@/lib/frogStampEngine';
import { riveDevicePixelRatio } from '@/lib/riveLoader';
import { useWishlist } from '@/hooks/useWishlist';
import type { BackgroundItem } from '@/hooks/useBackgrounds';
import { DEFAULT_BACKGROUND_ID } from '@/lib/backgrounds/constants';
import { isAvailableAt } from '@/lib/skins/availability';
import { rarityRank, type ItemDef, type Rarity, type WardrobeSlot } from '@/lib/skins/catalog';
import { sparesOf } from '@/lib/skins/tradeModifiers';
import { cn } from '@/lib/utils';
import { BackgroundArt, ClosetEmptyPrompt, ClosetFlyIcon, ItemArt, TileArt } from './DressingRoom';

type Entry = {
  key: string;
  id: string;
  kind: 'item' | 'background';
  rarity: Rarity;
  owned: number;
  name: string;
  item?: ItemDef;
  bg?: BackgroundItem;
};

type Outcome = { fresh: Entry[]; wished: Entry[] };

type TradePrize = ItemDef & { kind?: 'item' | 'background'; imageUrl?: string };

const SLIDE_SHIFT = 36;
const slideTo = (px: number) => `translateX(${px}px)`;

let slideSpring: { duration: number; easing: string } | null = null;
const getSlideSpring = () => {
  if (slideSpring) return slideSpring;
  const generator = spring({ keyframes: [0, 1], visualDuration: 0.36, bounce: 0.18 });
  let duration = 0;
  while (!generator.next(duration).done && duration < 2000) duration += 10;
  slideSpring = {
    duration,
    easing: supportsLinearEasing()
      ? generateLinearEasing(
          (progress) => generator.next(progress * duration).value as number,
          duration,
        )
      : 'cubic-bezier(0.22, 1.15, 0.36, 1)',
  };
  return slideSpring;
};

const runSlide = (el: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
  const animation = el.animate(keyframes, { ...options, fill: 'both' });
  animation.onfinish = () => {
    try {
      animation.commitStyles();
    } catch {}
    animation.cancel();
  };
  return animation;
};

const PRIMARY_BUTTON =
  'rounded-2xl bg-[#447d3f] font-black text-white shadow-[0_3px_0_0_#2c511a] transition-[transform,box-shadow,background-color] active:translate-y-0.5 active:shadow-none disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none';

const HERO_TINT: Record<Rarity, string> = {
  common:
    'from-slate-200 via-slate-100 to-slate-50 dark:from-slate-800 dark:via-slate-900 dark:to-slate-900/50',
  uncommon:
    'from-emerald-200 via-emerald-100 to-emerald-50 dark:from-emerald-900 dark:via-emerald-950 dark:to-emerald-950/50',
  rare: 'from-sky-200 via-sky-100 to-sky-50 dark:from-sky-900 dark:via-sky-950 dark:to-sky-950/50',
  epic: 'from-violet-200 via-violet-100 to-violet-50 dark:from-violet-900 dark:via-violet-950 dark:to-violet-950/50',
  legendary:
    'from-amber-200 via-amber-100 to-amber-50 dark:from-amber-900 dark:via-amber-950 dark:to-amber-950/50',
};

const PRIZE_GLOW: Record<Rarity, string> = {
  common: 'bg-white/90 dark:bg-slate-400/20',
  uncommon: 'bg-white/90 dark:bg-emerald-400/25',
  rare: 'bg-white/90 dark:bg-sky-400/25',
  epic: 'bg-white/90 dark:bg-violet-400/25',
  legendary: 'bg-white/90 dark:bg-amber-400/30',
};

const LADDER_RING: Record<Rarity, string> = {
  common: 'ring-slate-400 dark:ring-slate-500',
  uncommon: 'ring-emerald-400',
  rare: 'ring-sky-400',
  epic: 'ring-violet-400',
  legendary: 'ring-amber-400',
};

function EntryArt({ entry }: { entry: { item?: ItemDef; bg?: BackgroundItem } }) {
  if (entry.item) return <ItemArt item={entry.item} />;
  if (entry.bg) return <BackgroundArt bg={entry.bg} />;
  return null;
}

function shopLine(balance: number, label: string) {
  const kind = label.toLowerCase();
  if (balance <= 0) return `Finish tasks to earn flies for ${kind} items at the Shop!`;
  const flies = balance === 1 ? '1 fly' : `${balance.toLocaleString()} flies`;
  return `Spend your ${flies} on ${kind} items at the Shop!`;
}

function PrizeTile({
  rarity,
  outcome,
  wishlistPercent,
  charging = false,
}: {
  rarity: Rarity;
  outcome: Outcome;
  wishlistPercent: number;
  charging?: boolean;
}) {
  const wish = wishlistPercent >= 100 ? outcome.wished[0] : undefined;
  return (
    <span className="relative block w-[84px]">
      <span
        aria-hidden
        className={cn(
          'absolute -inset-6 rounded-full blur-2xl',
          PRIZE_GLOW[rarity],
          charging && 'trade-glow',
        )}
      />
      <TileArt
        rarity={rarity}
        tone="closet"
        className={cn(
          'rounded-[24px] shadow-[0_10px_24px_-10px_rgba(15,23,42,0.35)]',
          charging && 'trade-charge',
        )}
      >
        {wish ? (
          <EntryArt entry={wish} />
        ) : (
          <span
            className={cn(
              'absolute inset-0 grid place-items-center text-[38px] font-black',
              RARITY_CONFIG[rarity].text,
            )}
          >
            ?
          </span>
        )}
      </TileArt>
      {wish && (
        <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-background shadow-md">
          <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
        </span>
      )}
    </span>
  );
}

export function TradePanel({
  inventory,
  catalog,
  backgrounds = [],
  backgroundInventory = {},
  equipped = {},
  equippedBackgroundId = null,
  onTradeSuccess,
  paused = false,
  isPremium = false,
  balance = 0,
  onGoToShop,
}: {
  inventory: Record<string, number>;
  catalog: ItemDef[];
  backgrounds?: BackgroundItem[];
  backgroundInventory?: Record<string, number>;
  equipped?: Partial<Record<WardrobeSlot, string | null>>;
  equippedBackgroundId?: string | null;
  onTradeSuccess?: () => void;
  paused?: boolean;
  isPremium?: boolean;
  balance?: number;
  onGoToShop?: () => void;
}) {
  const modifiers = useTradeConfig();
  const { items: wishlistItems } = useWishlist(true);
  const [chosenFrom, setChosenFrom] = useState<Rarity | null>(null);
  const [leavingFrom, setLeavingFrom] = useState<Rarity | null>(null);
  const panelRefs = useRef(new Map<Rarity, HTMLDivElement>());
  const shownFrom = useRef<Rarity | null>(null);
  const slideAnimations = useRef<Animation[]>([]);
  const reduceMotion = useReducedMotion();
  const [picks, setPicks] = useState<string[]>([]);
  const [isTrading, setIsTrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewardQueue, setRewardQueue] = useState<TradePrize[]>([]);
  const [wasGolden, setWasGolden] = useState(false);
  const [rerollClaimId, setRerollClaimId] = useState<string | null>(null);
  const [rerollBusy, setRerollBusy] = useState(false);
  const [rerollError, setRerollError] = useState<string | null>(null);
  const [showPlusOffer, setShowPlusOffer] = useState(false);
  const [plusPlacement, setPlusPlacement] = useState('trade_reroll');
  const [mounted, setMounted] = useState(false);
  const tradeResult = rewardQueue[0] ?? null;
  useAutoPopupHold('trade-reward', !!tradeResult);
  useRewardedAdPreload('trade_reroll', !isPremium && !!tradeResult);

  useEffect(() => {
    setMounted(true);
  }, []);

  const ladder = useMemo(
    () => [...modifiers.recipes].sort((a, b) => rarityRank[a.from] - rarityRank[b.from]),
    [modifiers.recipes],
  );

  const entriesByRarity = useMemo(() => {
    const map = new Map<Rarity, Entry[]>();
    const add = (entry: Entry) => {
      const list = map.get(entry.rarity) ?? [];
      list.push(entry);
      map.set(entry.rarity, list);
    };
    for (const item of catalog) {
      const owned = inventory[item.id] ?? 0;
      if (owned <= 0 || item.slot === 'container') continue;
      add({
        key: `item:${item.id}`,
        id: item.id,
        kind: 'item',
        rarity: item.rarity,
        owned,
        name: item.name,
        item,
      });
    }
    for (const bg of backgrounds) {
      const owned = backgroundInventory[bg.id] ?? 0;
      if (owned <= 0 || bg.id === DEFAULT_BACKGROUND_ID) continue;
      add({
        key: `background:${bg.id}`,
        id: bg.id,
        kind: 'background',
        rarity: bg.rarity,
        owned,
        name: bg.name,
        bg,
      });
    }
    map.forEach((list) => list.sort((a, b) => b.owned - a.owned || a.name.localeCompare(b.name)));
    return map;
  }, [catalog, inventory, backgrounds, backgroundInventory]);

  const readyByRarity = useMemo(() => {
    const map = new Map<Rarity, number>();
    for (const step of ladder) {
      const spares = (entriesByRarity.get(step.from) ?? []).reduce(
        (sum, entry) => sum + sparesOf(entry.owned),
        0,
      );
      map.set(step.from, Math.floor(spares / Math.max(1, step.itemCount)));
    }
    return map;
  }, [ladder, entriesByRarity]);

  const warmList = useMemo(() => {
    const list: Record<string, number>[] = [];
    entriesByRarity.forEach((entries) => {
      for (const entry of entries) {
        if (entry.item) list.push({ [entry.item.slot]: entry.item.riveIndex });
      }
    });
    return list;
  }, [entriesByRarity]);

  useEffect(() => {
    if (warmList.length === 0) return;
    let cancel: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      const tile = Math.min(150, (window.innerWidth - 56) / 4);
      cancel = warmFrogStamps(warmList, Math.round(tile * 1.3 * riveDevicePixelRatio()));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      cancel?.();
    };
  }, [warmList]);

  const [artSeed] = useState(() => Math.random());

  const ladderArt = useMemo(() => {
    const roll = <T,>(list: T[], salt: number): T | undefined => {
      if (list.length === 0) return undefined;
      const x = Math.sin((artSeed + 1) * 12_9898 + salt * 78.233) * 43_758.5453;
      return list[Math.floor((x - Math.floor(x)) * list.length)];
    };
    const map = new Map<Rarity, { item: ItemDef; faded: boolean }>();
    ladder.forEach((step, index) => {
      const owned = (entriesByRarity.get(step.from) ?? [])
        .map((entry) => entry.item)
        .filter((item): item is ItemDef => !!item);
      const own = roll(owned, index);
      const sample =
        own ??
        roll(
          catalog.filter(
            (item) =>
              item.rarity === step.from &&
              item.slot !== 'container' &&
              item.slot !== 'skin' &&
              isAvailableAt(item),
          ),
          index,
        );
      if (sample) map.set(step.from, { item: sample, faded: !own });
    });
    return map;
  }, [ladder, entriesByRarity, catalog, artSeed]);

  const defaultFrom =
    ladder.find((step) => (readyByRarity.get(step.from) ?? 0) > 0)?.from ??
    ladder.find((step) => (entriesByRarity.get(step.from)?.length ?? 0) > 0)?.from ??
    ladder[0]?.from ??
    'common';
  const activeFrom = chosenFrom ?? defaultFrom;
  const recipe = ladder.find((step) => step.from === activeFrom) ?? ladder[0];
  const need = recipe?.itemCount ?? 3;
  const entries = useMemo(
    () => entriesByRarity.get(activeFrom) ?? [],
    [entriesByRarity, activeFrom],
  );

  useLayoutEffect(() => {
    const from = shownFrom.current;
    shownFrom.current = activeFrom;
    if (!from || from === activeFrom) return;
    slideAnimations.current.forEach((animation) => {
      try {
        animation.commitStyles();
      } catch {}
      animation.cancel();
    });
    slideAnimations.current = [];
    const incoming = panelRefs.current.get(activeFrom);
    const outgoing = panelRefs.current.get(from);
    if (incoming) {
      incoming.style.transform = slideTo(0);
      incoming.style.opacity = '1';
    }
    if (!incoming || reduceMotion) {
      setLeavingFrom(null);
      return;
    }
    const dir = rarityRank[activeFrom] > rarityRank[from] ? 1 : -1;
    const { duration, easing } = getSlideSpring();
    slideAnimations.current.push(
      runSlide(incoming, [{ transform: slideTo(dir * SLIDE_SHIFT) }, { transform: slideTo(0) }], {
        duration,
        easing,
      }),
      runSlide(incoming, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 200,
        delay: 60,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      }),
    );
    if (!outgoing) return;
    outgoing.style.transform = slideTo(-dir * SLIDE_SHIFT);
    outgoing.style.opacity = '0';
    const exitMove = runSlide(
      outgoing,
      [{ transform: slideTo(0) }, { transform: slideTo(-dir * SLIDE_SHIFT) }],
      { duration: 200, easing: 'cubic-bezier(0.3, 0, 1, 1)' },
    );
    slideAnimations.current.push(
      exitMove,
      runSlide(outgoing, [{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: 'linear' }),
    );
    exitMove.finished
      .then(() => setLeavingFrom((current) => (current === from ? null : current)))
      .catch(() => {});
  }, [activeFrom, reduceMotion]);

  const wishlistKeys = useMemo(
    () =>
      new Set(wishlistItems.filter((pin) => !pin.owned).map((pin) => `${pin.kind}:${pin.itemId}`)),
    [wishlistItems],
  );

  const outcome = useMemo<Outcome>(() => {
    if (!recipe) return { fresh: [], wished: [] };
    const fresh: Entry[] = [];
    for (const item of catalog) {
      if (item.rarity !== recipe.to || item.slot === 'container' || !isAvailableAt(item)) continue;
      if ((inventory[item.id] ?? 0) > 0) continue;
      fresh.push({
        key: `item:${item.id}`,
        id: item.id,
        kind: 'item',
        rarity: item.rarity,
        owned: 0,
        name: item.name,
        item,
      });
    }
    for (const bg of backgrounds) {
      if (bg.rarity !== recipe.to || bg.id === DEFAULT_BACKGROUND_ID) continue;
      if ((backgroundInventory[bg.id] ?? 0) > 0) continue;
      fresh.push({
        key: `background:${bg.id}`,
        id: bg.id,
        kind: 'background',
        rarity: bg.rarity,
        owned: 0,
        name: bg.name,
        bg,
      });
    }
    return {
      fresh,
      wished: fresh.filter((entry) => wishlistKeys.has(entry.key)),
    };
  }, [recipe, catalog, inventory, backgrounds, backgroundInventory, wishlistKeys]);

  const byKey = useMemo(() => new Map(entries.map((entry) => [entry.key, entry])), [entries]);
  const pickedCount = (key: string) => picks.filter((pick) => pick === key).length;
  const full = picks.length >= need;
  const canAutofill = !full && entries.some((entry) => pickedCount(entry.key) < entry.owned);

  useEffect(() => {
    setPicks((prev) => {
      const used = new Map<string, number>();
      const next = prev.filter((key) => {
        const entry = byKey.get(key);
        const count = (used.get(key) ?? 0) + 1;
        used.set(key, count);
        return !!entry && count <= entry.owned;
      });
      return next.length === prev.length ? prev : next;
    });
  }, [byKey]);

  const chooseRarity = (rarity: Rarity) => {
    if (rarity === activeFrom) return;
    hapticSelect();
    setLeavingFrom(activeFrom);
    setChosenFrom(rarity);
    setPicks([]);
    setError(null);
  };

  const addEntry = (entry: Entry) => {
    if (full || pickedCount(entry.key) >= entry.owned) {
      hapticTick();
      return;
    }
    hapticSelect();
    setError(null);
    setPicks((prev) => [...prev, entry.key]);
  };

  const removeAt = (index: number) => {
    if (isTrading) return;
    hapticTick();
    setPicks((prev) => prev.filter((_, i) => i !== index));
  };

  const clearPicks = () => {
    if (isTrading) return;
    hapticTick();
    setPicks([]);
    setError(null);
  };

  const tapEntry = (entry: Entry) => {
    if (isTrading) return;
    const count = pickedCount(entry.key);
    if (count > 0 && (count >= entry.owned || full)) {
      removeAt(picks.lastIndexOf(entry.key));
      return;
    }
    addEntry(entry);
  };

  const autofill = () => {
    if (isTrading) return;
    hapticSelect();
    setError(null);
    setPicks((prev) => {
      const next = [...prev];
      const taken = (key: string) => next.filter((pick) => pick === key).length;
      const fill = (list: Entry[], limit: (entry: Entry) => number) => {
        for (const entry of list) {
          while (next.length < need && taken(entry.key) < limit(entry)) next.push(entry.key);
        }
      };
      fill(
        [...entries].sort((a, b) => sparesOf(b.owned) - sparesOf(a.owned)),
        (entry) => sparesOf(entry.owned),
      );
      fill(
        [...entries].sort((a, b) => Number(isWorn(a)) - Number(isWorn(b))),
        (entry) => entry.owned,
      );
      return next;
    });
  };

  const isWorn = (entry: Entry) =>
    entry.kind === 'background'
      ? equippedBackgroundId === entry.id
      : Object.values(equipped).includes(entry.id);

  const handleTrade = async () => {
    if (!recipe || picks.length !== need || isTrading) return;
    setIsTrading(true);
    setError(null);
    try {
      const [res] = await Promise.all([
        fetch('/api/skins/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            picks: picks.map((key) => {
              const [kind, ...rest] = key.split(':');
              return { id: rest.join(':'), kind };
            }),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        }),
        new Promise((resolve) => window.setTimeout(resolve, 650)),
      ]);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Trade failed');

      setPicks([]);
      setRewardQueue(
        Array.isArray(data.rewards) && data.rewards.length > 0 ? data.rewards : [data.reward],
      );
      setWasGolden(!!data.golden);
      setRerollClaimId(data.rerollClaimId ?? null);
      setRerollError(null);
      hapticCelebrate();
      onTradeSuccess?.();
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FFD700', '#FFA500', '#FF4500'],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trade failed');
    } finally {
      setIsTrading(false);
    }
  };

  const openPlusOffer = (placement: string) => {
    setPlusPlacement(placement);
    setShowPlusOffer(true);
  };

  const handleClaimReward = () => {
    setRewardQueue((prev) => prev.slice(1));
    setRerollClaimId(null);
    setRerollError(null);
  };

  const handleReroll = async (viaPlus = false) => {
    if (rerollBusy || !rerollClaimId) return;
    setRerollBusy(true);
    setRerollError(null);
    try {
      if (!isPremium && !viaPlus) {
        const adResult = await showRewardedAd('trade_reroll');
        if (adResult !== 'rewarded') {
          if (adResult === 'failed') setRerollError(rewardedAdFailureMessage());
          return;
        }
      }
      const res = await fetch('/api/skins/trade/reroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId: rerollClaimId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.granted || !data.reward) {
        if (!isPremium && !viaPlus) creditRewardedAd('trade_reroll');
        setRerollError(data.error ?? 'Could not reroll. Try again.');
        return;
      }
      setRerollClaimId(null);
      setRewardQueue([data.reward]);
      hapticCelebrate();
      onTradeSuccess?.();
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FFD700', '#FFA500', '#FF4500'],
      });
    } finally {
      setRerollBusy(false);
    }
  };

  if (!recipe) return null;
  const to = RARITY_CONFIG[recipe.to];

  const actions = (
    <>
      {error && <p className="mb-2 text-center text-[13px] font-bold text-red-500">{error}</p>}
      <div className="flex gap-2.5">
        {picks.length > 0 && (
          <button
            type="button"
            aria-label="Clear"
            onClick={clearPicks}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-card text-muted-foreground shadow-sm ring-1 ring-border/70 transition-transform animate-in zoom-in-75 active:scale-[0.95]"
          >
            <X className="h-5 w-5" strokeWidth={3} />
          </button>
        )}
        {canAutofill && (
          <button
            type="button"
            aria-label="Auto-fill"
            onClick={autofill}
            className={cn(
              'flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-card text-[14px] font-black text-foreground shadow-sm ring-1 ring-border/70 transition-transform active:scale-[0.97]',
              picks.length > 0 ? 'w-12' : 'px-4',
            )}
          >
            <Icon name="autoFill" className="h-6 w-6" />
            {picks.length === 0 && 'Auto-fill'}
          </button>
        )}
        <button
          type="button"
          disabled={!full}
          aria-busy={isTrading || undefined}
          onClick={() => void handleTrade()}
          className={cn(
            PRIMARY_BUTTON,
            'relative flex h-12 min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden text-[15px]',
            isTrading && 'trade-busy pointer-events-none',
          )}
        >
          {isTrading ? (
            <span className="relative flex items-center gap-1.5">
              Trading
              <span aria-hidden className="flex items-center gap-[3px] pt-1">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="trade-dot h-[5px] w-[5px] rounded-full bg-white"
                    style={{ animationDelay: `${dot * 140}ms` }}
                  />
                ))}
              </span>
            </span>
          ) : (
            <span className="truncate">Trade for 1 {to.label}</span>
          )}
        </button>
      </div>
    </>
  );

  return (
    <div
      className={cn(
        'md:pb-10 md:pt-4',
        entries.length > 0
          ? 'pb-[calc(216px+env(safe-area-inset-bottom))]'
          : 'pb-[calc(152px+env(safe-area-inset-bottom))]',
      )}
    >
      <div className="md:grid md:grid-cols-[300px_minmax(0,1fr)] md:items-start md:gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8">
        <div className="md:sticky md:top-20">
          <section
            className={cn(
              'relative -mx-4 -mt-2 flex flex-col items-center overflow-hidden rounded-b-[32px] bg-gradient-to-b px-4 pb-5 pt-[calc(env(safe-area-inset-top)+16px)] md:mx-0 md:mt-0 md:rounded-[28px] md:pt-7',
              HERO_TINT[recipe.to],
            )}
          >
            <PrizeTile
              rarity={recipe.to}
              outcome={outcome}
              wishlistPercent={modifiers.wishlistRedirectPercent}
              charging={isTrading}
            />
            <span
              className={cn(
                'relative mt-3.5 rounded-full bg-background/85 px-3 py-1 text-[13px] font-black leading-none shadow-sm',
                to.text,
              )}
            >
              {outcome.fresh.length > 0 ? `New ${to.label}` : to.label}
            </span>
            <ChevronsUp aria-hidden className="my-1.5 h-5 w-5 text-foreground/25" strokeWidth={3} />
            <div className="flex justify-center gap-2">
              {Array.from({ length: need }).map((_, index) => {
                const key = picks[index];
                const entry = key ? byKey.get(key) : undefined;
                return entry ? (
                  <button
                    key={`${index}:${key}`}
                    type="button"
                    aria-label={`Take out ${entry.name}`}
                    onClick={() => removeAt(index)}
                    className={cn(
                      'relative w-[60px] active:scale-95',
                      isTrading ? 'trade-fuse' : 'animate-in fade-in zoom-in-75',
                    )}
                    style={
                      {
                        '--fuse-x': `${((need - 1) / 2 - index) * 68}px`,
                        animationDelay: isTrading ? `${index * 70}ms` : undefined,
                      } as React.CSSProperties
                    }
                  >
                    <TileArt rarity={recipe.from} tone="closet" className="rounded-2xl shadow-sm">
                      <EntryArt entry={entry} />
                    </TileArt>
                  </button>
                ) : (
                  <span
                    key={index}
                    className="aspect-square w-[60px] rounded-2xl border-2 border-dashed border-foreground/20 bg-background/55"
                  />
                );
              })}
            </div>
          </section>

          <div role="tablist" aria-label="Rarity to trade" className="mt-5 flex items-start">
            {ladder.map((step, index) => {
              const active = step.from === activeFrom;
              const ready = readyByRarity.get(step.from) ?? 0;
              const art = ladderArt.get(step.from);
              const config = RARITY_CONFIG[step.from];
              return (
                <React.Fragment key={step.from}>
                  {index > 0 && (
                    <ChevronRight
                      aria-hidden
                      className="mt-[22px] h-4 w-4 shrink-0 text-muted-foreground/40"
                      strokeWidth={3}
                    />
                  )}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-label={`${config.label}${ready > 0 ? `, ${ready} ready` : ''}`}
                    onClick={() => chooseRarity(step.from)}
                    className="flex min-w-0 flex-1 flex-col items-center gap-2 transition-transform active:scale-95"
                  >
                    <span
                      className={cn(
                        'relative block w-[60px] max-w-full transition-[transform,opacity] duration-200',
                        active ? '-translate-y-0.5' : 'opacity-60',
                      )}
                    >
                      <TileArt
                        rarity={step.from}
                        tone="closet"
                        className={cn(
                          'rounded-[18px] ring-2 ring-offset-2 ring-offset-background transition-shadow',
                          active ? LADDER_RING[step.from] : 'ring-transparent',
                        )}
                      >
                        {art && <ItemArt item={art.item} faded={art.faded} />}
                      </TileArt>
                      {ready > 0 && (
                        <span className="absolute -right-2 -top-2 grid h-5 min-w-[20px] place-items-center rounded-full bg-amber-500 px-1 text-[11px] font-black leading-none text-white shadow-sm ring-2 ring-background">
                          {ready > 9 ? '9+' : ready}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'max-w-full truncate text-[12px] font-black leading-none',
                        active ? config.text : 'text-muted-foreground',
                      )}
                    >
                      {config.label}
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {entries.length > 0 && <div className="mt-6 hidden md:block">{actions}</div>}
        </div>

        <div className="relative mt-5 md:mt-0">
          {ladder.map((step) => {
            const list = entriesByRarity.get(step.from) ?? [];
            const shown = step.from === activeFrom;
            const leaving = !shown && step.from === leavingFrom;
            return (
              <div
                key={step.from}
                ref={(node) => {
                  if (node) panelRefs.current.set(step.from, node);
                  else panelRefs.current.delete(step.from);
                }}
                role="tabpanel"
                aria-label={RARITY_CONFIG[step.from].label}
                aria-hidden={!shown || undefined}
                className={cn(
                  !shown && 'pointer-events-none absolute inset-x-0 top-0',
                  !shown && !leaving && 'invisible h-0 overflow-hidden',
                )}
              >
                {list.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-5 xl:grid-cols-6">
                    {list.map((entry) => {
                      const count = pickedCount(entry.key);
                      const left = entry.owned - count;
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          aria-pressed={count > 0}
                          aria-label={`${entry.name}${left > 1 ? `, ${left} left` : ''}`}
                          onClick={() => tapEntry(entry)}
                          className="relative transition-transform active:scale-95"
                        >
                          <TileArt rarity={step.from} tone="closet">
                            <EntryArt entry={entry} />
                            {isWorn(entry) && (
                              <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-sky-500 text-white shadow-sm">
                                <Shirt className="h-3 w-3" strokeWidth={3} />
                              </span>
                            )}
                            {count > 0 && (
                              <span className="absolute inset-0 rounded-2xl bg-[#447d3f]/10 ring-[3px] ring-inset ring-[#447d3f]" />
                            )}
                          </TileArt>
                          {left > 1 && (
                            <span className="absolute right-1 top-1 rounded-full bg-background/95 px-1.5 text-[11px] font-black leading-[18px] text-foreground shadow-sm">
                              ×{left}
                            </span>
                          )}
                          {count > 0 && (
                            <span className="absolute bottom-1 right-1 grid h-6 min-w-[24px] place-items-center rounded-full bg-[#447d3f] px-1 text-[12px] font-black leading-none text-white shadow-sm animate-in zoom-in-50">
                              {count > 1 ? (
                                count
                              ) : (
                                <Check className="h-3.5 w-3.5" strokeWidth={4} />
                              )}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <ClosetEmptyPrompt
                    icon={<ClosetFlyIcon />}
                    line={shopLine(balance, RARITY_CONFIG[step.from].label)}
                    action={onGoToShop ? { label: 'Visit shop', onClick: onGoToShop } : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {mounted &&
        entries.length > 0 &&
        createPortal(
          <div
            data-fly-fade
            className="fixed inset-x-0 bottom-[calc(136px+env(safe-area-inset-bottom))] z-50 border-t border-border/50 bg-background md:hidden"
          >
            <div className="mx-auto max-w-md px-4 pb-2 pt-2.5">{actions}</div>
          </div>,
          document.body,
        )}

      {mounted &&
        tradeResult &&
        createPortal(
          <div className="pointer-events-auto fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-0 flex items-center justify-center"
            >
              <RotatingRays colorClass={RARITY_CONFIG[tradeResult.rarity].rays} />
            </motion.div>
            <div className="relative z-10 flex w-full max-w-md flex-col items-center justify-center p-6">
              {wasGolden && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  className="mb-3 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-3.5 py-1.5 text-[13px] font-black text-amber-950 shadow-lg shadow-amber-500/30"
                >
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={3} />
                  Lucky trade! Two items
                  {rewardQueue.length > 1 && <span>· 1 of 2</span>}
                </motion.div>
              )}
              <RewardCard
                key={`card-${tradeResult.id}-${rerollClaimId ?? 'rerolled'}`}
                prize={tradeResult}
                claiming={false}
                onClaim={handleClaimReward}
                paused={paused}
                offerEquip
                reroll={
                  rerollClaimId
                    ? {
                        mode: isPremium ? 'included' : rewardedAdsAvailable() ? 'ad' : 'plus',
                        busy: rerollBusy,
                        onClick: () => {
                          if (isPremium || rewardedAdsAvailable()) void handleReroll();
                          else openPlusOffer('trade_reroll');
                        },
                        footer: (
                          <>
                            {!isPremium && rewardedAdsAvailable() && (
                              <SkipAdsLink
                                featured
                                label="Free rerolls with Plus"
                                placement="trade_reroll"
                                disabled={rerollBusy}
                                onClick={() => openPlusOffer(skipAdsPlacement('trade_reroll'))}
                                className="mt-2"
                              />
                            )}
                            {rerollError && (
                              <p className="mt-1 text-center text-xs font-bold text-red-300">
                                {rerollError}
                              </p>
                            )}
                          </>
                        ),
                      }
                    : undefined
                }
              />
            </div>
          </div>,
          document.body,
        )}

      <PlusUpgradeModal
        open={showPlusOffer}
        placement={plusPlacement}
        onStartTrial={async () => {
          if (rerollClaimId) await handleReroll(true);
        }}
        onClose={() => setShowPlusOffer(false)}
      />
    </div>
  );
}
