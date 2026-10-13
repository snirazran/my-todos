import React, { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
  Variants,
} from 'framer-motion';
import { ChevronRight, Loader2, Crown, Gift, Play } from 'lucide-react';
import { AdPlayIcon } from '@/components/ui/AdPlayIcon';
import { Icon } from '@/components/ui/Icon';
import Frog from '@/components/ui/frog';
import { takePlusOfferAfterAd } from '@/lib/ads';
import { useRewardGate } from '@/hooks/useRewardGate';
import { ItemDef, type Rarity } from '@/lib/skins/catalog';
import { hapticTick } from '@/lib/haptics';
import {
  canFlyToInventory,
  flyFliesToCounter,
  flyItemToInventory,
  holdFlyCounter,
} from '@/lib/flyFlight';
import { requestFrogStamp } from '@/lib/frogStampEngine';
import { cn } from '@/lib/utils';
import { RARITY_CONFIG } from './constants';
import { GiftRive } from './GiftBox';

type Prize = ItemDef & { kind?: 'item' | 'background'; imageUrl?: string };

type RewardCardProps = {
  prize: Prize;
  claiming: boolean;
  onClaim: () => void;
  customPreview?: React.ReactNode;
  slotLabel?: string;
  onOpenLater?: () => void;
  openLaterLabel?: string;
  quantity?: number;
  baseQuantity?: number;
  /** Copies now owned, when this reveal was a duplicate. Reads as a spare,
   *  never as dust or a refund — a spare is trade-up progress. */
  spareCount?: number;
  isPremium?: boolean;
  showDoubleUpsell?: boolean;
  rewardAmount?: number;
  /** Grants the double. The card owns the price: a rewarded ad on native, the
   *  Plus paywall on web, and the action runs once either is paid. */
  onWatchAd?: () => void | Promise<void>;
  doublePlacement?: string;
  upsell?: React.ReactNode;
  paused?: boolean;
  flyCollectAmount?: number;
};

const GLOW_COLORS = {
  common: 'bg-slate-400',
  uncommon: 'bg-emerald-400',
  rare: 'bg-sky-400',
  epic: 'bg-violet-400',
  legendary: 'bg-amber-400',
};

const GIFT_BUTTON_PALETTE: Record<
  Rarity,
  { top: string; bottom: string; lip: string; glow: string }
> = {
  common: { top: '#4ade80', bottom: '#16a34a', lip: '#166534', glow: 'rgba(74,222,128,0.55)' },
  uncommon: { top: '#34d399', bottom: '#059669', lip: '#065f46', glow: 'rgba(52,211,153,0.55)' },
  rare: { top: '#38bdf8', bottom: '#0284c7', lip: '#075985', glow: 'rgba(56,189,248,0.6)' },
  epic: { top: '#a78bfa', bottom: '#7c3aed', lip: '#4c1d95', glow: 'rgba(167,139,250,0.6)' },
  legendary: { top: '#fcd34d', bottom: '#ea580c', lip: '#9a3412', glow: 'rgba(251,191,36,0.65)' },
};

const GIFT_SPARKLES = [
  { className: '-left-1.5 -top-2 h-4 w-4', delay: '0s' },
  { className: '-right-1 top-1 h-3 w-3', delay: '0.9s' },
  { className: 'right-10 -bottom-1 h-3.5 w-3.5', delay: '1.7s' },
];

