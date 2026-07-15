'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { mutate } from 'swr';
import { Capacitor } from '@capacitor/core';
import { Icon } from '@/components/ui/Icon';
import { AppImage } from '@/components/ui/AppImage';
import { BadgePercent, Check, Heart, Sparkle, Unlock, X } from 'lucide-react';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import Frog from '@/components/ui/frog';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { purchasePlus, restorePlusPurchases } from '@/lib/purchases';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

type Step = 0 | 1 | 2 | 3;

type PlanId = 'yearly' | 'monthly';

const PLAN_DETAILS: Record<
  PlanId,
  { title: string; price: string; subtitle: string; badge?: string }
> = {
  yearly: {
    title: '12 Months',
    price: '$69.99',
    subtitle: 'Try 7 days free',
    badge: 'BEST DEAL',
  },
  monthly: {
    title: 'Monthly',
    price: '$9.99 every month',
    subtitle: 'Try 3 days free',
  },
};

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

  const [step, setStep] = useState<Step>(0);
  const [plan, setPlan] = useState<PlanId>('yearly');
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setPlan('yearly');
      setPurchasing(false);
      setPurchaseError(null);
      trackAnalyticsEvent('paywall_viewed', { placement });
      trackAnalyticsEvent('paywall_step_viewed', { placement, step: 1 });
    }
  }, [open, placement]);

  const refreshPremiumState = () =>
    mutate((key) => typeof key === 'string' && key.startsWith('/api/quests'));

  const startPurchase = async () => {
    if (purchasing) return;
    setPurchaseError(null);
    setPurchasing(true);
    try {
      const outcome = await purchasePlus(plan, placement);
      if (outcome === 'purchased') {
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

  const next = () => setStep((current) => {
    const nextStep = Math.min(3, current + 1) as Step;
    if (nextStep !== current) {
      trackAnalyticsEvent('paywall_step_viewed', { placement, step: nextStep + 1 });
    }
    return nextStep;
  });

  const trialReminderDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  })();

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
            exit={{ y: '100%', transition: { type: 'spring', damping: 34, stiffness: 380 } }}
            transition={{ type: 'spring', damping: 27, stiffness: 260, mass: 0.9 }}
            className="pointer-events-none fixed inset-0 z-[10009] flex will-change-transform md:items-center md:justify-center md:p-6"
          >
            <div className="pointer-events-auto no-scrollbar relative mx-auto flex h-full w-full flex-col overflow-y-auto overflow-x-hidden bg-[#6c6fce] text-white md:h-[min(720px,calc(100dvh-3rem))] md:w-[min(100vw-3rem,28rem)] md:rounded-[32px] md:shadow-2xl">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>

              <AnimatePresence mode="wait">
                {step === 0 && (
                  <StepShell key="step-0">
                    <Step0
                      onContinue={next}
                      onMaybeLater={onClose}
                    />
                  </StepShell>
                )}
                {step === 1 && (
                  <StepShell key="step-1">
                    <Step1 onContinue={next} />
                  </StepShell>
                )}
                {step === 2 && (
                  <StepShell key="step-2">
                    <Step2 reminderDate={trialReminderDate} onContinue={next} />
                  </StepShell>
                )}
                {step === 3 && (
                  <StepShell key="step-3">
                    <Step3
                      plan={plan}
                      onSelect={setPlan}
                      onStart={startPurchase}
                      onRestore={restorePurchases}
                      busy={purchasing}
                      error={purchaseError}
                    />
                  </StepShell>
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
  'All quests in parallel',
  'Weekly streak rescue',
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
            <PremiumFrogAura show compact flySize={50} />
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

function StepShell({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, x: -32, transition: { duration: 0.16, ease: 'easeIn' } }
      }
      transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.8 }}
      className="relative flex min-h-full flex-1 flex-col will-change-transform"
    >
      {children}
    </motion.div>
  );
}

// Staggered entrance for a step's content blocks: transform + opacity only,
// so it stays composited on mobile GPUs.
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 30,
        mass: 0.7,
        delay,
      }}
      className={className}
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
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="relative h-14 w-full overflow-hidden rounded-2xl bg-white text-base font-black tracking-tight text-violet-700 shadow-sm disabled:opacity-60 dark:text-violet-700"
    >
      {!reduceMotion && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-amber-200/60 to-transparent will-change-transform"
          initial={{ x: '-150%' }}
          animate={{ x: '450%' }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            repeatDelay: 2.6,
            ease: 'easeInOut',
          }}
        />
      )}
      <span className="relative">{children}</span>
    </motion.button>
  );
}

