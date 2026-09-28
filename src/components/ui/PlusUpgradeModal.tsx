'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { mutate } from 'swr';
import { Capacitor } from '@capacitor/core';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Bell, Check, ChevronLeft, ChevronRight, Crown, ShieldAlert, Sparkle, X } from 'lucide-react';
import { SAVED_LOOKS_FREE, SAVED_LOOKS_PLUS } from '@/lib/skins/looks';
import { FREE_TAG_LIMIT, PREMIUM_TAG_LIMIT } from '@/lib/tags/limits';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import Frog from '@/components/ui/frog';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import {
  formatPlusPrice,
  getPlusPricing,
  purchasePlus,
  restorePlusPurchases,
  type PlusPriceInfo,
} from '@/lib/purchases';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import { auth } from '@/lib/firebase';

type Step = 0 | 1 | 2;
type View = Step | 'compare';

const STEP_COUNT = 3;

type PlanId = 'yearly' | 'monthly';

const PLAN_DETAILS: Record<
  PlanId,
  { title: string; subtitle: string; trialDays: number; badge?: string }
> = {
  yearly: {
    title: 'Yearly',
    subtitle: '7 days free, then billed once a year',
    trialDays: 7,
    badge: 'Best value',
  },
  monthly: {
    title: 'Monthly',
    subtitle: '3 days free, then billed monthly',
    trialDays: 3,
  },
};

const APPLE_EULA_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const TERMS_URL = 'https://frogress.com/terms';
const PRIVACY_URL = 'https://frogress.com/privacy';

const BENEFITS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'lilyPad',
    title: 'Never lose a streak to one bad day',
    body: 'Extra Lily Pads, plus a free one every month.',
  },
  {
    icon: 'leap',
    title: 'Commitments that bend, not break',
    body: 'Move Leap sessions when life gets busy.',
  },
  {
    icon: 'x2',
    title: 'Motivation that keeps up with you',
    body: 'Every quest and gift pays double.',
  },
];

const desktopQuery = '(min-width: 768px)';

