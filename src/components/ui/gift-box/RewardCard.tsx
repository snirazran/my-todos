import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, Variants } from 'framer-motion';
import { Loader2, Gift, Sparkles, Crown, Play, Star, Zap, Infinity as InfinityIcon, X, BarChart3, CalendarCheck } from 'lucide-react';
import Frog from '@/components/ui/frog';
import { ItemDef } from '@/lib/skins/catalog';
import { cn } from '@/lib/utils';
import { RARITY_CONFIG } from './constants';
import { GiftRive } from './GiftBox';

type RewardCardProps = {
  prize: ItemDef;
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
  paused?: boolean;
};

const GLOW_COLORS = {
  common: 'bg-slate-400',
  uncommon: 'bg-emerald-400',
  rare: 'bg-sky-400',
  epic: 'bg-violet-400',
  legendary: 'bg-amber-400',
};

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
  paused = false,
}: RewardCardProps) => {
  const [showContent, setShowContent] = useState(false);
  const [localClaiming, setLocalClaiming] = useState(false);
  const [showUpsellPopup, setShowUpsellPopup] = useState(false);
  const config = RARITY_CONFIG[prize.rarity];
  const glowColor = GLOW_COLORS[prize.rarity];

  useEffect(() => {
    // If the parent says we are done claiming, reset our local loading state
    if (!claiming) {
      setLocalClaiming(false);
    }
  }, [claiming]);

  const handleClaimClick = () => {
    setLocalClaiming(true); // 1. You turn this ON

    // 2. You wait 200ms and call the parent
    setTimeout(() => {
      onClaim();
    }, 200);

    // 3. ❌ MISSING: You never setLocalClaiming(false) here or anywhere else.
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
              'absolute top-4 left-0 px-4 py-1.5 rounded-r-xl text-xs font-black uppercase tracking-widest shadow-sm z-20 border-y border-r',
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
                    ) : prize.slot === 'container' ? (
                      <div className="h-[120%] w-auto aspect-[282/381] mb-2">
                        <GiftRive className="w-full h-full" color={prize.riveIndex} paused={false} />
                      </div>
                    ) : (
                      <Frog
                        className="object-contain translate-y-2"
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
              {slotLabel ?? prize.slot.replace('_', ' ')}
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
              {prize.slot !== 'container' && (
                <Sparkles className="relative z-20 w-5 h-5" />
              )}
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
          <button
            type="button"
            onClick={() => setShowUpsellPopup(true)}
            disabled={isProcessing || !showContent}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 bg-[length:200%_100%] animate-[shimmer_2s_ease-in-out_infinite] py-3.5 text-[15px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-amber-500/30 ring-2 ring-amber-400/40 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex items-center justify-center w-7 h-7 text-[11px] font-black text-amber-900 rounded-lg bg-white/30 shadow-inner">
              x2
            </span>
            Double Reward
          </button>
        )}
      </div>
      {showUpsellPopup && <DoubleRewardUpsell onClose={() => setShowUpsellPopup(false)} />}
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

const PREMIUM_PERKS = [
  { icon: Zap, label: '2x all rewards & flies' },
  { icon: CalendarCheck, label: 'Bonus daily rewards' },
  { icon: InfinityIcon, label: 'Unlimited tags' },
  { icon: BarChart3, label: 'Analytics access' },
];

function DoubleRewardUpsell({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[10002] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 pb-6 sm:pb-0"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Reward Boost
            </p>
            <h4 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
              Double this reward?
            </h4>
          </div>
          <button
            className="flex-shrink-0 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options */}
        <div className="px-4 pb-3 space-y-2">
          {/* Watch Ad */}
          <button
            type="button"
            className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all text-left border border-emerald-200/60 dark:border-emerald-800/40 active:scale-[0.98]"
            onClick={onClose}
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Play className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Watch a short ad</p>
              <p className="text-xs text-emerald-600/60 dark:text-emerald-400/50 mt-0.5">
                Double this reward for free
              </p>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800/50 shrink-0">
              Free
            </span>
          </button>

          {/* Get Premium */}
          <button
            type="button"
            className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all text-left border border-amber-200/60 dark:border-amber-800/40 active:scale-[0.98]"
            onClick={onClose}
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Crown className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Get Premium</p>
              <p className="text-xs text-amber-600/60 dark:text-amber-400/50 mt-0.5">
                Auto-double every reward, forever
              </p>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800/50 shrink-0">
              Upgrade
            </span>
          </button>
        </div>

        {/* Premium Perks */}
        <div className="px-5 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5 mt-2">
            Premium includes
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {PREMIUM_PERKS.map((perk) => (
              <div
                key={perk.label}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5"
              >
                <perk.icon className="w-3 h-3 text-amber-500 dark:text-amber-400 shrink-0" />
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-tight">
                  {perk.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Cancel */}
        <div className="px-4 pb-4">
          <button
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            onClick={onClose}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