function Step0({
  onContinue,
  onMaybeLater,
}: {
  onContinue: () => void;
  onMaybeLater: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex min-h-full flex-col pb-8">
      <div className="relative -mt-px h-[40vh] min-h-[260px] w-full overflow-hidden md:h-56 md:min-h-0">
        <motion.div
          className="h-full w-full will-change-transform"
          initial={reduceMotion ? undefined : { scale: 1.08 }}
          animate={reduceMotion ? undefined : { scale: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <AppImage
            src="/premium-cover.webp"
            priority
            className="h-full w-full object-cover object-top"
          />
        </motion.div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent to-[#6c6fce]" />
      </div>
      <div className="flex flex-1 flex-col px-6 pb-6 md:pb-5">
      <Reveal delay={0.05}>
        <h2 className="mt-2 text-center text-xl font-black tracking-tight md:text-2xl">
          Become the person who
          <br />
          <span className="text-amber-300">follows through</span>
        </h2>
      </Reveal>
      <div className="mt-5 space-y-3 rounded-2xl bg-white/10 p-4 md:mt-6">
        <Reveal delay={0.12}>
          <FeatureRow
            icon={<Unlock className="h-5 w-5 text-amber-300" />}
            title="Progress on every quest at once"
            subtitle="All quests run together, with unlimited tags."
          />
        </Reveal>
        <Reveal delay={0.18}>
          <FeatureRow
            icon={<span className="text-sm font-black text-amber-300">×2</span>}
            title="Earn outfits twice as fast"
            subtitle="Double rewards on every task and quest — every gift opens twice."
          />
        </Reveal>
        <Reveal delay={0.24}>
          <FeatureRow
            icon={<BadgePercent className="h-5 w-5 text-amber-300" />}
            title="Daily Plus-only discounts"
            subtitle="Fresh discounts in the shop, daily."
          />
        </Reveal>
        <Reveal delay={0.3}>
          <FeatureRow
            icon={<Sparkle className="h-5 w-5 text-amber-300" />}
            title="Season Plus rewards"
            subtitle="The Plus track opens — earn it as you play."
          />
        </Reveal>
        <Reveal delay={0.36}>
          <FeatureRow
            icon={<Heart className="h-5 w-5 text-rose-300" fill="currentColor" />}
            title="Support our mission"
            subtitle="Frogress is built by a tiny team — Plus keeps us going."
          />
        </Reveal>
      </div>

      <Reveal delay={0.38} className="mt-auto space-y-2 pt-6 md:pt-5">
        <PrimaryButton onClick={onContinue}>Try for free</PrimaryButton>
        <button
          type="button"
          onClick={onMaybeLater}
          className="h-10 w-full text-center text-sm font-bold text-white/80 transition-colors hover:text-white"
        >
          Maybe later
        </button>
      </Reveal>
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black leading-tight">{title}</p>
        <p className="mt-0.5 text-xs font-medium text-white/85">{subtitle}</p>
      </div>
    </div>
  );
}

const COMPARISON_ROWS: { label: string; free: boolean }[] = [
  { label: 'All quests in parallel', free: false },
  { label: 'Unlimited tags', free: false },
  { label: 'Double rewards', free: false },
  { label: 'Every gift opens twice', free: false },
  { label: 'Golden fly companion', free: false },
  { label: 'Weekly streak rescue', free: false },
  { label: 'Free trade rerolls', free: false },
  { label: 'Daily outfit deals', free: false },
  { label: 'Season Plus rewards', free: false },
];


function Step1({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex min-h-full flex-col px-6 pb-6 pt-[calc(4rem+env(safe-area-inset-top))] md:pb-5 md:pt-12">
      <Reveal>
        <h2 className="text-center text-2xl font-black tracking-tight">
          Everything you unlock with Plus
        </h2>
      </Reveal>

      <Reveal delay={0.1} className="relative mt-8">
        {/* PLUS column highlight */}
        <div className="absolute -right-3 -top-3 -bottom-3 w-[6.5rem] overflow-hidden rounded-2xl bg-white/15">
          {/* Three evenly-spaced lanes with staggered timing for a calm, flowing stream */}
          <FloatingSparkle delay={0.0} left="22%" size={14} duration={3.6} spin={180} />
          <FloatingSparkle delay={1.2} left="22%" size={20} duration={3.6} spin={180} />
          <FloatingSparkle delay={2.4} left="22%" size={11} duration={3.6} spin={180} />

          <FloatingSparkle delay={0.6} left="50%" size={18} duration={3.6} spin={180} />
          <FloatingSparkle delay={1.8} left="50%" size={12} duration={3.6} spin={180} />
          <FloatingSparkle delay={3.0} left="50%" size={22} duration={3.6} spin={180} />

          <FloatingSparkle delay={0.3} left="78%" size={11} duration={3.6} spin={180} />
          <FloatingSparkle delay={1.5} left="78%" size={16} duration={3.6} spin={180} />
          <FloatingSparkle delay={2.7} left="78%" size={13} duration={3.6} spin={180} />
        </div>

        <div className="relative">
          <div className="grid grid-cols-[1fr_5rem_5rem] items-center pb-3 text-sm font-black">
            <div />
            <div className="text-center text-white/90">Free</div>
            <div className="flex justify-center">
              <span className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-black tracking-wider text-violet-700 dark:text-violet-700">
                PLUS
              </span>
            </div>
          </div>
          {COMPARISON_ROWS.map((row, i) => (
            <Reveal key={row.label} delay={0.16 + i * 0.05}>
              <div
                className={`grid grid-cols-[1fr_5rem_5rem] items-center py-4 text-sm font-bold ${
                  i < COMPARISON_ROWS.length - 1 ? 'border-b border-white/20' : ''
                }`}
              >
                <span>{row.label}</span>
                <div className="flex justify-center">
                  {row.free && <Check className="h-5 w-5 stroke-[3]" />}
                </div>
                <div className="flex justify-center">
                  <Check className="h-5 w-5 stroke-[3]" />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.3} className="mt-auto pt-8">
        <PrimaryButton onClick={onContinue}>Try 7 days free!</PrimaryButton>
      </Reveal>
    </div>
  );
}

function Step2({
  reminderDate,
  onContinue,
}: {
  reminderDate: string;
  onContinue: () => void;
}) {
  const { indices: wardrobeIndices } = useWardrobeIndices(true);
  const step2Indices = React.useMemo(
    () => ({ ...wardrobeIndices }),
    [
      wardrobeIndices.skin,
      wardrobeIndices.hat,
      wardrobeIndices.body,
      wardrobeIndices.hand_item,
    ],
  );
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex min-h-full flex-col px-6 pb-6 pt-[calc(4rem+env(safe-area-inset-top))] md:pb-5 md:pt-12">
      <Reveal>
        <h2 className="text-center text-2xl font-black tracking-tight">
          We&apos;ll remind you <span className="text-amber-300">2 days</span> before your
          trial ends
        </h2>
      </Reveal>
      <Reveal delay={0.08}>
        <p className="mt-3 text-center text-sm font-medium text-white/90">
          You&apos;ll get a push notification on {reminderDate}.
        </p>
      </Reveal>

      <Reveal delay={0.16} className="mt-12 flex justify-center">
        <motion.div
          className="relative will-change-transform"
          animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Frog width={240} height={240} indices={step2Indices} emote="love" />
          <PremiumFrogAura show />
        </motion.div>
      </Reveal>

      <Reveal delay={0.24} className="mt-auto pt-8">
        <PrimaryButton onClick={onContinue}>Try it for free</PrimaryButton>
      </Reveal>
    </div>
  );
}

function Step3({
  plan,
  onSelect,
  onStart,
  onRestore,
  busy,
  error,
}: {
  plan: PlanId;
  onSelect: (p: PlanId) => void;
  onStart: () => void | Promise<void>;
  onRestore: () => void | Promise<void>;
  busy: boolean;
  error: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const isNative = Capacitor.isNativePlatform();
  return (
    <div className="flex min-h-full flex-col px-6 pb-6 pt-[calc(4rem+env(safe-area-inset-top))] md:pb-5 md:pt-12">
      <Reveal>
        <h2 className="text-2xl font-black tracking-tight">
          Choose a plan for after your free trial
        </h2>
      </Reveal>

      <div className="mt-6 space-y-3">
        <Reveal delay={0.08}>
          <PlanCard
            id="yearly"
            selected={plan === 'yearly'}
            onSelect={onSelect}
            badge={PLAN_DETAILS.yearly.badge}
            title={PLAN_DETAILS.yearly.title}
            price={
              <>
                $69.99 <span className="line-through opacity-60">$119.88</span>{' '}
                ($5.83/month)
              </>
            }
            subtitle={PLAN_DETAILS.yearly.subtitle}
          />
        </Reveal>
        <Reveal delay={0.14}>
          <PlanCard
            id="monthly"
            selected={plan === 'monthly'}
            onSelect={onSelect}
            title={PLAN_DETAILS.monthly.title}
            price={PLAN_DETAILS.monthly.price}
            subtitle={PLAN_DETAILS.monthly.subtitle}
          />
        </Reveal>
      </div>

      <Reveal delay={0.2} className="flex flex-1 items-center justify-center">
        <motion.div
          className="will-change-transform"
          animate={reduceMotion ? undefined : { y: [0, -7, 0], rotate: [0, -2, 0, 2, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Icon
            name="frogPlus"
            className="h-44 w-44 drop-shadow-[0_5px_0_rgba(0,0,0,0.3)]"
          />
        </motion.div>
      </Reveal>

      <Reveal delay={0.26} className="mt-auto space-y-2 pt-6 text-center">
        {error && (
          <p className="text-xs font-bold text-rose-200" role="alert">
            {error}
          </p>
        )}
        <p className="text-xs font-medium text-white/85">
          Recurring billing — cancel anytime.
        </p>
        <PrimaryButton onClick={onStart} disabled={busy}>
          {busy
            ? 'Processing…'
            : plan === 'yearly'
              ? 'Start my 7-day free trial'
              : 'Start my 3-day free trial'}
        </PrimaryButton>
        {isNative && (
          <button
            type="button"
            onClick={onRestore}
            disabled={busy}
            className="h-9 w-full text-center text-xs font-bold text-white/70 transition-colors hover:text-white disabled:opacity-60"
          >
            Restore purchases
          </button>
        )}
      </Reveal>
    </div>
  );
}

function FloatingSparkle({
  delay,
  left,
  size,
  duration,
  spin,
}: {
  delay: number;
  left: string;
  size: number;
  duration: number;
  spin: number;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{ left }}
      initial={{ bottom: '-6%', opacity: 0, rotate: 0 }}
      animate={{
        bottom: '102%',
        opacity: [0, 1, 1, 0],
        rotate: spin,
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'linear',
        times: [0, 0.15, 0.8, 1],
      }}
    >
      <Sparkle
        style={{ width: size, height: size }}
        className="text-white/80"
        fill="currentColor"
      />
    </motion.div>
  );
}

function PlanCard({
  id,
  selected,
  onSelect,
  badge,
  title,
  price,
  subtitle,
}: {
  id: PlanId;
  selected: boolean;
  onSelect: (p: PlanId) => void;
  badge?: string;
  title: string;
  price: React.ReactNode;
  subtitle: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(id)}
      whileTap={{ scale: 0.98 }}
      animate={{ scale: selected ? 1.02 : 1 }}
      transition={{ type: 'spring', stiffness: 480, damping: 26 }}
      className={`relative w-full rounded-2xl px-5 py-4 text-left transition-colors will-change-transform ${
        selected
          ? 'bg-white/15 ring-2 ring-white'
          : 'bg-white/10 ring-1 ring-white/15'
      }`}
    >
      {badge && (
        <span className="absolute right-4 top-4 rounded-md bg-white px-2 py-0.5 text-[10px] font-black tracking-wider text-violet-700 dark:text-violet-700">
          {badge}
        </span>
      )}
      <p className="text-lg font-black tracking-tight">{title}</p>
      <p className="mt-1 text-sm font-bold text-white/90">{price}</p>
      <p className="mt-0.5 text-xs font-medium text-white/75">{subtitle}</p>
      <AnimatePresence>
        {selected && (
          <motion.span
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ type: 'spring', stiffness: 520, damping: 24 }}
            className={`absolute ${badge ? 'right-4 top-11' : 'right-4 top-4'} flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#6c6fce]`}
          >
            <Check className="h-4 w-4 stroke-[3.5]" />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
