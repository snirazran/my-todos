'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import confetti from 'canvas-confetti';
import { Sparkles } from 'lucide-react';
import type { SweepReward, SweepRollEntry } from '@/lib/models/QuestStreakConfig';
import type { Rarity } from '@/lib/skins/catalog';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { hapticCelebrate, hapticImpact, hapticTick } from '@/lib/haptics';
import { useAutoPopupHold } from '@/lib/popupGate';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import {
  enqueueQuestRewardReveal,
  type QuestRewardSummary,
  type RevealCatalog,
} from '@/components/ui/questRewardReveal';
import { cn } from '@/lib/utils';

type RolledSummary = QuestRewardSummary & {
  rolled?: {
    tier: 'standard' | 'golden';
    mega: boolean;
    reward: SweepReward | null;
    megaRewards: SweepReward[];
    table?: SweepRollEntry[];
  };
};

type RevealOptions = Parameters<typeof enqueueQuestRewardReveal>[1];

type RollRequest = {
  id: number;
  summary: RolledSummary;
  options: RevealOptions;
};

const rollStore = createStore<{ roll: RollRequest | null }>(() => ({ roll: null }));
let rollCounter = 0;

/**
 * Sweep claims arrive with the table they were drawn from, so the reel can
 * show the real prize pool before landing on the prize the server already
 * granted. Everything else goes straight to the reveal pipeline.
 */
export function revealSweepClaim(
  summary: RolledSummary | undefined,
  options: RevealOptions,
) {
  const rolled = summary?.rolled;
  if (summary && rolled?.reward && rolled.table?.some((entry) => entry.chance > 0)) {
    rollStore.setState({ roll: { id: ++rollCounter, summary, options } });
    return;
  }
  enqueueQuestRewardReveal(summary, options);
}

type TileArt = 'fly' | 'gift' | 'lily' | 'mystery' | 'item' | 'background';

type RollTile = {
  key: string;
  art: TileArt;
  rarity: Rarity;
  label: string;
  title: string;
  amount?: number;
  giftColor?: number;
  itemId?: string;
  slot?: string;
  riveIndex?: number;
  imageUrl?: string;
};

const GIFT_RARITY: Record<string, { rarity: Rarity; color: number; title: string }> = {
  gift_box_1: { rarity: 'common', color: 0, title: 'Gift' },
  gift_box_rare: { rarity: 'rare', color: 1, title: 'Rare Gift' },
  gift_box_legendary: { rarity: 'legendary', color: 2, title: 'Legendary Gift' },
};

function rewardKey(reward: SweepReward): string {
  const r = reward as Record<string, unknown>;
  return [r.type, r.itemId ?? r.backgroundId ?? '', r.rarity ?? '', r.amount ?? ''].join(':');
}

function flyRarity(amount: number): Rarity {
  if (amount >= 100) return 'epic';
  if (amount >= 50) return 'rare';
  if (amount >= 25) return 'uncommon';
  return 'common';
}

function tileFor(reward: SweepReward, catalog: RevealCatalog): RollTile {
  const r = reward as Record<string, any>;
  const key = rewardKey(reward);
  if (r.type === 'FLIES') {
    const amount = Math.max(0, Number(r.amount) || 0);
    return { key, art: 'fly', rarity: flyRarity(amount), label: `+${amount}`, title: `${amount} flies`, amount };
  }
  if (r.type === 'BOX') {
    const gift = GIFT_RARITY[r.itemId] ?? {
      rarity: (catalog[r.itemId]?.rarity as Rarity) ?? 'common',
      color: catalog[r.itemId]?.riveIndex ?? 0,
      title: catalog[r.itemId]?.name ?? 'Gift',
    };
    return { key, art: 'gift', rarity: gift.rarity, label: RARITY_CONFIG[gift.rarity].label, title: gift.title, giftColor: gift.color };
  }
  if (r.type === 'SHIELD') {
    return { key, art: 'lily', rarity: 'uncommon', label: 'Lily Pad', title: 'Lily Pad' };
  }
  if (r.type === 'RARITY_ITEM' && !r.itemId) {
    const rarity = (r.rarity as Rarity) ?? 'epic';
    return { key, art: 'mystery', rarity, label: RARITY_CONFIG[rarity].label, title: `${RARITY_CONFIG[rarity].label} outfit` };
  }
  if (r.type === 'BACKGROUND') {
    const meta = catalog[r.backgroundId];
    const rarity = (meta?.rarity as Rarity) ?? 'rare';
    return { key, art: 'background', rarity, label: RARITY_CONFIG[rarity].label, title: meta?.name ?? 'Background', imageUrl: meta?.imageUrl };
  }
  const meta = catalog[r.itemId];
  const rarity = (meta?.rarity as Rarity) ?? (r.rarity as Rarity) ?? 'rare';
  return {
    key,
    art: 'item',
    rarity,
    label: RARITY_CONFIG[rarity].label,
    title: meta?.name ?? `${RARITY_CONFIG[rarity].label} outfit`,
    itemId: r.itemId,
    slot: meta?.slot,
    riveIndex: meta?.riveIndex,
  };
}

