'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { ArrowUp, Clock, Plus } from 'lucide-react';
import { useCountdown } from '@/components/ui/skins/DailyDealsShelf';
import Fly from '@/components/ui/fly';
import { Icon } from '@/components/ui/Icon';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { useAuth } from '@/components/auth/AuthContext';
import { useInventory } from '@/hooks/useInventory';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { useUIStore } from '@/lib/uiStore';
import {
  countInventorySpares,
  RARITY_ORDER,
  type ItemDef,
} from '@/lib/skins/catalog';
import type { DailyDeal } from '@/lib/skins/dailyDeal';
import { useTradeReadiness } from '@/hooks/useReadyTrades';
import { useTradeConfig } from '@/hooks/useTradeConfig';
import { recipeFor } from '@/lib/skins/tradeModifiers';
import { hapticTick } from '@/lib/haptics';
import { cn } from '@/lib/utils';

export type WardrobeTab = 'inventory' | 'shop' | 'trade';

export function useWardrobeBadges() {
  const { user } = useAuth();
  const { unseenCount, unseenContainerCount, data } = useInventory(
    !!user,
    true,
  );
  const inventoryBadge = unseenCount + unseenContainerCount;
  const flyBalance = data?.wardrobe?.flies;
  const dealEndsAt = data?.dailyDeals?.[0]?.endsAt ?? null;

  const ownedCount = useMemo(
    () =>
      countInventorySpares(data?.wardrobe?.inventory, data?.catalog).owned,
    [data],
  );
  const { trades: readyTrades, startRarity } = useTradeReadiness(!!user);
  const tradeModifiers = useTradeConfig(!!user);
  const tradeRecipe = useMemo(() => {
    if (startRarity) return recipeFor(tradeModifiers, startRarity);
    return (
      [...tradeModifiers.recipes].sort(
        (a, b) => RARITY_ORDER.indexOf(a.from) - RARITY_ORDER.indexOf(b.from),
      )[0] ?? null
    );
  }, [startRarity, tradeModifiers]);

  const featuredDeal = useMemo(() => {
    const deals = data?.dailyDeals ?? [];
    if (!deals.length || !data?.catalog) return null;
    const byId = new Map(data.catalog.map((item) => [item.id, item]));
    const entries = deals
      .map((deal) => ({ deal, item: byId.get(deal.itemId) }))
      .filter((e): e is { deal: DailyDeal; item: ItemDef } => !!e.item);
    if (!entries.length) return null;
    return entries.reduce((best, e) =>
      e.deal.discountPercent > best.deal.discountPercent ? e : best,
    );
  }, [data?.dailyDeals, data?.catalog]);

  return {
    inventoryBadge,
    flyBalance,
    readyTrades,
    tradeRecipe,
    ownedCount,
    dealEndsAt,
    featuredDeal,
  };
}

const SHEET_ENTER = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 38,
  mass: 0.9,
};
const SHEET_EXIT = {
  duration: 0.22,
  ease: [0.4, 0, 1, 1] as [number, number, number, number],
};

const GRID_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
};
const CARD_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.94 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 520, damping: 30 },
  },
};

type Tone = 'emerald' | 'amber' | 'sky';

const STAGE_TONE: Record<Tone, string> = {
  emerald:
    'from-emerald-100 to-lime-50 dark:from-emerald-900/50 dark:to-emerald-950/30',
  amber:
    'from-amber-100 to-orange-50 dark:from-amber-900/45 dark:to-orange-950/25',
  sky: 'from-sky-100 to-indigo-50 dark:from-sky-900/45 dark:to-indigo-950/25',
};

const STATUS_TONE = {
  muted: 'text-muted-foreground',
  rose: 'text-rose-600 dark:text-rose-400',
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
};