function subscribeDesktop(callback: () => void) {
  const mql = window.matchMedia(desktopQuery);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(desktopQuery).matches,
    () => false,
  );
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function PlusUpgradeModal({
  open,
  onClose,
  onStartTrial,
  placement = 'unknown',
}: {
  open: boolean;
  onClose: () => void;
  onStartTrial?: (plan: PlanId) => void | Promise<void>;
  placement?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [view, setView] = useState<View>(0);
  const [lastStep, setLastStep] = useState<Step>(0);
  const [plan, setPlan] = useState<PlanId>('yearly');
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [sheetReady, setSheetReady] = useState(false);
  const [pricing, setPricing] = useState<Partial<
    Record<PlanId, PlusPriceInfo>
  > | null>(null);
  const [pricingFailed, setPricingFailed] = useState(false);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPricingFailed(false);
    getPlusPricing()
      .then((prices) => {
        if (!cancelled) setPricing(prices);
      })
      .catch((err) => {
        console.error('Could not read Plus prices from the store', err);
        if (!cancelled) setPricingFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setView(0);
      setLastStep(0);
      setPlan('yearly');
      setPurchasing(false);
      setPurchaseError(null);
      setNeedsAccount(false);
      trackAnalyticsEvent('paywall_viewed', { placement });
      trackAnalyticsEvent('paywall_step_viewed', { placement, step: 1 });
    } else {
      setSheetReady(false);
    }
  }, [open, placement]);

  const refreshPremiumState = async () => {
    await mutate(() => true);
    mutateInventoryCaches();
  };

  const confirmPremiumActive = async () => {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch('/api/purchases/sync', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data?.isPremium) return true;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return false;
  };

  const startPurchase = async () => {
    if (purchasing) return;
    if (auth?.currentUser?.isAnonymous) {
      setNeedsAccount(true);
      return;
    }
    setPurchaseError(null);
    setPurchasing(true);
    try {
      const outcome = await purchasePlus(plan, placement);
      if (outcome === 'purchased') {
        await confirmPremiumActive();
        await refreshPremiumState();
        await onStartTrial?.(plan);
        setCelebrating(true);
      }
    } catch (err) {
      console.error('Plus purchase failed', err);
      setPurchaseError("Purchase didn't go through. Please try again.");
    } finally {
      setPurchasing(false);
    }
  };

  const restorePurchases = async () => {
    if (purchasing) return;
    setPurchaseError(null);
    setPurchasing(true);
    try {
      const restored = await restorePlusPurchases();
      if (restored) {
        await refreshPremiumState();
        onClose();
      } else {
        setPurchaseError('No previous purchases found.');
      }
    } catch (err) {
      console.error('Restore purchases failed', err);
      setPurchaseError('Restore failed. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose, open]);

  if (!mounted) return null;

  const goToStep = (target: Step) => {
    setView(target);
    if (target > lastStep) {
      setLastStep(target);
      trackAnalyticsEvent('paywall_step_viewed', { placement, step: target + 1 });
    }
  };

  const goBack = () => {
    if (view === 'compare') setView(0);
    else if (view > 0) setView((view - 1) as Step);
  };

  const trialDays = PLAN_DETAILS[plan].trialDays;
  const reminderDate = addDays(Math.max(1, trialDays - 2));
  const endDate = addDays(trialDays);
  const activeStep: Step = view === 'compare' ? 0 : view;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={onClose}
            className="fixed inset-0 z-[10008] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{
              y: '100%',
              transition: { type: 'spring', damping: 34, stiffness: 380 },
            }}
            transition={{
              type: 'spring',
              damping: 27,
              stiffness: 260,
              mass: 0.9,
            }}
            onAnimationComplete={() => setSheetReady(true)}
            className="pointer-events-none fixed inset-0 z-[10009] flex will-change-transform md:items-center md:justify-center md:p-6"
          >
            <div className="plus-sheet pointer-events-auto relative mx-auto flex h-full w-full flex-col overflow-hidden text-white md:h-[min(640px,calc(100dvh-3rem))] md:w-[min(100vw-3rem,56rem)] md:flex-row md:rounded-[32px] md:shadow-2xl">
              <div aria-hidden className="plus-glow pointer-events-none absolute inset-0" />
              {isDesktop && <DesktopRail ready={sheetReady} />}

              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="relative z-20 flex h-14 shrink-0 items-center justify-between px-4 pt-[env(safe-area-inset-top)] box-content md:box-border md:h-16 md:px-6 md:pt-0">
                  {view !== 0 ? (
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                      aria-label="Back"
                    >
                      <ChevronLeft className="h-5 w-5" strokeWidth={2.75} />
                    </button>
                  ) : (
                    <span aria-hidden className="h-10 w-10" />
                  )}
                  {view === 'compare' ? (
                    <span className="text-sm font-black tracking-tight text-white/90">
                      Free vs Plus
                    </span>
                  ) : (
                    <StepDots step={activeStep} />
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" strokeWidth={2.75} />
                  </button>
                </div>

                <div className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                  <AnimatePresence mode="wait" initial={false}>
                    <StepShell key={String(view)}>
                      {view === 0 && (
                        <WhyPlusStep
                          showHero={!isDesktop}
                          ready={sheetReady}
                          onCompare={() => setView('compare')}
                        />
                      )}
                      {view === 1 && (
                        <TrialStep
                          trialDays={trialDays}
                          reminderDate={reminderDate}
                          endDate={endDate}
                        />
                      )}
                      {view === 2 && (
                        <PlanStep plan={plan} onSelect={setPlan} pricing={pricing} pricingFailed={pricingFailed} />
                      )}
                      {view === 'compare' && <CompareView />}
                    </StepShell>
                  </AnimatePresence>
                </div>

                <div className="relative z-10 shrink-0 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 md:px-10 md:pb-8">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-full h-8 bg-gradient-to-t from-[color:var(--plus-field-deep)] to-transparent"
                  />
                  {(view === 0 || view === 'compare') && (
                    <>
                      <PrimaryButton onClick={() => goToStep(1)}>
                        Try Plus free
                      </PrimaryButton>
                      <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-xs font-bold text-white/70">
                        <Check className="h-3.5 w-3.5 text-[color:var(--plus-gold)]" strokeWidth={3.5} />
                        No charge today · Cancel anytime
                      </p>
                      {view === 0 && (
                        <button
                          type="button"
                          onClick={onClose}
                          className="mt-1 h-10 w-full text-center text-sm font-bold text-white/60 transition-colors hover:text-white"
                        >
                          Not now
                        </button>
                      )}
                    </>
                  )}
                  {view === 1 && (
                    <PrimaryButton onClick={() => goToStep(2)}>Continue</PrimaryButton>
                  )}
                  {view === 2 && (
                    <PlanFooter
                      plan={plan}
                      trialDays={trialDays}
                      selected={pricing?.[plan]}
                      busy={purchasing}
                      error={purchaseError}
                      onStart={startPurchase}
                      onRestore={restorePurchases}
                    />
                  )}
                </div>
              </div>

              <AnimatePresence>
                {needsAccount && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[10011] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
                    onClick={() => setNeedsAccount(false)}
                  >
                    <motion.div
                      initial={{ scale: 0.95, y: 10 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.95, y: 10 }}
                      transition={{
                        type: 'spring',
                        stiffness: 380,
                        damping: 30,
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-sm rounded-[28px] bg-white p-6 text-center text-slate-900 shadow-2xl"
                    >
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                        <ShieldAlert
                          className="h-7 w-7 text-[#4f9149]"
                          strokeWidth={2.5}
                        />
                      </div>
                      <h3 className="mt-3 text-lg font-black tracking-tight">
                        Save your frog first
                      </h3>
                      <p className="mt-2 text-sm font-medium text-slate-600">
                        Plus is tied to your account, so create a free one first.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          window.location.assign('/login?upgrade=1')
                        }
                        className="mt-5 h-12 w-full rounded-2xl bg-[#4f9149] text-[15px] font-black text-white shadow-[0_4px_0_0_#34631f] transition-all hover:brightness-110 active:translate-y-1 active:shadow-none"
                      >
                        Create free account
                      </button>
                      <button
                        type="button"
                        onClick={() => setNeedsAccount(false)}
                        className="mt-2 h-11 w-full rounded-2xl text-sm font-bold text-slate-500 transition-colors hover:text-slate-700"
                      >
                        Not now
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
          {celebrating && (
            <PlusWelcomeCelebration
              onDone={() => {
                setCelebrating(false);
                onClose();
              }}
            />
          )}
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

const PLUS_WELCOME_HIGHLIGHTS = [
  'Double rewards',
  'Every gift opens twice',
  'A free Lily Pad every month',
];

export function PlusWelcomeCelebration({ onDone }: { onDone: () => void }) {
  const { indices: wardrobeIndices } = useWardrobeIndices(true);
  const reduceMotion = useReducedMotion();
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const heroRef = React.useRef<HTMLDivElement>(null);
  const rayOriginRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const hero = heroRef.current;
    const rayOrigin = rayOriginRef.current;
    if (!overlay || !hero || !rayOrigin) return;

    const alignRays = () => {
      const overlayRect = overlay.getBoundingClientRect();
      const heroRect = hero.getBoundingClientRect();
      rayOrigin.style.top = `${heroRect.top - overlayRect.top + heroRect.height / 2}px`;
    };

    alignRays();
    const observer = new ResizeObserver(alignRays);
    observer.observe(hero);
    window.addEventListener('resize', alignRays);
    overlay.addEventListener('scroll', alignRays, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', alignRays);
      overlay.removeEventListener('scroll', alignRays);
    };
  }, []);

  const reveal = (delay: number) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: reduceMotion
      ? { delay }
      : { delay, type: 'spring' as const, damping: 24, stiffness: 300 },
  });
  return (
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10010] flex overflow-x-hidden overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(.75rem,env(safe-area-inset-top))]"
    >
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm" />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          ref={rayOriginRef}
          className="absolute left-1/2 top-[30%] h-[200vmax] w-[200vmax] -translate-x-1/2 -translate-y-1/2"
        >
          <RotatingRays colorClass={RARITY_CONFIG.legendary.rays} />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle, transparent 9rem, rgba(2,6,23,0.8) 70vmax)',
            }}
          />
        </div>
      </div>
      <motion.div
        initial={
          reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 16 }
        }
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
        className="relative z-10 m-auto flex w-full max-w-sm flex-col items-center text-center"
      >
        <div
          ref={heroRef}
          className="relative flex h-[clamp(13rem,27.5dvh,16.5rem)] w-full shrink-0 items-center justify-center"
        >
          <div className="relative">
            <Frog
              width="clamp(13.125rem,28dvh,16.875rem)"
              height="clamp(14.75rem,31.5dvh,19rem)"
              indices={wardrobeIndices}
              emote="love"
            />
            <PremiumFrogAura show compact flySize={50} alwaysPlay />
          </div>
        </div>
        <h2 className="text-[clamp(1.55rem,4dvh,1.875rem)] font-black leading-none tracking-tight text-white">
          Welcome to Plus!
        </h2>
        <p className="mt-[clamp(.3rem,.8dvh,.375rem)] text-sm font-semibold leading-tight text-white/85">
          Your golden fly companion is already by your side.
        </p>

        <div className="mt-[clamp(.75rem,2dvh,1.25rem)] flex w-full max-w-[19rem] flex-col gap-[clamp(.3rem,.8dvh,.5rem)]">
          {PLUS_WELCOME_HIGHLIGHTS.map((perk, i) => (
            <motion.div
              key={perk}
              {...reveal(0.3 + i * 0.12)}
              className="flex items-center gap-2.5 rounded-xl bg-white/15 px-3.5 py-[clamp(.4rem,1dvh,.625rem)] text-left ring-1 ring-white/20 backdrop-blur-md dark:bg-white/10"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950">
                <Check className="h-4 w-4" strokeWidth={3.5} />
              </span>
              <span className="text-sm font-black tracking-tight text-white">
                {perk}
              </span>
            </motion.div>
          ))}
        </div>

        <button
          type="button"
          onClick={onDone}
          className="mt-[clamp(.875rem,2.5dvh,1.5rem)] w-full max-w-[19rem] rounded-2xl bg-amber-500 py-[clamp(.7rem,1.6dvh,.875rem)] text-base font-black tracking-tight text-white shadow-[0_5px_0_0_#b45309] transition-all hover:bg-amber-400 active:translate-y-1 active:shadow-none"
        >
          Let&apos;s go!
        </button>
      </motion.div>
    </motion.div>
  );
}

