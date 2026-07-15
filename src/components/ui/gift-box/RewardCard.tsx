import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, Variants } from 'framer-motion';
import { Loader2, Crown, Play } from 'lucide-react';
import Frog from '@/components/ui/frog';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { rewardedAdsAvailable, takePlusOfferAfterAd } from '@/lib/ads';
import { ItemDef } from '@/lib/skins/catalog';
import { hapticTick } from '@/lib/haptics';
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
  isPremium?: boolean;
  showDoubleUpsell?: boolean;
  rewardAmount?: number;
  /** Tapping "Double Reward" calls this directly (it should run the rewarded
   *  ad and grant the double); when ads are unavailable the button opens the
   *  Plus paywall instead. */
  onWatchAd?: () => void | Promise<void>;
  paused?: boolean;
};

const GLOW_COLORS = {
  common: 'bg-slate-400',
  uncommon: 'bg-emerald-400',
  rare: 'bg-sky-400',
  epic: 'bg-violet-400',
  legendary: 'bg-amber-400',
};

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
        'w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite] py-3.5 text-[15px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-amber-500/30 ring-2 ring-amber-400/40 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {children}
    </button>
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
  isPremium,
  showDoubleUpsell,
  rewardAmount,
  onWatchAd,
  paused = false,
}: RewardCardProps) => {
  const [showContent, setShowContent] = useState(false);
  const [localClaiming, setLocalClaiming] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const [showPlus, setShowPlus] = useState(false);
  const config = RARITY_CONFIG[prize.rarity];
  const glowColor = GLOW_COLORS[prize.rarity];

  useEffect(() => {
    // If the parent says we are done claiming, reset our local loading state
    if (!claiming) {
      setLocalClaiming(false);
    }
  }, [claiming]);

  const handleClaimClick = () => {
    setLocalClaiming(true);
    setTimeout(() => {
      onClaim();
    }, 200);
  };

  const canWatchAd = !!onWatchAd && rewardedAdsAvailable();

  const handleDoubleClick = async () => {
    if (watchingAd) return;
    if (!canWatchAd) {
      setShowPlus(true);
      return;
    }
    setWatchingAd(true);
    try {
      await onWatchAd?.();
      if (takePlusOfferAfterAd()) {
        setTimeout(() => setShowPlus(true), 1600);
      }
    } finally {
      setWatchingAd(false);
    }
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
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.25em] text-white/50">
              <Crown className="w-3.5 h-3.5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
              Premium
            </span>
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.25em] text-white/50">
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
              'absolute top-4 left-0 z-50 px-4 py-1.5 rounded-r-xl text-xs font-black uppercase tracking-widest shadow-sm border-y border-r',
              config.bg,
              config.text,
              config.border
            )}
          >
            {config.label}
          </div>

          {/* Main Frog Display */}
          <div className="flex items-center justify-center flex-1 w-full p-3 mt-4">
            <div
              className={cn(
                'w-full aspect-[1.1/1] md:aspect-[1.2/1] rounded-[20px] relative overflow-hidden flex items-center justify-center',
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

              {/* === LAYER 1: CINEMATIC EFFECTS (Centered) === */}
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                {/* 1. Rotating God Rays */}
                <motion.div
                  key="rays"
                  animate={
                    showContent
                      ? { opacity: 0, scale: 2, rotate: 180 }
                      : { rotate: 360 }
                  }
                  transition={
                    showContent
                      ? { duration: 0.5, ease: 'easeIn' }
                      : { duration: 20, repeat: Infinity, ease: 'linear' }
                  }
                  className={cn(
                    'absolute w-[600px] h-[600px] opacity-40 mix-blend-plus-lighter',
                    // Mapping rarity to TEXT colors so 'currentColor' works in the gradient
                    {
                      'text-slate-400': prize.rarity === 'common',
                      'text-emerald-500': prize.rarity === 'uncommon',
                      'text-sky-500': prize.rarity === 'rare',
                      'text-violet-500': prize.rarity === 'epic',
                      'text-amber-500': prize.rarity === 'legendary',
                    }
                  )}
                  style={{
                    background:
                      'repeating-conic-gradient(from 0deg, transparent 0deg, transparent 15deg, currentColor 15deg, currentColor 20deg, transparent 20deg)',
                    maskImage:
                      'radial-gradient(circle, black 30%, transparent 70%)',
                    WebkitMaskImage:
                      'radial-gradient(circle, black 30%, transparent 70%)',
                  }}
                />
              </div>

              {/* === LAYER 2: ACTUAL CONTENT (Bottom Aligned for Gift, Centered for Frog) === */}
              <div className="absolute inset-0 z-30 flex justify-center pointer-events-none">
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
            className="flex flex-col items-center justify-center h-24 p-4 border-t bg-white/50 dark:bg-black/20 backdrop-blur-sm border-black/5 dark:border-white/5"
          >
            <h3 className="mb-1 text-2xl font-black leading-none text-center text-slate-800 dark:text-white">
              {prize.name}
            </h3>
            <p className="text-sm font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
              {slotLabel ??
                (prize.kind === 'background'
                  ? 'Background'
                  : prize.slot.replace('_', ' '))}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Claim Button - Simplified animation for better performance */}
      <div
        className={cn(
          'mt-10 flex w-full max-w-[280px] flex-col gap-3 transition-all duration-500',
          showContent
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-4 pointer-events-none',
        )}
      >
        <button
          onClick={handleClaimClick}
          disabled={isProcessing || !showContent}
          className={cn(
            'group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl py-4 text-lg font-black shadow-xl transition-all duration-500 active:scale-95 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-80',
            config.button,
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
              <span className="relative z-20 uppercase tracking-[0.14em]">
                {prize.slot === 'container'
                  ? quantity && quantity > 1
                    ? `Open All (${quantity})`
                    : 'Open Now'
                  : 'Claim Reward'}
              </span>
            </>
          )}
        </button>
        {prize.slot === 'container' && onOpenLater && (
          <button
            type="button"
            onClick={onOpenLater}
            disabled={isProcessing || !showContent}
            className="w-full rounded-2xl border border-white/15 bg-white/10 py-3 text-sm font-black uppercase tracking-[0.14em] text-white shadow-lg transition hover:bg-white/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {openLaterLabel}
          </button>
        )}
        {showDoubleUpsell && (
          <GoldenRewardButton
            onClick={handleDoubleClick}
            disabled={isProcessing || !showContent || watchingAd}
          >
            {watchingAd ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading ad...
              </>
            ) : (
              <>
                <span className="flex items-center justify-center w-7 h-7 text-[11px] font-black text-amber-900 rounded-lg bg-white/30 shadow-inner">
                  x2
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span>
                    {rewardAmount ? `Claim ${rewardAmount * 2}` : 'Double Reward'}
                  </span>
                  <span className="text-[10px] font-bold normal-case tracking-normal text-white/80">
                    {canWatchAd ? 'watch a short ad' : 'with Plus'}
                  </span>
                </span>
                {canWatchAd && <Play className="w-4 h-4 fill-current" />}
              </>
            )}
          </GoldenRewardButton>
        )}
      </div>
      <PlusUpgradeModal
        open={showPlus}
        placement="double_reward"
        onClose={() => setShowPlus(false)}
      />
    </motion.div>
  );
};

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