function DestinationCard({
  label,
  stage,
  stageTone,
  stageClassName,
  status,
  statusTone = 'muted',
  statusIcon,
  badge = 0,
  badgeTone = 'rose',
  glow = false,
  compact = false,
  onClick,
}: {
  label: string;
  stage: React.ReactNode;
  stageTone: Tone;
  stageClassName?: string;
  status: string;
  statusTone?: keyof typeof STATUS_TONE;
  statusIcon?: React.ReactNode;
  badge?: number;
  badgeTone?: 'rose' | 'amber';
  glow?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      variants={CARD_VARIANTS}
      onClick={onClick}
      aria-label={badge > 0 ? `${label}, ${badge} new` : label}
      className={cn(
        'group relative flex min-w-0 flex-col rounded-[22px] bg-card p-1.5 text-left ring-1 ring-border/70',
        'shadow-[0_3px_0_0_rgba(0,0,0,0.12)] transition-[transform,box-shadow] duration-100',
        'active:translate-y-[2px] active:shadow-[0_1px_0_0_rgba(0,0,0,0.12)]',
        'hover:ring-border md:hover:-translate-y-0.5 md:hover:shadow-[0_5px_0_0_rgba(0,0,0,0.12)]',
        'dark:shadow-[0_3px_0_0_rgba(0,0,0,0.45)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      )}
    >
      <span
        className={cn(
          'relative flex w-full items-end justify-center overflow-hidden rounded-[16px] bg-gradient-to-b',
          compact ? 'h-[72px]' : 'h-[88px]',
          STAGE_TONE[stageTone],
          stageClassName,
        )}
      >
        <span className="pointer-events-none absolute inset-x-3 top-1.5 h-1/3 rounded-full bg-white/50 blur-md dark:bg-white/5" />
        {glow && (
          <span className="pointer-events-none absolute inset-0 animate-pulse rounded-[16px] ring-2 ring-inset ring-amber-400/70" />
        )}
        <span className="relative flex h-full w-full items-end justify-center transition-transform duration-200 group-hover:scale-[1.04]">
          {stage}
        </span>
      </span>

      <AnimatePresence>
        {badge > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 18, delay: 0.25 }}
            className={cn(
              'absolute -right-1 -top-1 z-10 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-card px-1.5 text-[11px] font-black text-white shadow-sm',
              badgeTone === 'rose' ? 'bg-rose-500' : 'bg-amber-500',
            )}
          >
            {badge > 9 ? '9+' : badge}
          </motion.span>
        )}
      </AnimatePresence>

      <span className="flex min-w-0 flex-col gap-1 px-1 pb-1 pt-2 min-[380px]:px-1.5">
        <span className="truncate text-[clamp(13px,4vw,15px)] font-black leading-none text-foreground">
          {label}
        </span>
        <span
          className={cn(
            'flex min-w-0 items-start gap-1 text-[clamp(10px,3vw,11px)] font-bold leading-tight tabular-nums',
            STATUS_TONE[statusTone],
          )}
        >
          {statusIcon && <span className="mt-px shrink-0">{statusIcon}</span>}
          <span className="line-clamp-2 min-w-0 break-words">{status}</span>
        </span>
      </span>
    </motion.button>
  );
}

