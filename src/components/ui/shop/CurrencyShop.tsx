'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import Fly from '@/components/ui/fly';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';

const PACKS = [
  {
    id: 'handful',
    name: 'Handful of Flies',
    amount: 10,
    price: '$0.99',
    giftCount: 1,
    bgGradient: 'bg-gradient-to-br from-emerald-500/20 to-emerald-900/40',
    raysColor: 'text-emerald-500',
    badgeClass: 'bg-emerald-500 text-white',
    btnClass: 'bg-emerald-600 text-white border-emerald-800 hover:bg-emerald-500',
  },
  {
    id: 'jar',
    name: 'Jar of Flies',
    amount: 50,
    price: '$3.99',
    giftCount: 3,
    bgGradient: 'bg-gradient-to-br from-violet-500/20 to-purple-900/40',
    raysColor: 'text-violet-500',
    badge: 'Popular',
    badgeClass: 'bg-violet-500 text-white',
    btnClass: 'bg-violet-600 text-white border-violet-800 hover:bg-violet-500',
  },
  {
    id: 'crate',
    name: 'Crate of Flies',
    amount: 100,
    price: '$6.99',
    giftCount: 5,
    bgGradient: 'bg-gradient-to-br from-amber-500/20 to-amber-900/40',
    raysColor: 'text-amber-500',
    badge: 'Best Value',
    badgeClass: 'bg-amber-500 text-amber-950',
    btnClass: 'bg-amber-500 text-amber-950 border-amber-700 hover:bg-amber-400',
  },
];

interface CurrencyShopProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance: number;
  hunger: number;
  maxHunger: number;
}