const GiftStampContext = React.createContext<Record<number, string>>({});

const STAMP_DELAY_MS = 650;
const STAMP_TIMEOUT_MS = 2500;

const GIFT_FRAME_PX = 146;
const GIFT_BOX_CENTER = 0.715;
const GIFT_FRAME_STYLE: React.CSSProperties = {
  width: GIFT_FRAME_PX,
  height: GIFT_FRAME_PX,
  transform: `translateY(${-Math.round((GIFT_BOX_CENTER - 0.5) * GIFT_FRAME_PX)}px)`,
};

function hasInk(canvas: HTMLCanvasElement) {
  const probe = document.createElement('canvas');
  probe.width = 32;
  probe.height = 32;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(canvas, 0, 0, 32, 32);
  const data = ctx.getImageData(0, 0, 32, 32).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 24) return true;
  }
  return false;
}

function GiftStamp({ color, onStamp }: { color: number; onStamp: (color: number, url: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let attempts = 0;
    let timer = 0;
    const capture = () => {
      if (document.visibilityState !== 'visible') {
        timer = window.setTimeout(capture, 300);
        return;
      }
      const canvas = ref.current?.querySelector('canvas');
      if (canvas instanceof HTMLCanvasElement && canvas.width > 0) {
        try {
          if (hasInk(canvas)) {
            onStamp(color, canvas.toDataURL('image/png'));
            return;
          }
        } catch {}
      }
      attempts += 1;
      if (attempts < 12) timer = window.setTimeout(capture, 150);
    };
    timer = window.setTimeout(capture, STAMP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [color, onStamp]);
  return (
    <div ref={ref} style={{ width: GIFT_FRAME_PX, height: GIFT_FRAME_PX }}>
      <GiftRive color={color} className="h-full w-full" />
    </div>
  );
}

function useGiftStamps(colors: number[]) {
  const [stamps, setStamps] = useState<Record<number, string>>({});
  const [timedOut, setTimedOut] = useState(false);
  const wanted = useMemo(() => Array.from(new Set(colors)).sort(), [colors]);
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'visible') {
        timer = window.setTimeout(() => setTimedOut(true), STAMP_TIMEOUT_MS);
      }
    };
    arm();
    document.addEventListener('visibilitychange', arm);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', arm);
    };
  }, []);
  const onStamp = React.useCallback((color: number, url: string) => {
    setStamps((current) => (current[color] ? current : { ...current, [color]: url }));
  }, []);
  const pending = wanted.filter((color) => !stamps[color]);
  const ready = pending.length === 0 || timedOut;
  const nodes = ready ? null : (
    <div aria-hidden className="pointer-events-none absolute left-0 top-0 flex opacity-0">
      {pending.map((color) => (
        <GiftStamp key={color} color={color} onStamp={onStamp} />
      ))}
    </div>
  );
  return { stamps, ready, nodes };
}

const TILE_W = 88;
const TILE_GAP = 10;
const STRIDE = TILE_W + TILE_GAP;
const TILE_COUNT = 34;
const WINNER_INDEX = 28;
const START_INDEX = 2;
const WINDUP_PX = 22;
const SETTLE_PX = 10;

