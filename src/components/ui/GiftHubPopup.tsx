'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
  X,
  Gift,
  Check,
  Plus,
  Sparkles,
  ShoppingBag,
  Loader2,
  CalendarCheck,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GiftRive } from './gift-box/GiftBox';
import GiftBoxOpening from './gift-box/GiftBoxOpening';
import Fly from './fly';
import { useProgressLogic, type ProgressSlot } from '@/hooks/useProgressLogic';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/components/auth/AuthContext';
import useSWR, { mutate as globalMutate } from 'swr';
import { ItemCard } from './skins/ItemCard';
import type { ItemDef } from '@/lib/skins/catalog';

/* ─── TYPES ────────────────────────────────────────── */

interface GiftHubPopupProps {
  show: boolean;
  onClose: () => void;
  done: number;
  total: number;
  giftsClaimed: number;
  flyBalance: number;
  onAddTask: () => void;
  onMutateToday: () => void;
  isGuest?: boolean;
  onOpenDailyReward?: () => void;
}

/* ─── MAIN COMPONENT ───────────────────────────────── */

export function GiftHubPopup({
  show,
  onClose,
  done,
  total,
  giftsClaimed,
  flyBalance,
  onAddTask,
  onMutateToday,
  isGuest,
  onOpenDailyReward,
}: GiftHubPopupProps) {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [activeTab, setActiveTab] = useState<'earn' | 'shop' | 'inventory'>(
    'earn',
  );
  const dragControls = useDragControls();

  const [claiming, setClaiming] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [openingGiftId, setOpeningGiftId] = useState<string | null>(null);
  const [optimisticExtraClaimed, setOptimisticExtraClaimed] = useState(0);

  const effectiveGiftsClaimed = giftsClaimed + optimisticExtraClaimed;
  const slots = useProgressLogic(done, total, effectiveGiftsClaimed);
  const { data: inventoryData, mutate: mutateInventory } = useInventory();

  // Check Daily Reward Status
  const { data: dailyStatus } = useSWR<any>(
    user ? '/api/daily-reward/status' : null,
    (url: string) => fetch(url).then((res) => res.json()),
  );
  const today = new Date().getDate();
  const hasClaimedDaily =
    dailyStatus?.dailyRewards?.claimedDays?.includes(today);

  const giftBoxItems = useMemo(
    () => (inventoryData?.catalog ?? []).filter((i) => i.slot === 'container'),
    [inventoryData?.catalog],
  );

  const totalOwnedBoxes = useMemo(
    () =>
      giftBoxItems.reduce(
        (sum, item) =>
          sum + (inventoryData?.wardrobe?.inventory?.[item.id] ?? 0),
        0,
      ),
    [giftBoxItems, inventoryData?.wardrobe?.inventory],
  );

  const ownedGiftBoxes = useMemo(
    () =>
      giftBoxItems.filter(
        (item) => (inventoryData?.wardrobe?.inventory?.[item.id] ?? 0) > 0,
      ),
    [giftBoxItems, inventoryData?.wardrobe?.inventory],
  );

  const balance = inventoryData?.wardrobe?.flies ?? flyBalance;
  const hasReadyGift = slots.some((s) => s.status === 'READY');
  const allClaimed = slots.every((s) => s.status === 'CLAIMED');

  /* ─── EFFECTS ─── */

  useEffect(() => {
    setMounted(true);
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    setOptimisticExtraClaimed(0);
  }, [giftsClaimed]);

  useEffect(() => {
    if (show && allClaimed && totalOwnedBoxes > 0) {
      setActiveTab('inventory');
    }
  }, [show, allClaimed, totalOwnedBoxes]);

  useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [show]);

  /* ─── HANDLERS ─── */

  const handleClaimGift = async () => {
    if (claiming || !user) return;
    setClaiming(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/statistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim_gift', timezone: tz }),
      });
      if (!res.ok) return;
      setOptimisticExtraClaimed((prev) => prev + 1);
      onMutateToday();
      mutateInventory();
      globalMutate('/api/skins/inventory');
    } catch (e) {
      console.error(e);
    } finally {
      setClaiming(false);
    }
  };

  const handleBuyItem = async (item: ItemDef) => {
    if (!user || buyingId) return;
    setBuyingId(item.id);
    try {
      const res = await fetch('/api/skins/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (!res.ok) return;
      mutateInventory();
      globalMutate('/api/skins/inventory');
      onMutateToday();
    } catch (e) {
      console.error(e);
    } finally {
      setBuyingId(null);
    }
  };

  const handleOpenItem = (item: ItemDef) => {
    setOpeningGiftId(item.id);
  };

  /* ─── RENDER ─── */

  if (!mounted) return null;

  const mobileVariants = {
    initial: { y: '100%', opacity: 0, scale: 0.96 },
    animate: { y: 0, opacity: 1, scale: 1 },
    exit: { y: '100%', opacity: 0, scale: 0.96 },
  };

  const desktopVariants = {
    initial: { opacity: 0, scale: 0.95, y: 0 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 0 },
  };

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {show && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 z-[1050] bg-black/60 backdrop-blur-md"
              />

              {/* Container: bottom-aligned mobile, centered desktop */}
              <div className="fixed inset-0 z-[1051] flex items-end sm:items-center justify-center pointer-events-none p-0 sm:p-6">
                <motion.div
                  variants={isDesktop ? desktopVariants : mobileVariants}
                  initial="initial"
                  animate={
                    isDesktop
                      ? { ...desktopVariants.animate, x: 0 }
                      : mobileVariants.animate
                  }
                  exit="exit"
                  transition={{
                    type: 'spring',
                    damping: 28,
                    stiffness: 320,
                  }}
                  drag={!isDesktop ? 'y' : false}
                  dragControls={dragControls}
                  dragListener={false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.5 }}
                  dragMomentum={false}
                  dragSnapToOrigin
                  dragDirectionLock
                  onDragEnd={(_e, { offset, velocity }) => {
                    if (offset.y > 100 || velocity.y > 500) onClose();
                  }}
                  style={{
                    touchAction: 'none',
                    transform: 'translate3d(0,0,0)',
                  }}
                  className={cn(
                    'pointer-events-auto w-full sm:max-w-[720px] h-[85vh] sm:h-[80vh] flex flex-col bg-background overflow-hidden relative select-none',
                    isDesktop && 'shadow-2xl',
                    'rounded-t-[32px] sm:rounded-[32px] border-t sm:border border-border/40',
                  )}
                >
                  {/* ─── HEADER ─── */}
                  {!isDesktop && (
                    <div
                      className="absolute top-0 left-0 right-0 h-8 z-50 touch-none flex justify-center items-center"
                      onPointerDown={(e) => dragControls.start(e)}
                    />
                  )}
                  <div
                    className={cn(
                      'relative z-20 px-4 py-4 md:px-6 md:py-5 shrink-0 border-b border-border/40',
                      isDesktop
                        ? 'bg-background/50 backdrop-blur-xl'
                        : 'bg-transparent',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                            Gift Center
                          </h2>
                          <p className="hidden md:block text-sm font-medium text-muted-foreground mt-0.5">
                            Earn & collect rewards
                          </p>
                        </div>

                        {/* Balance Badge */}
                        <div className="flex items-center gap-2 py-1 pl-1 pr-3 border rounded-full bg-secondary border-border">
                          <div className="flex items-center justify-center bg-background rounded-full shadow-sm w-9 h-9 ring-1 ring-black/5 shrink-0">
                            <Fly
                              size={24}
                              className="text-muted-foreground"
                              y={-2}
                            />
                          </div>
                          <span className="text-sm font-black leading-none md:text-lg text-foreground tabular-nums">
                            {balance}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={onClose}
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary/80 text-foreground hover:bg-secondary transition-colors active:scale-90"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* ─── TAB SWITCHER ─── */}
                  <div className="px-4 pt-4 pb-3 shrink-0 md:px-6">
                    <div className="flex p-1 rounded-2xl bg-muted/40 ring-1 ring-border/30">
                      {(['earn', 'shop', 'inventory'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 relative',
                            activeTab === tab
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {tab === 'earn' && (
                            <>
                              <Sparkles
                                className={cn(
                                  'w-4 h-4',
                                  activeTab === 'earn' && 'text-primary',
                                )}
                              />
                              <span className="hidden sm:inline">Rewards</span>
                              <span className="sm:hidden">Earn</span>
                              {hasReadyGift && (
                                <span className="absolute top-2 right-2 sm:static sm:flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                              )}
                            </>
                          )}
                          {tab === 'shop' && (
                            <>
                              <ShoppingBag
                                className={cn(
                                  'w-4 h-4',
                                  activeTab === 'shop' && 'text-primary',
                                )}
                              />
                              Shop
                            </>
                          )}
                          {tab === 'inventory' && (
                            <>
                              <Gift
                                className={cn(
                                  'w-4 h-4',
                                  activeTab === 'inventory' && 'text-primary',
                                )}
                              />
                              My Gifts
                              {totalOwnedBoxes > 0 && (
                                <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-[10px] font-black text-primary-foreground ml-1">
                                  {totalOwnedBoxes}
                                </span>
                              )}
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ─── SCROLLABLE CONTENT ─── */}
                  <div
                    className={cn(
                      'flex-1 relative overflow-hidden',
                      'rounded-t-[24px] border-t border-border/40',
                      isDesktop ? 'bg-card/40 backdrop-blur-md' : 'bg-card/20',
                    )}
                  >
                    <div className="absolute inset-0 overflow-y-auto p-4 md:p-5">
                      <AnimatePresence mode="wait">
                        {activeTab === 'earn' ? (
                          <motion.div
                            key="earn"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.15 }}
                          >
                            {allClaimed ? (
                              <AllCollectedState />
                            ) : (
                              <>
                                <div className="space-y-3 mb-4">
                                  {/* Daily Login Button - Only show if NOT claimed today */}
                                  {!hasClaimedDaily && (
                                    <button
                                      onClick={() => {
                                        onClose();
                                        onOpenDailyReward?.();
                                      }}
                                      className="w-full flex items-center gap-4 p-3 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 group transition-all hover:brightness-105 active:scale-[0.98]"
                                    >
                                      <div className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 flex items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-500">
                                        <CalendarCheck className="w-8 h-8 md:w-9 md:h-9" />
                                      </div>
                                      <div className="flex-1 text-left">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500">
                                          Daily Login
                                        </span>
                                        <h3 className="text-base font-black text-foreground leading-tight">
                                          Check Daily Rewards
                                        </h3>
                                        <p className="text-xs font-medium text-muted-foreground mt-0.5">
                                          See what you can claim today!
                                        </p>
                                      </div>
                                      <div className="bg-background/50 p-2 rounded-full text-muted-foreground group-hover:text-foreground transition-colors">
                                        <ArrowRight className="w-5 h-5" />
                                      </div>
                                    </button>
                                  )}

                                  {slots.map((slot, idx) => (
                                    <MilestoneRow
                                      key={idx}
                                      slot={slot}
                                      index={idx}
                                      claiming={claiming}
                                      onClaim={handleClaimGift}
                                      onAddTask={() => {
                                        onAddTask();
                                        onClose();
                                      }}
                                      isGuest={isGuest}
                                    />
                                  ))}
                                </div>
                                <div className="p-3 rounded-2xl bg-muted/30 ring-1 ring-border/30">
                                  <p className="text-xs font-medium text-muted-foreground text-center leading-relaxed">
                                    Complete daily tasks to earn gift boxes!
                                  </p>
                                </div>
                              </>
                            )}
                          </motion.div>
                        ) : activeTab === 'shop' ? (
                          <motion.div
                            key="shop"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.15 }}
                            className="pb-4"
                          >
                            <div className="mb-4 px-1">
                              <h3 className="text-lg font-bold text-foreground mb-1">
                                Buy Gift Boxes
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                Spend your flies on mystery boxes.
                              </p>
                            </div>

                            {giftBoxItems.length > 0 ? (
                              <div className="grid grid-cols-2 min-[450px]:grid-cols-3 gap-3 md:gap-4">
                                {giftBoxItems.map((item) => (
                                  <ItemCard
                                    key={item.id}
                                    item={item}
                                    mode="shop"
                                    ownedCount={
                                      inventoryData?.wardrobe?.inventory?.[
                                        item.id
                                      ] ?? 0
                                    }
                                    isEquipped={false}
                                    canAfford={
                                      balance >= (item.priceFlies ?? 0) &&
                                      !isGuest
                                    }
                                    actionLoading={buyingId === item.id}
                                    onAction={() => handleBuyItem(item)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-12 opacity-50">
                                <Gift className="w-10 h-10 text-muted-foreground mb-3" />
                                <p className="text-sm font-bold text-muted-foreground">
                                  No gift boxes available
                                </p>
                              </div>
                            )}
                          </motion.div>
                        ) : (
                          <motion.div
                            key="inventory"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.15 }}
                            className="pb-4"
                          >
                            <div className="mb-4 px-1">
                              <h3 className="text-lg font-bold text-foreground mb-1">
                                My Gift Boxes
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                Open boxes to win prizes!
                              </p>
                            </div>

                            {ownedGiftBoxes.length > 0 ? (
                              <div className="grid grid-cols-2 min-[450px]:grid-cols-3 gap-3 md:gap-4">
                                {ownedGiftBoxes.map((item) => (
                                  <ItemCard
                                    key={`owned-${item.id}`}
                                    item={item}
                                    mode="inventory"
                                    ownedCount={
                                      inventoryData?.wardrobe?.inventory?.[
                                        item.id
                                      ] ?? 0
                                    }
                                    isEquipped={false}
                                    canAfford={true}
                                    actionLoading={false}
                                    onAction={() => handleOpenItem(item)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-12 opacity-50">
                                <Gift className="w-10 h-10 text-muted-foreground mb-3" />
                                <p className="text-sm font-bold text-muted-foreground">
                                  No gift boxes to open
                                </p>
                                <p className="text-xs text-muted-foreground/60 mt-1">
                                  Buy or earn boxes to see them here
                                </p>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {openingGiftId && (
        <GiftBoxOpening
          giftBoxId={openingGiftId}
          onClose={() => {
            setOpeningGiftId(null);
            mutateInventory();
            globalMutate('/api/skins/inventory');
          }}
        />
      )}
    </>
  );
}

/* ─── MILESTONE ROW ─────────────────────────────────── */

const MILESTONE_LABELS = ['First Reward', 'Second Reward', 'Third Reward'];

function MilestoneRow({
  slot,
  index,
  claiming,
  onClaim,
  onAddTask,
  isGuest,
}: {
  slot: ProgressSlot;
  index: number;
  claiming: boolean;
  onClaim: () => void;
  onAddTask: () => void;
  isGuest?: boolean;
}) {
  const isClaimed = slot.status === 'CLAIMED';
  const isReady = slot.status === 'READY';
  const isLocked = slot.status === 'LOCKED';
  const isPending = slot.status === 'PENDING';

  return (
    <motion.div
      layout
      className={cn(
        'relative flex items-center gap-4 p-3 rounded-2xl border transition-all duration-300',
        isClaimed && 'bg-primary/5 border-primary/20',
        isReady &&
          'bg-gradient-to-r from-primary/10 to-primary/5 border-primary shadow-[0_0_20px_rgba(34,197,94,0.12)]',
        isLocked && 'bg-muted/20 border-dashed border-muted-foreground/20',
        isPending && 'bg-card border-border/50',
      )}
    >
      {/* Left: Visual */}
      <div
        className={cn(
          'relative flex-shrink-0 w-16 h-16 md:w-20 md:h-20 flex items-center justify-center rounded-2xl overflow-hidden',
          isClaimed && 'bg-primary/10',
          isReady && 'bg-primary/10',
          isLocked && 'bg-muted/50',
          isPending && 'bg-muted/30',
        )}
      >
        {isClaimed ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20"
          >
            <Check className="w-5 h-5 text-primary" strokeWidth={3} />
          </motion.div>
        ) : (
          <div className="-translate-y-1">
            {/* Show Gift for both Locked & Pending */}
            <GiftRive
              width={80}
              height={80}
              isMilestone={!isReady}
              // Optional: Add opacity/grayscale if strictly locked?
              // The user asked to "show the gift as milestone", implying the same look as pending.
            />
          </div>
        )}
      </div>

      {/* Right: Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span
            className={cn(
              'text-[11px] font-bold uppercase tracking-wider',
              (isClaimed || isReady) && 'text-primary',
              (isLocked || isPending) && 'text-muted-foreground',
            )}
          >
            {MILESTONE_LABELS[index]}
          </span>
          <span className="text-[10px] font-bold text-muted-foreground/70 tabular-nums">
            {isClaimed || isReady ? 'Done!' : `${slot.tasksLeft} left`}
          </span>
        </div>

        <div className="mb-2">
          <span
            className={cn(
              'text-lg font-black tracking-tight', // Increased size slightly
              isClaimed && 'text-primary/80',
              isReady && 'text-foreground',
              isLocked && 'text-muted-foreground',
              isPending && 'text-foreground',
            )}
          >
            {isClaimed
              ? 'Collected!'
              : isReady
                ? 'Ready to claim!'
                : `Complete ${slot.target} tasks`}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="relative w-full h-1.5 bg-muted/60 rounded-full overflow-hidden mb-2">
          <motion.div
            initial={{ width: 0 }}
            animate={{
              width: `${isClaimed || isReady ? 100 : slot.percent}%`,
            }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className={cn(
              'h-full rounded-full relative',
              isClaimed && 'bg-primary/40',
              isReady && 'bg-primary',
              isLocked && 'bg-muted-foreground/30',
              isPending &&
                (slot.percent > 50
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-400'
                  : 'bg-primary'),
            )}
          >
            {isReady && (
              <div className="absolute inset-0 bg-white/30 animate-pulse rounded-full" />
            )}
            {isPending && slot.percent > 50 && (
              <div
                className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.3),transparent)] animate-shimmer"
                style={{ backgroundSize: '200% 100%' }}
              />
            )}
          </motion.div>
        </div>

        {/* Actions */}
        {isReady && (
          <button
            onClick={onClaim}
            disabled={claiming || isGuest}
            className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 ring-1 ring-white/20 relative overflow-hidden"
          >
            <span className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/20 to-transparent" />
            {claiming ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin relative z-10" />
                <span className="relative z-10">Claiming...</span>
              </>
            ) : (
              <>
                <Gift className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10">Claim Gift Box</span>
              </>
            )}
          </button>
        )}

        {isLocked && (
          <button
            onClick={onAddTask}
            className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={3} />
            Add tasks to unlock
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ─── ALL COLLECTED STATE ─────────────────────────────── */

function AllCollectedState() {
  const [timeLeft, setTimeLeft] = React.useState('');

  React.useEffect(() => {
    function updateTimer() {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      const diff = tomorrow.getTime() - now.getTime();

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
      );
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-primary/10 ring-1 ring-primary/20">
        <Check className="w-8 h-8 text-primary" strokeWidth={2.5} />
      </div>
      <h3 className="text-lg font-black text-foreground mb-1">
        All Gifts Collected!
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Come back tomorrow for more rewards
      </p>
      <div className="px-4 py-2.5 rounded-2xl bg-muted/50 ring-1 ring-border/30">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Next gifts in{' '}
        </span>
        <span className="text-primary font-black font-mono">{timeLeft}</span>
      </div>
    </div>
  );
}