export function CurrencyShop({
  open,
  onOpenChange,
  balance,
  hunger,
  maxHunger,
}: CurrencyShopProps) {
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkDesktop = () => setIsDesktop(window.matchMedia("(min-width: 640px)").matches);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!mounted) return null;

  const hungerPercent =
    typeof hunger === 'number' && typeof maxHunger === 'number' && maxHunger > 0
      ? Math.max(0, Math.min(100, (hunger / maxHunger) * 100))
      : 100;

  const mobileVariants = {
    initial: { y: '100%', opacity: 0, scale: 0.96 },
    animate: { y: 0, opacity: 1, scale: 1 },
    exit: { y: '100%', opacity: 0, scale: 0.96 }
  };

  const desktopVariants = {
    initial: { opacity: 0, scale: 0.95, y: 0 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 0 }
  };

  const onClose = () => onOpenChange(false);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-md"
          />

          {/* Sheet Container */}
          <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center pointer-events-none p-0 sm:p-6">
            <motion.div
              variants={isDesktop ? desktopVariants : mobileVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              drag={!isDesktop ? "y" : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(e, { offset, velocity }) => {
                if (offset.y > 100 || velocity.y > 500) {
                  onClose();
                }
              }}
              className="pointer-events-auto w-full sm:max-w-4xl h-[90vh] sm:h-auto sm:max-h-[85vh] flex flex-col bg-background/95 backdrop-blur-2xl rounded-t-[32px] sm:rounded-[40px] shadow-2xl border-t sm:border border-border/40 overflow-hidden relative"
            >
              {/* Drag Handle (Mobile Only) */}
              {!isDesktop && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-muted-foreground/20 rounded-full z-50" />
              )}

              {/* FIXED HEADER */}
              <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between border-b border-border/40 bg-background/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10">
                    <Sparkles className="w-5 h-5 text-primary fill-primary/20 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight text-foreground uppercase">
                      Fly Shop
                    </h2>
                    <div className="flex items-center gap-3 mt-0.5">
                      <div className="flex items-center gap-1.5">
                        <Fly size={14} y={-1} paused={false} />
                        <span className="text-[10px] font-black text-muted-foreground tabular-nums">
                          {balance}
                        </span>
                      </div>
                      <div className="w-[1px] h-2 bg-border/60" />
                      <div className="flex items-center gap-1.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full", 
                          hungerPercent > 50 ? "bg-emerald-500" : "bg-amber-500"
                        )} />
                        <span className="text-[10px] font-black text-muted-foreground tabular-nums">
                          {Math.round(hungerPercent)}% HUNGER
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 bg-muted/50 hover:bg-red-500/10 hover:text-red-500 rounded-full transition-all text-muted-foreground active:scale-90"
                >
                  <X className="w-5 h-5" strokeWidth={3} />
                </button>
              </div>

              {/* SCROLLABLE CONTENT */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-hide">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto">
                  {PACKS.map((pack) => {
                    const isJar = pack.id === 'jar';
                    const isCrate = pack.id === 'crate';

                    return (
                      <button
                        key={pack.id}
                        className={cn(
                          "group relative flex flex-col shrink-0 w-full p-2 rounded-[32px] border transition-all duration-300 active:scale-[0.98] overflow-hidden text-center",
                          isCrate
                            ? "bg-gradient-to-b from-amber-500/10 to-transparent border-amber-500/50 shadow-xl hover:shadow-2xl hover:border-amber-500"
                            : isJar
                              ? "bg-gradient-to-b from-violet-500/10 to-transparent border-violet-500/50 shadow-lg hover:shadow-xl hover:border-violet-500"
                              : "bg-card border-border hover:border-emerald-500/40 hover:bg-muted/30 shadow-md"
                        )}
                        onClick={() => { }}
                      >
                        <div className="flex flex-col items-center justify-center w-full px-2 pt-3 pb-2 gap-1.5 h-14">
                          {pack.badge && (
                            <div className={cn(
                              "px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest shadow-sm whitespace-nowrap",
                              pack.badgeClass
                            )}>
                              {pack.badge}
                            </div>
                          )}
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center line-clamp-1">
                            {pack.name}
                          </span>
                        </div>

                        {/* HERO VISUAL AREA */}
                        <div className="relative w-full aspect-[4/3] flex flex-col items-center justify-center mb-4 mt-2 overflow-hidden rounded-[20px]">
                          {/* 1. Base Gradient */}
                          <div className={cn("absolute inset-0 opacity-100", pack.bgGradient)} />

                          {/* 2. Kinetic Background (Universal Rays) */}
                          <div className="absolute inset-[-50%] opacity-40 pointer-events-none">
                            <RotatingRays colorClass={pack.raysColor} />
                          </div>

                          {/* 3. The Loot Cluster */}
                          <div className="relative z-10 w-full h-full flex items-center justify-center gap-0">
                            {/* Flies Group */}
                            <div className="flex flex-col items-center gap-1 shrink-0 px-1">
                              <div className="w-16 h-20 flex items-center justify-center relative filter drop-shadow-xl">
                                <Fly size={50} y={-2} paused={false} />
                              </div>
                              <div className="flex flex-col items-center leading-tight">
                                <span className="text-xl font-black text-foreground tabular-nums drop-shadow-sm">
                                  {pack.amount}
                                </span>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-80">
                                  Flies
                                </span>
                              </div>
                            </div>

                            {/* Gift Group */}
                            {pack.giftCount > 0 && (
                              <div className="flex flex-col items-center gap-1 shrink-0 px-1">
                                <div className="w-16 h-20 flex items-center justify-center relative filter drop-shadow-xl -translate-y-3">
                                  <GiftRive width={80} height={80} />
                                </div>
                                <div className="flex flex-col items-center leading-tight">
                                  <span className="text-xl font-black text-rose-500 tabular-nums drop-shadow-sm">
                                    +{pack.giftCount}
                                  </span>
                                  <span className="text-[10px] font-bold text-rose-500/80 uppercase tracking-widest opacity-90">
                                    {pack.giftCount > 1 ? 'Gifts' : 'Gift'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Price Button */}
                        <div className={cn(
                          "w-full py-3.5 rounded-2xl font-black text-base uppercase tracking-widest transition-all mt-auto relative shadow-md border-b-4 active:border-b-0 active:translate-y-1 active:shadow-inner",
                          pack.btnClass
                        )}>
                          <span className="relative z-10">{pack.price}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Premium Management Section (Admin/Debug) */}
                <div className="mt-8 p-4 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-2xl border border-indigo-500/20">
                  <h3 className="text-sm font-black uppercase tracking-widest text-indigo-500 mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Premium Status
                  </h3>
                  
                  <PremiumControls />
                </div>

                {/* Footer Info */}
                <div className="mt-8 text-center space-y-2 pb-8">
                  <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Secure Store Payment</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 font-bold max-w-xs mx-auto">
                    Purchases support development and keep the frog fed. Thank you for your support!
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function PremiumControls() {
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch status on mount
  useEffect(() => {
    fetch('/api/user')
      .then(res => res.json())
      .then(data => {
        setPremiumUntil(data.premiumUntil);
      })
      .catch(err => console.error("Failed to fetch user data", err));
  }, []);

  const handleUpdate = async (action: 'add' | 'remove', days?: number) => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, days }),
      });
      const data = await res.json();
      if (data.success) {
         setPremiumUntil(data.premiumUntil);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const isPremium = premiumUntil && new Date(premiumUntil) > new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
         <span className={cn(
           "text-xs font-bold px-2 py-1 rounded-lg border",
           isPremium ? "bg-indigo-500 text-white border-indigo-600" : "bg-muted text-muted-foreground border-border"
         )}>
           {isPremium ? "PREMIUM ACTIVE" : "FREE PLAN"}
         </span>
         {isPremium && (
           <span className="text-[10px] font-medium text-muted-foreground">
             Expires: {new Date(premiumUntil!).toLocaleDateString()}
           </span>
         )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={loading}
          onClick={() => handleUpdate('add', 7)}
          className="p-2 bg-card border border-border rounded-xl text-[10px] font-bold hover:bg-indigo-500/10 hover:border-indigo-500/50 transition-all"
        >
          + 7 Days Free
        </button>
        <button
           disabled={loading}
           onClick={() => handleUpdate('add', 30)}
           className="p-2 bg-card border border-border rounded-xl text-[10px] font-bold hover:bg-purple-500/10 hover:border-purple-500/50 transition-all"
        >
          + 1 Month
        </button>
        <button
           disabled={loading}
           onClick={() => handleUpdate('add', 1/1440)}
           className="p-2 bg-card border border-border rounded-xl text-[10px] font-bold hover:bg-yellow-500/10 hover:border-yellow-500/50 transition-all"
        >
          + 1 Min (Test)
        </button>
        <button
           disabled={loading}
           onClick={() => handleUpdate('remove')}
           className="col-span-2 p-2 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-[10px] font-bold hover:bg-red-500/20 hover:border-red-500/40 transition-all"
        >
          Remove Premium
        </button>
      </div>
    </div>
  );
}