function buildStrip(table: SweepRollEntry[], winner: SweepReward, catalog: RevealCatalog) {
  const entries = table.filter((entry) => entry.chance > 0 && entry.reward);
  const total = entries.reduce((sum, entry) => sum + entry.chance, 0);
  const pick = () => {
    let roll = Math.random() * total;
    for (const entry of entries) {
      roll -= entry.chance;
      if (roll <= 0) return entry.reward;
    }
    return entries[entries.length - 1].reward;
  };
  const tiles: RollTile[] = [];
  for (let index = 0; index < TILE_COUNT; index += 1) {
    tiles.push(tileFor(index === WINNER_INDEX ? winner : pick(), catalog));
  }
  const odds = entries
    .map((entry) => ({ tile: tileFor(entry.reward, catalog), chance: (entry.chance / total) * 100 }))
    .sort((a, b) => b.chance - a.chance);
  return { tiles, odds };
}

function GiftStill({ color }: { color: number }) {
  const stamps = React.useContext(GiftStampContext);
  const stamp = stamps[color];
  return stamp ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={stamp} alt="" draggable={false} className="max-w-none shrink-0 object-contain" style={GIFT_FRAME_STYLE} />
  ) : (
    <span className="block shrink-0" style={GIFT_FRAME_STYLE} />
  );
}

const LIVE_GIFT_HANDOFF_MS = 350;

function GiftArt({ color, live }: { color: number; live: boolean }) {
  const [liveShown, setLiveShown] = useState(false);
  useEffect(() => {
    if (!live) {
      setLiveShown(false);
      return;
    }
    const timer = window.setTimeout(() => setLiveShown(true), LIVE_GIFT_HANDOFF_MS);
    return () => window.clearTimeout(timer);
  }, [live]);
  return (
    <span className="relative block shrink-0" style={{ width: GIFT_FRAME_PX, height: GIFT_FRAME_PX }}>
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{ visibility: liveShown ? 'hidden' : 'visible' }}
      >
        <GiftStill color={color} />
      </span>
      {live && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="block shrink-0" style={GIFT_FRAME_STYLE}>
            <GiftRive color={color} className="h-full w-full" />
          </span>
        </span>
      )}
    </span>
  );
}

function TileArtView({ tile, live }: { tile: RollTile; live?: boolean }) {
  if (tile.art === 'fly') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/widgets/Fly.svg" alt="" draggable={false} className="h-12 w-12" />;
  }
  if (tile.art === 'gift') {
    return <GiftArt color={tile.giftColor ?? 0} live={!!live} />;
  }
  if (tile.art === 'lily') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/icons/LilyPad.svg" alt="" draggable={false} className="h-12 w-12" />;
  }
  if (tile.art === 'mystery') {
    return (
      <span className="relative grid h-14 w-14 place-items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/frog.png" alt="" draggable={false} className="h-14 w-14 object-contain opacity-35 brightness-0" />
        <span className="absolute text-[26px] font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">?</span>
      </span>
    );
  }
  if (tile.art === 'background' && tile.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={tile.imageUrl} alt="" draggable={false} className="h-[58px] w-[70px] rounded-xl object-cover" />;
  }
  if (tile.art === 'item' && tile.slot && tile.riveIndex !== undefined) {
    return (
      <FrogSnapshot
        className="h-[78px] w-[78px] object-contain"
        indices={{ [tile.slot]: tile.riveIndex }}
        width={78}
        height={78}
      />
    );
  }
  return <Sparkles className="h-10 w-10 text-white" />;
}

function ReelTile({ tile, winner, landed }: { tile: RollTile; winner?: boolean; landed?: boolean }) {
  const config = RARITY_CONFIG[tile.rarity];
  return (
    <div
      data-winner={winner || undefined}
      className={cn(
        'relative flex shrink-0 flex-col items-center justify-end overflow-hidden rounded-[20px] border-2 bg-gradient-to-b pb-1.5 transition-opacity duration-300',
        config.border,
        config.gradient,
        landed && !winner && 'opacity-30',
      )}
      style={{ width: TILE_W, height: 108 }}
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.75),transparent_62%)] dark:bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.12),transparent_62%)]" />
      <span className="absolute inset-x-0 bottom-[24px] top-0 flex items-center justify-center">
        <TileArtView tile={tile} live={winner && landed} />
      </span>
      <span
        className={cn(
          'relative rounded-full px-2 py-0.5 text-[11px] font-black leading-none tabular-nums ring-1 ring-inset ring-black/5',
          config.bg,
          config.text,
        )}
      >
        {tile.label}
      </span>
    </div>
  );
}