function GiftOpenButton({
  rarity,
  label,
  busy,
  busyLabel,
  disabled,
  onClick,
}: {
  rarity: Rarity;
  label: string;
  busy: boolean;
  busyLabel: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const palette = GIFT_BUTTON_PALETTE[rarity] ?? GIFT_BUTTON_PALETTE.common;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-busy={busy || undefined}
      className="gift-open-btn group relative w-full pb-1.5 text-white outline-none disabled:cursor-not-allowed"
      style={
        {
          '--gift-top': palette.top,
          '--gift-bottom': palette.bottom,
          '--gift-lip': palette.lip,
          '--gift-glow': palette.glow,
        } as React.CSSProperties
      }
    >
      <span aria-hidden className="gift-open-halo" />
      <span aria-hidden className="gift-open-lip" />
      <span className="gift-open-face">
        <span aria-hidden className="gift-open-shine" />
        {busy ? (
          <Loader2 className="relative h-6 w-6 animate-spin" strokeWidth={2.75} />
        ) : (
          <Gift className="gift-open-icon relative h-6 w-6" strokeWidth={2.5} />
        )}
        <span className="relative">{busy ? busyLabel : label}</span>
      </span>
      {!busy &&
        GIFT_SPARKLES.map((sparkle) => (
          <svg
            key={sparkle.delay}
            aria-hidden
            viewBox="0 0 16 16"
            className={cn('gift-open-sparkle absolute', sparkle.className)}
            style={{ animationDelay: sparkle.delay }}
          >
            <path
              d="M8 0c.4 3.9 1.1 4.6 5 5-3.9.4-4.6 1.1-5 5-.4-3.9-1.1-4.6-5-5 3.9-.4 4.6-1.1 5-5Z"
              transform="translate(0 3)"
              fill="#fff"
            />
          </svg>
        ))}
    </button>
  );
}

export function GoldenRewardButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite] py-3.5 text-[15px] font-black text-white shadow-lg shadow-amber-500/30 ring-2 ring-amber-400/40 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {children}
    </button>
  );
}

const AD_OFFER_PALETTE = {
  double: { top: '#fbbf24', bottom: '#f97316', lip: '#c2410c', glow: 'rgba(251,191,36,0.6)', ink: '#c2410c' },
  reroll: { top: '#a78bfa', bottom: '#7c3aed', lip: '#4c1d95', glow: 'rgba(167,139,250,0.6)', ink: '#6d28d9' },
  plus: { top: '#2f7d50', bottom: '#1d5a3f', lip: '#0b271c', glow: 'rgba(251,191,36,0.45)', ink: '#3b2708' },
} as const;