export function WardrobeHub({
  active = true,
  compact = false,
  onSelect,
  onOpenFlyShop,
}: {
  active?: boolean;
  compact?: boolean;
  onSelect: (tab: WardrobeTab) => void;
  onOpenFlyShop?: () => void;
}) {
  const { user } = useAuth();
  const { indices } = useWardrobeIndices(!!user);
  const {
    inventoryBadge,
    flyBalance,
    readyTrades,
    tradeRecipe,
    ownedCount,
    dealEndsAt,
    featuredDeal,
  } = useWardrobeBadges();
  const dealCountdown = useCountdown(
    active && dealEndsAt ? dealEndsAt : undefined,
  );

  const tradeReady = readyTrades > 0;
  const snapshotSize = compact ? 96 : 116;

  const pick = (tab: WardrobeTab) => {
    hapticTick();
    onSelect(tab);
  };

  const inventoryStatus =
    inventoryBadge > 0
      ? `${inventoryBadge} new`
      : ownedCount > 0
        ? `${ownedCount} ${ownedCount === 1 ? 'item' : 'items'}`
        : 'Start collecting';

  const onSale = featuredDeal?.deal.onSale ?? false;

  return (
    <div>
      <div className="flex items-center gap-3 px-1 pb-3">
        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              'font-black leading-none text-foreground',
              compact ? 'text-lg' : 'text-[22px]',
            )}
          >
            Wardrobe
          </h2>
          <p className="mt-1 text-[12px] font-bold leading-none text-muted-foreground">
            Dress up your frog
          </p>
        </div>
        {typeof flyBalance === 'number' && (
          <button
            type="button"
            onClick={() => {
              hapticTick();
              onOpenFlyShop?.();
            }}
            aria-label={`${flyBalance} flies, get more`}
            className="flex shrink-0 items-center gap-1 rounded-full bg-card py-1 pl-1.5 pr-1 ring-1 ring-border/70 shadow-[0_2px_0_0_rgba(0,0,0,0.1)] transition-transform active:translate-y-px active:shadow-none"
          >
            <Fly size={24} paused y={-4} />
            <span className="text-[14px] font-black tabular-nums text-foreground">
              {flyBalance.toLocaleString()}
            </span>
            <span className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#4f9149] text-white shadow-[0_2px_0_0_#34631f]">
              <Plus className="h-3.5 w-3.5" strokeWidth={3.5} />
            </span>
          </button>
        )}
      </div>

      <motion.div
        variants={GRID_VARIANTS}
        initial="hidden"
        animate="show"
        className="grid grid-cols-3 gap-2.5"
      >
        <DestinationCard
          label="Inventory"
          stageTone="emerald"
          compact={compact}
          stage={
            <FrogSnapshot
              indices={indices}
              width={snapshotSize}
              height={snapshotSize}
              visualOffsetY={0}
            />
          }
          status={inventoryStatus}
          statusTone={inventoryBadge > 0 ? 'rose' : 'muted'}
          badge={inventoryBadge}
          badgeTone="rose"
          onClick={() => pick('inventory')}
        />
        <DestinationCard
          label="Shop"
          stageTone="amber"
          compact={compact}
          stageClassName={
            featuredDeal
              ? RARITY_CONFIG[featuredDeal.item.rarity].gradient
              : undefined
          }
          stage={
            featuredDeal ? (
              <>
                <FrogSnapshot
                  indices={{
                    [featuredDeal.item.slot]: featuredDeal.item.riveIndex,
                  }}
                  width={snapshotSize}
                  height={snapshotSize}
                  visualOffsetY={0}
                />
                {onSale && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow-sm">
                    −{featuredDeal.deal.discountPercent}%
                  </span>
                )}
              </>
            ) : (
              <span className="flex h-full items-center">
                <Icon name="store" className="h-12 w-12" />
              </span>
            )
          }
          status={dealCountdown || 'New every day'}
          statusTone={dealCountdown ? 'amber' : 'muted'}
          statusIcon={
            dealCountdown ? <Clock className="h-3 w-3 shrink-0" /> : null
          }
          onClick={() => pick('shop')}
        />
        <DestinationCard
          label="Trade Up"
          stageTone="sky"
          compact={compact}
          glow={tradeReady}
          stage={
            <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-1">
              <span className="relative flex">
                <motion.span
                  animate={tradeReady ? { rotate: [0, -8, 8, 0] } : undefined}
                  transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1.6 }}
                  className="flex"
                >
                  <Icon name="trade" className={compact ? 'h-9 w-9' : 'h-11 w-11'} />
                </motion.span>
                <motion.span
                  animate={tradeReady ? { y: [0, -3, 0] } : undefined}
                  transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.6 }}
                  className={cn(
                    'absolute -right-2.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white text-white shadow-sm dark:border-slate-900',
                    tradeReady ? 'bg-emerald-500' : 'bg-slate-400',
                  )}
                >
                  <ArrowUp className="h-3 w-3" strokeWidth={3.5} />
                </motion.span>
              </span>
              {tradeRecipe && (
                <span
                  aria-label={`${RARITY_CONFIG[tradeRecipe.from].label} to ${RARITY_CONFIG[tradeRecipe.to].label}`}
                  className="flex max-w-full items-center gap-0.5 whitespace-nowrap rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-black leading-none shadow-sm dark:bg-black/30"
                >
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full border min-[380px]:hidden',
                      RARITY_CONFIG[tradeRecipe.from].bg,
                      RARITY_CONFIG[tradeRecipe.from].border,
                    )}
                  />
                  <span
                    className={cn(
                      'hidden min-[380px]:inline',
                      RARITY_CONFIG[tradeRecipe.from].text,
                    )}
                  >
                    {RARITY_CONFIG[tradeRecipe.from].label}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className={RARITY_CONFIG[tradeRecipe.to].text}>
                    {RARITY_CONFIG[tradeRecipe.to].label}
                  </span>
                </span>
              )}
            </span>
          }
          status={
            tradeReady
              ? `${readyTrades} ready`
              : 'Upgrade spares'
          }
          statusTone={tradeReady ? 'amber' : 'muted'}
          badge={readyTrades}
          badgeTone="amber"
          onClick={() => pick('trade')}
        />
      </motion.div>
    </div>
  );
}

export function WardrobePopup({
  open,
  onClose,
  onSelect,
  onExitComplete,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (tab: WardrobeTab) => void;
  onExitComplete?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const openFlyShop = useUIStore((s) => s.openFlyShop);
  useRegisterOpenSheet(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence onExitComplete={onExitComplete}>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            className="fixed inset-0 z-[98] bg-black/60 backdrop-blur-[2px] md:hidden"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Wardrobe"
            initial={{ y: '112%' }}
            animate={{ y: 0 }}
            exit={{ y: '112%', transition: SHEET_EXIT }}
            transition={SHEET_ENTER}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 600) onClose();
            }}
            className="fixed inset-x-0 bottom-0 z-[99] md:hidden"
          >
            <div
              className="rounded-t-[28px] border-t border-border/60 bg-background px-4 shadow-[0_-12px_40px_rgba(0,0,0,0.35)]"
              style={{
                paddingBottom: 'calc(76px + env(safe-area-inset-bottom) + 14px)',
              }}
            >
              <div className="flex justify-center pb-3 pt-3">
                <div className="h-1 w-10 rounded-full bg-border" />
              </div>
              <WardrobeHub
                active={open}
                onSelect={onSelect}
                onOpenFlyShop={() => {
                  onClose();
                  openFlyShop();
                }}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