function PlusFrog({
  ready,
  width,
  height,
}: {
  ready: boolean;
  width: number;
  height: number;
}) {
  const { indices: wardrobeIndices } = useWardrobeIndices(true);
  const indices = React.useMemo(
    () => ({ ...wardrobeIndices }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      wardrobeIndices.skin,
      wardrobeIndices.hat,
      wardrobeIndices.body,
      wardrobeIndices.hand_item,
    ],
  );
  return (
    <div className="relative shrink-0" style={{ width, height }}>
      <div
        aria-hidden
        className="absolute inset-y-0 -inset-x-1/4 bg-[radial-gradient(closest-side,rgba(251,191,36,0.26)_0%,rgba(251,191,36,0.08)_55%,transparent_100%)]"
      />
      {ready && (
        <>
          <Frog width={width} height={height} indices={indices} emote="love" />
          <PremiumFrogAura show alwaysPlay />
        </>
      )}
    </div>
  );
}

function DesktopRail({ ready }: { ready: boolean }) {
  return (
    <aside
      aria-hidden
      className="relative flex w-[42%] shrink-0 flex-col items-center justify-center overflow-hidden bg-[radial-gradient(90%_70%_at_50%_40%,#1d5a3f_0%,#123a2a_55%,#0b271c_100%)]"
    >
      <PlusFrog ready={ready} width={250} height={282} />
      <div className="absolute inset-x-0 bottom-0 p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[color:var(--plus-gold)]">
          Frogress Plus
        </p>
        <p className="mt-1.5 text-lg font-black leading-tight tracking-tight text-white">
          Your backup plan for
          <br />
          habits that stick.
        </p>
      </div>
    </aside>
  );
}