export function PlusOfferButton({
  mode,
  visual,
  badge,
  title,
  anchor,
  busyLabel,
  busy,
  disabled,
  onClick,
  intent = 'double',
  rarity,
}: {
  mode: 'ad' | 'plus';
  visual: React.ReactNode;
  badge?: string;
  title?: string;
  anchor?: { from: number; to: number; unit: string; ready: boolean };
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  intent?: 'double' | 'another' | 'reroll';
  rarity?: Rarity;
}) {
  const plus = mode === 'plus';
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(anchor?.from ?? 0);
  const [landed, setLanded] = useState(false);
  const anchorFrom = anchor?.from;
  const anchorTo = anchor?.to;
  const anchorReady = anchor?.ready ?? false;

  useEffect(() => {
    if (anchorFrom === undefined || anchorTo === undefined || !anchorReady) return;
    if (reduceMotion) {
      setShown(anchorTo);
      setLanded(true);
      return;
    }
    const controls = animate(anchorFrom, anchorTo, {
      duration: 0.75,
      delay: 0.3,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (value) => setShown(Math.round(value)),
      onComplete: () => setLanded(true),
    });
    return () => controls.stop();
  }, [anchorFrom, anchorTo, anchorReady, reduceMotion]);

  const gift = GIFT_BUTTON_PALETTE[rarity ?? 'common'] ?? GIFT_BUTTON_PALETTE.common;
  const palette = plus
    ? AD_OFFER_PALETTE.plus
    : intent === 'another'
      ? { ...gift, ink: gift.lip }
      : AD_OFFER_PALETTE[intent];

  const subline = plus ? 'Free with Plus trial' : 'Watch a short ad';
  const label = anchor
    ? `Get ${anchor.to} ${anchor.unit} instead of ${anchor.from}. ${subline}`
    : `${title ?? ''}. ${subline}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={label}
      data-busy={busy || undefined}
      className="gift-open-btn group relative w-full pb-1.5 text-left text-white outline-none disabled:cursor-not-allowed disabled:opacity-70"
      style={
        {
          '--gift-top': palette.top,
          '--gift-bottom': palette.bottom,
          '--gift-lip': palette.lip,
          '--gift-glow': palette.glow,
        } as React.CSSProperties
      }
    >
      <span aria-hidden className="gift-open-halo" />
      <span aria-hidden className="gift-open-lip" />
      <span
        className={cn(
          'gift-open-face ad-offer-face',
          plus && 'ring-1 ring-inset ring-[#fbbf24]/60',
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[20px]"
        >
          <span className="gift-open-shine" />
        </span>

        <span aria-hidden className="relative h-11 w-11 shrink-0">
          <span
            className={cn(
              'grid h-full w-full place-items-center rounded-full shadow-[inset_0_-3px_0_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.22)]',
              plus
                ? 'bg-[#fff8dc] text-amber-900 ring-2 ring-[#fbbf24]'
                : 'bg-white/95',
              intent === 'reroll' && !plus && 'ad-offer-dice',
              intent === 'another' && !plus && 'gift-open-icon',
            )}
            style={plus ? undefined : { color: palette.ink }}
          >
            {visual}
          </span>
          {badge && (
            <span className="ad-offer-badge absolute -bottom-1 -right-2">
              <motion.span
                initial={false}
                animate={landed ? { scale: [1, 1.35, 1], rotate: [-12, 6, -8] } : { scale: 1, rotate: -8 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="block rounded-lg bg-white px-1.5 py-0.5 text-[12px] font-black leading-none shadow-[inset_0_-2px_0_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.3)] [text-shadow:none]"
                style={{ color: palette.ink }}
              >
                {badge}
              </motion.span>
            </span>
          )}
        </span>

        <span className="relative flex min-w-0 flex-1 flex-col leading-tight">
          {busy ? (
            <span className="truncate text-[18px] font-black tracking-tight">
              {busyLabel ?? 'Loading...'}
            </span>
          ) : anchor ? (
            <span className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span
                className={cn(
                  'text-[14px] font-black tabular-nums line-through decoration-2',
                  plus ? 'text-white/50 decoration-[#fde68a]/80' : 'text-white/75 decoration-white/80',
                )}
              >
                {anchor.from}
              </span>
              <motion.span
                initial={false}
                animate={landed ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className={cn(
                  'origin-left text-[24px] font-black tabular-nums leading-none tracking-tight',
                  plus && 'text-[#fde68a]',
                )}
              >
                {shown}
              </motion.span>
              <span className="text-[14px] font-black">{anchor.unit}</span>
            </span>
          ) : (
            <span className="truncate whitespace-nowrap text-[18px] font-black tracking-tight">
              {title}
            </span>
          )}
          <span className="mt-1 flex items-center gap-1 text-[12px] font-bold text-white/90">
            {plus ? (
              <Icon name="frogPlus" label="Plus" className="h-4 w-4 shrink-0" />
            ) : (
              <AdPlayIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} />
            )}
            {subline}
          </span>
        </span>

        <span
          aria-hidden
          className={cn(
            'relative grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-[inset_0_-3px_0_rgba(0,0,0,0.14),0_2px_5px_rgba(0,0,0,0.2)] [text-shadow:none]',
            !busy && 'ad-offer-play',
            plus ? 'bg-[#fbbf24] text-[#3b2708]' : 'bg-white',
          )}
          style={plus ? undefined : { color: palette.ink }}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} />
          ) : plus ? (
            <ChevronRight className="h-5 w-5" strokeWidth={3} />
          ) : (
            <Play className="ml-0.5 h-4 w-4" fill="currentColor" strokeWidth={0} />
          )}
        </span>
      </span>
      {!busy &&
        GIFT_SPARKLES.map((sparkle) => (
          <svg
            key={sparkle.delay}
            aria-hidden
            viewBox="0 0 16 16"
            className={cn('gift-open-sparkle absolute', sparkle.className)}
            style={{ animationDelay: sparkle.delay }}
          >
            <path
              d="M8 0c.4 3.9 1.1 4.6 5 5-3.9.4-4.6 1.1-5 5-.4-3.9-1.1-4.6-5-5 3.9-.4 4.6-1.1 5-5Z"
              transform="translate(0 3)"
              fill="#fff"
            />
          </svg>
        ))}
    </button>
  );
}

function FlyGlyph() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/widgets/Fly.svg" alt="" className="h-6 w-6" />
  );
}

export const RewardCard = ({
  prize,
  claiming,
  onClaim,
  customPreview,
  slotLabel,
  onOpenLater,
  openLaterLabel = 'Open Later',
  quantity,
  baseQuantity,
  spareCount,
  isPremium,
  showDoubleUpsell,
  rewardAmount,
  onWatchAd,
  doublePlacement = 'double_reward',
  upsell,
  paused = false,
  flyCollectAmount,
}: RewardCardProps) => {
  const [showContent, setShowContent] = useState(false);
  const [localClaiming, setLocalClaiming] = useState(false);
  const [launched, setLaunched] = useState(false);
  const artRef = useRef<HTMLDivElement | null>(null);
  const stampRef = useRef<HTMLCanvasElement | null>(null);
  const releaseHoldRef = useRef<(() => void) | null>(null);
  const collectsFlies = !!flyCollectAmount && flyCollectAmount > 0;
  const itemFlight =
    !customPreview && !(flyCollectAmount && flyCollectAmount > 0) && prize.slot !== 'container';
  const config = RARITY_CONFIG[prize.rarity];
  const glowColor = GLOW_COLORS[prize.rarity];
  const isSpare = !quantity && !!spareCount && spareCount > 1;

  useEffect(() => {
    // If the parent says we are done claiming, reset our local loading state
    if (!claiming) {
      setLocalClaiming(false);
    }
  }, [claiming]);

  useEffect(() => {
    if (!showContent || !itemFlight || prize.kind === 'background') return;
    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(120 * dpr);
    canvas.height = Math.round(135 * dpr);
    stampRef.current = canvas;
    return requestFrogStamp(canvas, {
      skin: prize.slot === 'skin' ? prize.riveIndex : 0,
      hat: prize.slot === 'hat' ? prize.riveIndex : 0,
      body: prize.slot === 'body' ? prize.riveIndex : 0,
      hand_item: prize.slot === 'hand_item' ? prize.riveIndex : 0,
    });
  }, [showContent, itemFlight, prize.kind, prize.slot, prize.riveIndex]);

  useEffect(() => {
    if (!collectsFlies) return;
    const release = holdFlyCounter();
    releaseHoldRef.current = release;
    return () => {
      window.setTimeout(release, 1500);
    };
  }, [collectsFlies]);

  const launchCollect = () => {
    const from = artRef.current?.getBoundingClientRect();
    if (!from || launched) return;
    if (flyCollectAmount && flyCollectAmount > 0) {
      setLaunched(true);
      const release = releaseHoldRef.current;
      flyFliesToCounter({
        from,
        count: flyCollectAmount,
        onFirstLand: () => release?.(),
      });
      return;
    }
    if (!itemFlight || !canFlyToInventory()) return;
    const visual = document.createElement('div');
    if (prize.kind === 'background' && prize.imageUrl) {
      const image = document.createElement('img');
      image.src = prize.imageUrl;
      image.alt = '';
      image.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      visual.appendChild(image);
    } else if (stampRef.current) {
      const canvas = stampRef.current;
      canvas.style.cssText = 'position:absolute;left:0;top:4%;width:100%;height:112.5%;display:block';
      visual.appendChild(canvas);
    } else {
      return;
    }
    setLaunched(true);
    flyItemToInventory({ from, visual, rarity: prize.rarity });
  };

  const handleClaimClick = () => {
    setLocalClaiming(true);
    launchCollect();
    setTimeout(() => {
      onClaim();
    }, 200);
  };

  const {
    mode,
    run,
    busy: watchingAd,
    error: doubleError,
    plusModal,
    openPlus,
  } = useRewardGate(doublePlacement);
  const canWatchAd = mode === 'ad' && !!onWatchAd;

  const handleDoubleClick = () => {
    if (watchingAd) return;
    if (!onWatchAd) {
      openPlus();
      return;
    }
    void run(async () => {
      await onWatchAd();
      if (canWatchAd && takePlusOfferAfterAd()) {
        setTimeout(() => openPlus(), 1600);
      }
    });
  };

  const cardVariants: Variants = {
    hidden: { opacity: 0, scale: 0.5, rotateY: 90 },
    visible: {
      opacity: 1,
      scale: 1,
      rotateY: 0,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 20,
        mass: 0.8,
        delay: 0.1,
      },
    },
  };

  const isProcessing = claiming || localClaiming;
  const hasUpsell = !!showDoubleUpsell || !!upsell;

  return (
    <motion.div
      key="card"
      className="relative flex flex-col items-center w-full"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      onAnimationComplete={() => setShowContent(true)}
    >
      {/* Premium Multiplier Banner — positioned above card without affecting layout */}
      <AnimatePresence>
        {isPremium && showContent && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.3 }}
            className="absolute left-0 right-0 flex flex-col items-center gap-1 -top-[4.5rem] z-30"
          >
            <span className="flex items-center gap-1.5 text-[13px] font-black text-white/50">
              <Crown className="w-3.5 h-3.5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
              Premium
            </span>
            <span className="flex items-center gap-1.5 text-[13px] font-black text-white/50">
              <span className="px-2 py-0.5 text-base font-black tracking-wide text-amber-300 rounded-lg bg-amber-500/15 border border-amber-400/25 shadow-[0_0_16px_rgba(251,191,36,0.25)]">
                x2
              </span>
              Multiplier
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3D Card Container */}
      <div
        className={cn(
          'relative flex flex-col items-center p-1 rounded-[32px] bg-gradient-to-br shadow-2xl transition-all duration-500',
          config.border,
          config.glow
        )}
      >
        <div
          className={cn(
            'relative flex flex-col w-[280px] md:w-[320px] h-auto rounded-[28px] overflow-hidden border-[4px]',
            config.bg,
            config.border
          )}
        >
          {/* Top Badge */}
          <div
            className={cn(
              'absolute top-4 left-0 z-50 px-4 py-1.5 rounded-r-xl text-[13px] font-black shadow-sm border-y border-r',
              config.bg,
              config.text,
              config.border
            )}
          >
            {config.label}
          </div>

          {/* Main Frog Display */}
          <div className="flex items-center justify-center flex-1 w-full p-3 mt-4 short-screen:mt-2 short-screen:p-2">
            <div
              className={cn(
                'w-full aspect-[1.1/1] md:aspect-[1.2/1] short-screen:aspect-[1.4/1] rounded-[20px] relative overflow-hidden flex items-center justify-center',
                'bg-gradient-to-b shadow-inner',
                config.gradient
              )}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/40 to-transparent opacity-60" />

              {/* Quantity Badge */}
              {quantity && quantity > 1 && (
                <QuantityBadge
                  quantity={quantity}
                  baseQuantity={baseQuantity}
                  showContent={showContent}
                />
              )}

              {/* Spare badge — a second copy is trade-up progress, not a dud */}
              {isSpare && (
                <SpareBadge count={spareCount ?? 0} showContent={showContent} />
              )}

              {/* === LAYER 1: CINEMATIC EFFECTS (Centered) === */}
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <AnimatePresence>
                  {!showContent && (
                    <CardRays key="rays" rarity={prize.rarity} />
                  )}
                </AnimatePresence>
              </div>

              {/* === LAYER 2: ACTUAL CONTENT (Bottom Aligned for Gift, Centered for Frog) === */}
              <div
                ref={artRef}
                className={cn(
                  'absolute inset-0 z-30 flex justify-center pointer-events-none transition-opacity duration-150',
                  launched && 'opacity-0',
                )}
              >
                {showContent && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                      type: 'spring',
                      damping: 12,
                      stiffness: 200,
                      delay: 0.1,
                    }}
                    className={cn(
                      'relative w-full h-full flex justify-center',
                      prize.slot === 'container' ? 'items-end' : 'items-center'
                    )}
                  >
                    {customPreview ? (
                      customPreview
                    ) : prize.kind === 'background' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={prize.imageUrl}
                        alt={prize.name}
                        className="h-full w-full rounded-[16px] object-cover"
                      />
                    ) : prize.slot === 'container' ? (
                      <div className="h-[120%] w-auto aspect-[282/381] mb-2">
                        <GiftRive className="w-full h-full" color={prize.riveIndex} paused={false} />
                      </div>
                    ) : (
                      <Frog
                        className="object-contain -translate-y-16"
                        indices={{
                          skin: prize.slot === 'skin' ? prize.riveIndex : 0,
                          hat: prize.slot === 'hat' ? prize.riveIndex : 0,
                          body: prize.slot === 'body' ? prize.riveIndex : 0,
                          hand_item:
                            prize.slot === 'hand_item' ? prize.riveIndex : 0,
                        }}
                        width={300}
                        height={300}
                        paused={paused}
                      />
                    )}
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Info */}
          <motion.div
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={
              showContent
                ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                : { opacity: 0, y: 10, filter: 'blur(4px)' }
            }
            transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
            className="flex min-h-24 flex-col items-center justify-center p-4 short-screen:min-h-0 short-screen:p-3 border-t bg-white/50 dark:bg-black/20 backdrop-blur-sm border-black/5 dark:border-white/5"
          >
            <h3 className="mb-1 text-2xl font-black leading-none text-center text-slate-800 dark:text-white short-screen:text-xl">
              {prize.name}
            </h3>
            <p className="text-sm font-bold capitalize text-slate-500 dark:text-slate-400">
              {slotLabel ??
                (prize.kind === 'background'
                  ? 'Background'
                  : prize.slot.replace('_', ' '))}
            </p>
            {isSpare && (
              <p className="mt-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Counts toward trade-ups
              </p>
            )}
          </motion.div>
        </div>
      </div>

      {/* Claim Button - Simplified animation for better performance */}
      <div
        className={cn(
          'mt-10 flex w-full max-w-[280px] flex-col gap-3 transition-all duration-500 short-screen:mt-7',
          showContent
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-4 pointer-events-none',
        )}
      >
        {showDoubleUpsell && (
          <PlusOfferButton
            mode={canWatchAd ? 'ad' : 'plus'}
            intent="double"
            visual={<FlyGlyph />}
            badge="×2"
            title="Double your reward"
            anchor={
              rewardAmount
                ? { from: rewardAmount, to: rewardAmount * 2, unit: 'flies', ready: showContent }
                : undefined
            }
            busy={watchingAd}
            busyLabel={canWatchAd ? 'Loading ad...' : 'Claiming...'}
            disabled={isProcessing || !showContent}
            onClick={handleDoubleClick}
          />
        )}
        {upsell}
        {prize.slot === 'container' && !hasUpsell ? (
          <GiftOpenButton
            rarity={prize.rarity}
            label={
              quantity && quantity > 1 ? `Open all ${quantity}` : 'Open now'
            }
            busy={isProcessing}
            busyLabel={
              quantity && quantity > 1 ? `Opening ${quantity}...` : 'Opening...'
            }
            disabled={isProcessing || !showContent}
            onClick={handleClaimClick}
          />
        ) : (
          <button
            onClick={handleClaimClick}
            disabled={isProcessing || !showContent}
            className={cn(
              'group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl font-black transition-all duration-500 active:scale-95 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-80',
              hasUpsell
                ? 'border border-white/15 bg-white/10 py-3 text-base text-white shadow-lg hover:bg-white/15'
                : cn('py-4 text-lg shadow-xl', config.button),
            )}
          >
            {isProcessing ? (
              <>
                <Loader2 className="relative z-20 w-5 h-5 animate-spin" />
                <span className="relative z-20">
                  {prize.slot === 'container'
                    ? quantity && quantity > 1
                      ? `Opening ${quantity}...`
                      : 'Opening...'
                    : 'Claiming...'}
                </span>
              </>
            ) : (
              <>
                <span className="relative z-20">
                  {prize.slot === 'container'
                    ? quantity && quantity > 1
                      ? `Open All (${quantity})`
                      : 'Open Now'
                    : rewardAmount
                      ? `Claim ${rewardAmount}`
                      : 'Claim Reward'}
                </span>
              </>
            )}
          </button>
        )}
        {prize.slot === 'container' && onOpenLater && (
          <button
            type="button"
            onClick={onOpenLater}
            disabled={isProcessing || !showContent}
            className="w-full rounded-2xl py-3 text-[15px] font-black text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {openLaterLabel}
          </button>
        )}
      </div>
      {doubleError && (
        <p className="mt-2 text-center text-xs font-bold text-red-300">
          {doubleError}
        </p>
      )}
      {plusModal}
    </motion.div>
  );
};

function SpareBadge({
  count,
  showContent,
}: {
  count: number;
  showContent: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={showContent ? { opacity: 1, scale: 1 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.5 }}
      className="absolute right-3 top-3 z-40 flex flex-col items-end gap-0.5"
    >
      <span className="rounded-xl border border-white/20 bg-black/45 px-3 py-1 text-sm font-black text-white shadow-sm backdrop-blur-sm">
        x{count}
      </span>
      <span className="rounded-lg bg-amber-400/90 px-2 py-0.5 text-[11px] font-black tracking-wide text-slate-900 shadow-sm">
        Spare
      </span>
    </motion.div>
  );
}

function QuantityBadge({
  quantity,
  baseQuantity,
  showContent,
}: {
  quantity: number;
  baseQuantity?: number;
  showContent: boolean;
}) {
  const [displayQty, setDisplayQty] = useState(baseQuantity ?? quantity);
  const [bumped, setBumped] = useState(false);

  useEffect(() => {
    if (!baseQuantity || !showContent || baseQuantity >= quantity) return;
    const timer = setTimeout(() => {
      hapticTick();
      setDisplayQty(quantity);
      setBumped(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [baseQuantity, quantity, showContent]);

  return (
    <motion.span
      animate={bumped ? { scale: [1.4, 1] } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      className="absolute z-40 px-3 py-1 text-sm font-black text-white border shadow-sm right-3 top-3 rounded-xl border-white/20 bg-black/45 backdrop-blur-sm"
    >
      x{displayQty}
    </motion.span>
  );
}

const CARD_RAY_COLOR: Record<string, string> = {
  common: 'text-slate-400',
  uncommon: 'text-emerald-500',
  rare: 'text-sky-500',
  epic: 'text-violet-500',
  legendary: 'text-amber-500',
};

const CARD_RAY_INTENSITY: Record<string, number> = {
  common: 0.7,
  uncommon: 0.8,
  rare: 0.9,
  epic: 1,
  legendary: 1.1,
};

const CARD_RAYS_WIDE =
  'repeating-conic-gradient(from 0deg, transparent 0deg, currentColor 8deg, transparent 16deg 30deg)';
const CARD_RAYS_THIN =
  'repeating-conic-gradient(from 7deg, transparent 0deg 7deg, rgb(255 255 255 / 0.9) 9deg 10deg, transparent 12deg 20deg)';
const CARD_RAYS_MASK = 'radial-gradient(circle, black 18%, transparent 66%)';
const CARD_CORE_GLOW =
  'radial-gradient(circle, rgb(255 255 255 / 0.95) 0%, rgb(255 255 255 / 0.45) 22%, transparent 58%)';

const CARD_SPARKLES = [
  { left: '16%', top: '22%', size: 14, delay: 0 },
  { left: '80%', top: '18%', size: 10, delay: 0.7 },
  { left: '86%', top: '70%', size: 12, delay: 1.4 },
  { left: '12%', top: '74%', size: 9, delay: 2.1 },
  { left: '54%', top: '9%', size: 8, delay: 2.8 },
];

function CardRays({ rarity }: { rarity?: string }) {
  const reduceMotion = useReducedMotion();
  const key = rarity && CARD_RAY_COLOR[rarity] ? rarity : 'common';
  const intensity = CARD_RAY_INTENSITY[key];
  const spin = (deg: number, duration: number) =>
    reduceMotion
      ? {}
      : {
          initial: { transform: 'rotate(0deg)' },
          animate: { transform: `rotate(${deg}deg)` },
          transition: { duration, repeat: Infinity, ease: 'linear' as const },
        };

  return (
    <motion.div
      initial={{ opacity: 0, transform: 'scale(0.85)' }}
      animate={{ opacity: 1, transform: 'scale(1)' }}
      exit={{
        opacity: 0,
        transform: 'scale(1.8)',
        transition: { duration: 0.5, ease: [0.4, 0, 1, 1] },
      }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn('absolute inset-0 flex items-center justify-center', CARD_RAY_COLOR[key])}
      style={{ willChange: 'transform, opacity' }}
    >
      <motion.div
        {...spin(360, 32)}
        className="absolute aspect-square w-[160%] max-w-[600px] rounded-full"
        style={{
          background: CARD_RAYS_WIDE,
          maskImage: CARD_RAYS_MASK,
          WebkitMaskImage: CARD_RAYS_MASK,
          opacity: 0.55 * intensity,
          willChange: 'transform',
        }}
      />
      <motion.div
        {...spin(-360, 20)}
        className="absolute aspect-square w-[160%] max-w-[600px] rounded-full"
        style={{
          background: CARD_RAYS_THIN,
          maskImage: CARD_RAYS_MASK,
          WebkitMaskImage: CARD_RAYS_MASK,
          opacity: 0.35 * intensity,
          willChange: 'transform',
        }}
      />
      <motion.div
        initial={{ opacity: 0.55, transform: 'scale(0.92)' }}
        animate={
          reduceMotion
            ? { opacity: 0.7, transform: 'scale(1)' }
            : { opacity: 0.85, transform: 'scale(1.06)' }
        }
        transition={{
          duration: 2.4,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
        }}
        className="absolute aspect-square w-[85%] rounded-full"
        style={{ background: CARD_CORE_GLOW, willChange: 'transform, opacity' }}
      />
      {!reduceMotion &&
        CARD_SPARKLES.map((sparkle) => (
          <motion.svg
            key={`${sparkle.left}-${sparkle.top}`}
            viewBox="0 0 24 24"
            width={sparkle.size}
            height={sparkle.size}
            className="absolute text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]"
            style={{ left: sparkle.left, top: sparkle.top, willChange: 'transform, opacity' }}
            initial={{ opacity: 0, transform: 'scale(0) rotate(0deg)' }}
            animate={{
              opacity: [0, 1, 0],
              transform: [
                'scale(0) rotate(0deg)',
                'scale(1) rotate(45deg)',
                'scale(0) rotate(90deg)',
              ],
            }}
            transition={{
              duration: 1.6,
              delay: sparkle.delay,
              repeat: Infinity,
              repeatDelay: 1.6,
              ease: 'easeInOut',
            }}
          >
            <path
              d="M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z"
              fill="currentColor"
            />
          </motion.svg>
        ))}
    </motion.div>
  );
}