const RARITY_BURST: Record<Rarity, string> = {
  common: '#94a3b8',
  uncommon: '#34d399',
  rare: '#38bdf8',
  epic: '#a78bfa',
  legendary: '#fbbf24',
};

function confettiFor(rarity: Rarity, from: DOMRect) {
  if (rarity === 'common' || rarity === 'uncommon') return;
  const colors =
    rarity === 'legendary'
      ? ['#fbbf24', '#f59e0b', '#fde68a', '#ffffff']
      : rarity === 'epic'
        ? ['#a78bfa', '#c4b5fd', '#f0abfc', '#ffffff']
        : ['#38bdf8', '#7dd3fc', '#a5f3fc', '#ffffff'];
  void confetti({
    particleCount: rarity === 'legendary' ? 140 : rarity === 'epic' ? 100 : 70,
    spread: rarity === 'legendary' ? 110 : 80,
    startVelocity: rarity === 'legendary' ? 48 : 38,
    ticks: 160,
    scalar: 0.9,
    zIndex: 10020,
    disableForReducedMotion: true,
    colors,
    origin: {
      x: (from.left + from.width / 2) / window.innerWidth,
      y: (from.top + from.height / 2) / window.innerHeight,
    },
  });
}

function RewardRollOverlay({
  roll,
  onCollect,
}: {
  roll: RollRequest;
  onCollect: (rect: DOMRect | null) => void;
}) {
  const reduceMotion = useReducedMotion();
  const { summary } = roll;
  const rolled = summary.rolled!;
  const golden = rolled.tier === 'golden';
  const catalog = roll.options.catalog;
  const { tiles, odds } = useMemo(
    () => buildStrip(rolled.table ?? [], rolled.reward!, catalog),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roll.id],
  );
  const winner = tiles[WINNER_INDEX];
  const megaTiles = useMemo(
    () => rolled.megaRewards.map((reward) => tileFor(reward, catalog)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roll.id],
  );

  const giftColors = useMemo(
    () =>
      [...tiles, ...megaTiles]
        .filter((tile) => tile.art === 'gift')
        .map((tile) => tile.giftColor ?? 0),
    [tiles, megaTiles],
  );
  const { stamps, ready: stampsReady, nodes: stampNodes } = useGiftStamps(giftColors);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const flapperRef = useRef<HTMLSpanElement | null>(null);
  const winnerRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<Animation | null>(null);
  const [phase, setPhase] = useState<'spinning' | 'landed'>('spinning');
  const [showOdds, setShowOdds] = useState(false);
  const [width, setWidth] = useState(360);

  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (node) setWidth(node.clientWidth);
  }, []);

  const startX = width / 2 - (START_INDEX * STRIDE + TILE_W / 2);
  const targetX = useMemo(() => {
    const jitter = (Math.random() - 0.5) * TILE_W * 0.56;
    return width / 2 - (WINNER_INDEX * STRIDE + TILE_W / 2) + jitter;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll.id, width]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || width <= 0 || !stampsReady) return;
    if (reduceMotion || typeof strip.animate !== 'function') {
      strip.style.transform = `translate3d(${targetX}px, 0, 0)`;
      setPhase('landed');
      return;
    }
    let cancelled = false;
    let frame = 0;
    let lastIndex = START_INDEX;
    let lastTickAt = 0;
    const duration = golden ? 5400 : 4400;
    const animation = strip.animate(
      [
        { transform: `translate3d(${startX}px, 0, 0)`, easing: 'cubic-bezier(0.33, 0, 0.67, 1)', offset: 0 },
        { transform: `translate3d(${startX + WINDUP_PX}px, 0, 0)`, easing: 'cubic-bezier(0.12, 0.66, 0.08, 1)', offset: 0.05 },
        { transform: `translate3d(${targetX - SETTLE_PX}px, 0, 0)`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', offset: 0.94 },
        { transform: `translate3d(${targetX}px, 0, 0)`, offset: 1 },
      ],
      { duration, delay: 280, fill: 'forwards' },
    );
    animationRef.current = animation;
    hapticImpact();

    const tick = () => {
      if (cancelled) return;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
      const index = Math.floor((width / 2 - matrix.m41 + TILE_GAP / 2) / STRIDE);
      if (index !== lastIndex) {
        lastIndex = index;
        const now = performance.now();
        if (now - lastTickAt > 42) {
          lastTickAt = now;
          hapticTick();
          flapperRef.current?.animate(
            [{ transform: 'rotate(-18deg)' }, { transform: 'rotate(0deg)' }],
            { duration: 150, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
          );
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    animation.finished
      .then(() => {
        if (cancelled) return;
        cancelAnimationFrame(frame);
        setPhase('landed');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      try {
        animation.commitStyles();
      } catch {}
      animation.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll.id, width, stampsReady]);

  useEffect(() => {
    if (phase !== 'landed') return;
    hapticCelebrate();
    const node = winnerRef.current;
    if (!node) return;
    node.animate(
      [
        { transform: 'translate3d(0, 0, 0) scale(1)' },
        { transform: 'translate3d(0, -6px, 0) scale(1.16)' },
        { transform: 'translate3d(0, -4px, 0) scale(1.12)' },
      ],
      { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'forwards' },
    );
    confettiFor(winner.rarity, node.getBoundingClientRect());
  }, [phase, winner.rarity]);

  const fastForward = () => {
    const animation = animationRef.current;
    if (phase !== 'spinning' || !animation) return;
    if (animation.playState === 'running' && animation.playbackRate === 1) {
      animation.playbackRate = 6;
    }
  };

  const collect = () => {
    onCollect(winnerRef.current?.getBoundingClientRect() ?? null);
  };

  const landed = phase === 'landed';
  const winnerConfig = RARITY_CONFIG[winner.rarity];
  const burst = RARITY_BURST[winner.rarity];
  const premiumDouble = !!roll.options.isPremium && winner.art === 'fly' && winner.amount;

  return (
    <motion.div
      className="sheet-backdrop-in fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden px-4"
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      onClick={fastForward}
    >
      <div className="absolute inset-0 bg-slate-950/95" />
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-700',
          landed ? 'opacity-100' : 'opacity-40',
        )}
      >
        <RotatingRays
          colorClass={landed ? winnerConfig.rays : golden ? RARITY_CONFIG.legendary.rays : RARITY_CONFIG.rare.rays}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_35%,rgba(2,6,23,0.85)_100%)]" />
      </div>

      {stampNodes}
      <GiftStampContext.Provider value={stamps}>
      <div className="relative z-10 flex w-full max-w-[420px] flex-col items-center">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-black uppercase tracking-[0.14em]',
            golden
              ? 'bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 text-amber-950 shadow-[0_0_24px_rgba(251,191,36,0.45)]'
              : 'bg-white/10 text-white ring-1 ring-inset ring-white/15',
          )}
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.75} />
          {rolled.mega ? 'Mega roll' : golden ? 'Golden roll' : 'Reward roll'}
        </span>

        <div className="mt-3 h-[34px]">
          <h2
            key={landed ? 'won' : 'rolling'}
            className={cn(
              'roll-rise-in text-center text-[26px] font-black leading-none tracking-tight',
              landed ? 'text-white' : 'text-white/80',
            )}
          >
            {landed ? `${winner.title}!` : 'Rolling…'}
          </h2>
        </div>

        <div
          ref={viewportRef}
          className={cn(
            'relative mt-5 h-[136px] w-full overflow-hidden rounded-[28px] p-0 ring-1',
            golden ? 'bg-[#2a1d06] ring-amber-300/40' : 'bg-slate-900 ring-white/10',
          )}
          style={{
            maskImage: 'linear-gradient(to right, transparent 0, black 14%, black 86%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 14%, black 86%, transparent 100%)',
          }}
        >
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute left-1/2 top-1/2 h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-[opacity,transform] duration-500',
              landed ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
            )}
            style={{ background: `radial-gradient(circle, ${burst}66 0%, transparent 70%)` }}
          />
          <div
            ref={stripRef}
            className="absolute left-0 top-[14px] flex will-change-transform"
            style={{
              gap: TILE_GAP,
              transform: `translate3d(${startX}px, 0, 0)`,
              opacity: stampsReady ? 1 : 0,
              transition: 'opacity 220ms ease-out',
            }}
          >
            {tiles.map((tile, index) => (
              <div
                key={index}
                ref={index === WINNER_INDEX ? winnerRef : undefined}
                className={cn('relative', index === WINNER_INDEX && 'z-10')}
              >
                <ReelTile tile={tile} winner={index === WINNER_INDEX} landed={landed} />
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none relative -mt-[150px] h-[150px] w-full">
          <span
            ref={flapperRef}
            className="absolute left-1/2 top-0 -ml-[9px] block origin-top"
          >
            <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden>
              <path d="M1 1h16L9 15z" fill={golden ? '#fbbf24' : '#ffffff'} stroke="rgba(2,6,23,0.35)" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </span>
          <span
            className={cn(
              'absolute bottom-0 left-1/2 -ml-[9px] block rotate-180',
            )}
          >
            <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden>
              <path d="M1 1h16L9 15z" fill={golden ? '#fbbf24' : '#ffffff'} stroke="rgba(2,6,23,0.35)" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        <div className="mt-4 flex min-h-[132px] w-full flex-col items-center">
          {landed ? (
            <div
              className="roll-rise-in flex w-full flex-col items-center"
              style={{ animationDelay: '250ms' }}
            >
              {premiumDouble ? (
                <p className="mb-3 text-[13px] font-black text-amber-300">
                  Plus ×2 · {(winner.amount ?? 0) * 2} flies
                </p>
              ) : null}
              {megaTiles.length > 0 && (
                <div className="mb-4 flex flex-col items-center">
                  <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-amber-300">
                    + Mega bonus
                  </p>
                  <div className="flex gap-2">
                    {megaTiles.map((tile, index) => (
                      <div
                        key={tile.key + index}
                        className="roll-pop-in origin-top"
                        style={{ animationDelay: `${450 + index * 120}ms` }}
                      >
                        <div className="origin-top scale-[0.78]">
                          <ReelTile tile={tile} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  collect();
                }}
                className="w-full max-w-[280px] rounded-2xl bg-amber-400 py-3.5 text-[17px] font-black text-amber-950 shadow-[0_4px_0_0_#c2780a] transition-transform active:translate-y-1 active:shadow-none"
              >
                Collect
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[12px] font-bold text-white/45">Tap to skip</p>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowOdds((value) => !value);
            }}
            className="mt-3 rounded-full px-3 py-1 text-[11px] font-bold text-white/50 transition-colors hover:text-white/80"
          >
            {showOdds ? 'Hide odds' : 'Odds'}
          </button>
          {showOdds && (
              <ul
                className="roll-rise-in mt-1 grid w-full max-w-[300px] grid-cols-2 gap-x-4 gap-y-1 rounded-2xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10"
                onClick={(event) => event.stopPropagation()}
              >
                {odds.map((entry, index) => (
                  <li key={entry.tile.key + index} className="flex items-center justify-between gap-2 text-[12px] font-semibold text-white/75">
                    <span className="truncate">{entry.tile.title}</span>
                    <span className="tabular-nums text-white/50">
                      {entry.chance >= 1 ? Math.round(entry.chance) : entry.chance.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
      </GiftStampContext.Provider>
    </motion.div>
  );
}

export function RewardRollHost() {
  const roll = useStore(rollStore, (state) => state.roll);
  useAutoPopupHold('reward-roll', !!roll);
  useRegisterOpenSheet(!!roll);

  if (typeof document === 'undefined') return null;

  const collect = (rect: DOMRect | null) => {
    const current = rollStore.getState().roll;
    rollStore.setState({ roll: null });
    if (!current) return;
    window.setTimeout(() => {
      enqueueQuestRewardReveal(current.summary, {
        ...current.options,
        source: rect,
      });
    }, 120);
  };

  return createPortal(
    <AnimatePresence>
      {roll && <RewardRollOverlay key={roll.id} roll={roll} onCollect={collect} />}
    </AnimatePresence>,
    document.body,
  );
}