function StepShell({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={
        reduceMotion
          ? { opacity: 0 }
          : {
              opacity: 0,
              x: -24,
              transition: { duration: 0.14, ease: 'easeIn' },
            }
      }
      transition={{ type: 'spring', stiffness: 400, damping: 36, mass: 0.8 }}
      className="flex min-h-full flex-col"
    >
      {children}
    </motion.div>
  );
}

function PrimaryButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative isolate flex h-14 w-full select-none items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(180deg,#fcd34d_0%,#f59e0b_100%)] text-[17px] font-black tracking-tight text-[color:var(--plus-gold-ink)] shadow-[0_4px_0_0_#b45309] ring-1 ring-inset ring-amber-100/60 transition-all [-webkit-tap-highlight-color:transparent] active:translate-y-1 active:shadow-none disabled:translate-y-0 disabled:opacity-60 [@media(hover:hover)]:hover:brightness-105"
    >
      {!reduceMotion && !disabled && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent will-change-transform"
          initial={{ x: '-150%' }}
          animate={{ x: '450%' }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            repeatDelay: 3.6,
            ease: 'easeInOut',
          }}
        />
      )}
      {children}
    </button>
  );
}

function WhyPlusStep({
  showHero,
  ready,
  onCompare,
}: {
  showHero: boolean;
  ready: boolean;
  onCompare: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center px-6 pb-4 text-center md:items-start md:justify-center md:px-10 md:text-left">
      {showHero && (
        <div className="flex justify-center pb-1 pt-3">
          <PlusFrog ready={ready} width={172} height={194} />
        </div>
      )}
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[color:var(--plus-gold)]">
        Frogress Plus
      </p>
      <h2 className="mt-2 text-[1.75rem] font-black leading-[1.08] tracking-tight md:text-[2.1rem]">
        Keep showing up.
        <br />
        <span className="text-[color:var(--plus-gold-soft)]">Even on the hard days.</span>
      </h2>
      <p className="mt-2.5 max-w-xs text-[15px] font-medium leading-snug text-white/75">
        Plus gives you the backup to stay consistent until it sticks.
      </p>

      <ul className="mt-6 w-full max-w-sm space-y-4 text-left">
        {BENEFITS.map((benefit) => (
          <li key={benefit.title} className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] ring-1 ring-inset ring-white/10">
              <Icon name={benefit.icon} className="h-8 w-8" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-black leading-tight">{benefit.title}</span>
              <span className="mt-0.5 block text-[13px] font-medium leading-snug text-white/65">
                {benefit.body}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onCompare}
        className="mt-5 inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-bold text-white/70 transition-colors hover:text-white md:-ml-3"
      >
        See everything in Plus
        <ChevronRight className="h-4 w-4" strokeWidth={2.75} />
      </button>
    </div>
  );
}

function TrialStep({
  trialDays,
  reminderDate,
  endDate,
}: {
  trialDays: number;
  reminderDate: string;
  endDate: string;
}) {
  const rows = [
    {
      icon: <Sparkle className="h-4 w-4" fill="currentColor" />,
      title: 'Today',
      body: 'Everything in Plus unlocks. Nothing to pay.',
      active: true,
    },
    {
      icon: <Bell className="h-4 w-4" strokeWidth={2.75} />,
      title: reminderDate,
      body: 'We remind you your trial is ending.',
      active: false,
    },
    {
      icon: <Crown className="h-4 w-4" strokeWidth={2.75} />,
      title: endDate,
      body: 'Your plan starts. Cancel before and pay nothing.',
      active: false,
    },
  ];
  return (
    <div className="flex flex-1 flex-col justify-center px-6 pb-4 md:px-10">
      <h2 className="text-center text-[1.75rem] font-black leading-[1.08] tracking-tight md:text-left md:text-[2.1rem]">
        {trialDays} days free.
        <br />
        <span className="text-[color:var(--plus-gold-soft)]">No surprises.</span>
      </h2>
      <ol className="mx-auto mt-8 w-full max-w-sm md:mx-0">
        {rows.map((row, i) => (
          <li key={row.title} className="relative flex gap-4 pb-7 last:pb-0">
            {i < rows.length - 1 && (
              <span
                aria-hidden
                className={`absolute bottom-0 left-[19px] top-11 w-0.5 rounded-full ${
                  row.active
                    ? 'bg-[linear-gradient(180deg,var(--plus-gold),rgba(255,255,255,0.2))]'
                    : 'bg-white/20'
                }`}
              />
            )}
            <span
              className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                row.active
                  ? 'bg-[color:var(--plus-gold)] text-[color:var(--plus-gold-ink)] shadow-[0_0_0_5px_rgba(251,191,36,0.2)]'
                  : 'bg-white/10 text-white ring-1 ring-inset ring-white/15'
              }`}
            >
              {row.icon}
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-[15px] font-black leading-tight">{row.title}</p>
              <p className="mt-1 text-[13px] font-medium leading-snug text-white/70">
                {row.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PlanStep({
  plan,
  onSelect,
  pricing,
  pricingFailed,
}: {
  plan: PlanId;
  onSelect: (p: PlanId) => void;
  pricing: Partial<Record<PlanId, PlusPriceInfo>> | null;
  pricingFailed: boolean;
}) {
  const yearly = pricing?.yearly;
  const monthly = pricing?.monthly;
  const yearlyCompareAt =
    yearly && monthly && monthly.currency === yearly.currency
      ? monthly.amount * 12
      : null;
  const placeholder = pricingFailed ? 'See price at checkout' : '—';
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex flex-1 flex-col justify-center px-6 pb-4 md:px-10">
      <div className="relative mx-auto mb-4 flex h-32 w-40 items-center justify-center md:mx-0 md:-ml-4 md:h-28 md:w-32">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(251,191,36,0.3)_0%,rgba(251,191,36,0.08)_55%,transparent_100%)]"
        />
        <motion.div
          className="relative will-change-transform"
          animate={
            reduceMotion
              ? undefined
              : { y: [0, -6, 0], rotate: [0, -2, 0, 2, 0] }
          }
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Icon
            name="frogPlus"
            className="h-28 w-28 drop-shadow-[0_5px_0_rgba(0,0,0,0.3)] md:h-24 md:w-24"
          />
        </motion.div>
      </div>
      <h2 className="text-center text-[1.75rem] font-black leading-[1.08] tracking-tight md:text-left md:text-[2.1rem]">
        Choose your plan
      </h2>
      <p className="mt-2 text-center text-[15px] font-medium text-white/70 md:text-left">
        Nothing is charged today.
      </p>
      <div className="mt-7 space-y-3">
        <PlanCard
          id="yearly"
          selected={plan === 'yearly'}
          onSelect={onSelect}
          badge={PLAN_DETAILS.yearly.badge}
          title={PLAN_DETAILS.yearly.title}
          price={
            <>
              {yearly?.pricePerMonthString
                ? `${yearly.pricePerMonthString}/month`
                : (yearly?.priceString ?? placeholder)}
            </>
          }
          detail={
            yearly ? (
              <>
                {yearly.priceString} a year
                {yearlyCompareAt !== null && yearlyCompareAt > yearly.amount && (
                  <span className="ml-1.5 line-through opacity-60">
                    {formatPlusPrice(yearlyCompareAt, yearly.currency)}
                  </span>
                )}
                {' · '}
                {PLAN_DETAILS.yearly.trialDays} days free
              </>
            ) : (
              PLAN_DETAILS.yearly.subtitle
            )
          }
        />
        <PlanCard
          id="monthly"
          selected={plan === 'monthly'}
          onSelect={onSelect}
          title={PLAN_DETAILS.monthly.title}
          price={monthly ? `${monthly.priceString}/month` : placeholder}
          detail={`${PLAN_DETAILS.monthly.trialDays} days free, then billed monthly`}
        />
      </div>
    </div>
  );
}

function PlanFooter({
  plan,
  trialDays,
  selected,
  busy,
  error,
  onStart,
  onRestore,
}: {
  plan: PlanId;
  trialDays: number;
  selected: PlusPriceInfo | undefined;
  busy: boolean;
  error: string | null;
  onStart: () => void | Promise<void>;
  onRestore: () => void | Promise<void>;
}) {
  const isNative = Capacitor.isNativePlatform();
  const isIos = Capacitor.getPlatform() === 'ios';
  const termsUrl = isIos ? APPLE_EULA_URL : TERMS_URL;
  const termsLabel = isIos ? 'Terms of Use (EULA)' : 'Terms';
  const period = plan === 'yearly' ? 'year' : 'month';
  return (
    <div className="space-y-2.5 text-center">
      {error && (
        <p className="text-xs font-bold text-rose-200" role="alert">
          {error}
        </p>
      )}
      <PrimaryButton onClick={onStart} disabled={busy}>
        {busy ? 'Processing…' : `Start my ${trialDays}-day free trial`}
      </PrimaryButton>
      <p className="text-[11px] font-medium leading-relaxed text-white/60">
        {trialDays} days free, then{' '}
        {selected ? selected.priceString : 'the price shown at checkout'}/{period}.
        Renews automatically until you cancel.{' '}
        <a
          href={termsUrl}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-white"
        >
          {termsLabel}
        </a>
        {' · '}
        <a
          href={PRIVACY_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-white"
        >
          Privacy
        </a>
      </p>
      {isNative && (
        <button
          type="button"
          onClick={onRestore}
          disabled={busy}
          className="h-8 w-full text-center text-xs font-bold text-white/60 transition-colors hover:text-white disabled:opacity-60"
        >
          Restore purchases
        </button>
      )}
    </div>
  );
}

const COMPARISON_ROWS: {
  label: string;
  free: string | null;
  plus: string | null;
}[] = [
  { label: 'Lily Pads held', free: '2', plus: '3' },
  { label: 'Free Lily Pad monthly', free: null, plus: null },
  { label: 'Leap session moves a week', free: '1', plus: '2' },
  { label: 'Flies from every quest', free: '×1', plus: '×2' },
  { label: 'Rewards per gift box', free: '1', plus: '2' },
  {
    label: 'Tags',
    free: String(FREE_TAG_LIMIT),
    plus: String(PREMIUM_TAG_LIMIT),
  },
  { label: 'Wishlist slots', free: '4', plus: '10' },
  {
    label: 'Saved looks',
    free: String(SAVED_LOOKS_FREE),
    plus: String(SAVED_LOOKS_PLUS),
  },
  { label: 'Season Plus track', free: null, plus: null },
  { label: 'Golden fly companion', free: null, plus: null },
];

function CompareView() {
  return (
    <div className="px-6 pb-6 pt-2 md:px-10">
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-2 -top-2 right-0 w-[4.5rem] rounded-2xl bg-white/[0.08] ring-1 ring-inset ring-[color:var(--plus-gold)]/30"
        />
        <div className="relative grid grid-cols-[1fr_3.5rem_4.5rem] items-center pb-2 text-xs font-black uppercase tracking-wider">
          <span />
          <span className="text-center text-white/60">Free</span>
          <span className="text-center text-[color:var(--plus-gold)]">Plus</span>
        </div>
        {COMPARISON_ROWS.map((row, i) => (
          <div
            key={row.label}
            className={`relative grid grid-cols-[1fr_3.5rem_4.5rem] items-center text-sm font-bold ${
              i < COMPARISON_ROWS.length - 1 ? 'border-b border-white/10' : ''
            }`}
          >
            <span className="py-3 pr-3 leading-tight">{row.label}</span>
            <span className="py-3 text-center text-white/55">{row.free ?? '—'}</span>
            <span className="flex justify-center py-3 font-black text-[color:var(--plus-gold-soft)]">
              {row.plus ?? <Check className="h-5 w-5" strokeWidth={3} />}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-5 text-center text-xs font-semibold leading-relaxed text-white/60">
        Also: free trade rerolls, a mid-week area change and ad-free deal rerolls.
      </p>
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  return (
    <div
      role="progressbar"
      aria-label="Plus upgrade progress"
      aria-valuemin={1}
      aria-valuemax={STEP_COUNT}
      aria-valuenow={step + 1}
      className="flex gap-1.5"
    >
      {Array.from({ length: STEP_COUNT }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === step
              ? 'w-6 bg-[color:var(--plus-gold)]'
              : i < step
                ? 'w-1.5 bg-white/70'
                : 'w-1.5 bg-white/25'
          }`}
        />
      ))}
    </div>
  );
}

function PlanCard({
  id,
  selected,
  onSelect,
  badge,
  title,
  price,
  detail,
}: {
  id: PlanId;
  selected: boolean;
  onSelect: (p: PlanId) => void;
  badge?: string;
  title: string;
  price: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(id)}
      className={`relative flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition-all [-webkit-tap-highlight-color:transparent] active:scale-[0.99] ${
        selected
          ? 'bg-white/[0.12] ring-2 ring-[color:var(--plus-gold)]'
          : 'bg-white/[0.05] ring-1 ring-white/15 hover:bg-white/[0.08]'
      }`}
    >
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
          selected
            ? 'bg-[color:var(--plus-gold)] text-[color:var(--plus-gold-ink)]'
            : 'ring-2 ring-inset ring-white/35'
        }`}
      >
        {selected && <Check className="h-4 w-4" strokeWidth={3.5} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-base font-black tracking-tight">{title}</span>
          {badge && (
            <span className="rounded-md bg-[color:var(--plus-gold)] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[color:var(--plus-gold-ink)]">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs font-medium text-white/65">{detail}</span>
      </span>
      <span className="shrink-0 text-right text-[15px] font-black tracking-tight">{price}</span>
    </button>
  );
}
