'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { Icon } from '@/components/ui/Icon';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import {
  PlanFooter,
  PlanPicker,
  PlusAccountPrompt,
  TrialTimeline,
  usePlusPaywall,
} from '@/components/ui/PlusUpgradeModal';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import type { WardrobeSlot } from '@/components/ui/frog';
import { OnboardingTopBar } from './OnboardingTopBar';
import { OnboardingButton, OnboardingFooter } from './OnboardingFooter';

const EASE = [0.22, 1, 0.36, 1] as const;

const FROG_LINES = {
  offer: 'Psst! Want to grow\nfaster together?',
  trial: 'I’ll remind you\nbefore it ends. Promise!',
  plans: 'Pick what fits you.\nCancel anytime!',
} as const;

const CARD_CLASS =
  'rounded-[22px] border-2 border-amber-200/90 bg-[linear-gradient(to_bottom,#fffbeb,#ffffff_70%)] shadow-[0_3px_0_0_rgba(217,119,6,0.14)] dark:border-amber-400/25 dark:bg-[linear-gradient(to_bottom,rgba(251,191,36,0.12),rgba(251,191,36,0.03))] dark:shadow-[0_3px_0_0_rgba(0,0,0,0.3)]';

const SPARKLES = [
  { className: '-left-5 top-0 h-3 w-3', delay: '0s' },
  { className: '-right-6 -top-1 h-4 w-4', delay: '0.9s' },
  { className: '-right-3 bottom-[-6px] h-2.5 w-2.5', delay: '1.7s' },
];

function PlusBadge() {
  return (
    <span className="relative inline-flex items-center">
      <span className="relative inline-flex items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#fef3c7_0%,#fcd34d_38%,#f59e0b_100%)] py-2 pl-[46px] pr-4 shadow-[0_8px_20px_-8px_rgba(217,119,6,0.7),inset_0_1px_0_rgba(255,255,255,0.85),inset_0_-2px_0_rgba(180,83,9,0.28)] ring-1 ring-amber-500/40">
        <span className="text-[12.5px] font-black uppercase tracking-[0.16em] text-amber-950">
          Frogress Plus
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-[40%] w-[30%] bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 motion-safe:animate-[plus-cta-shine_3.6s_ease-in-out_0.6s_infinite]"
        />
      </span>
      <Icon
        name="frogPlus"
        className="absolute -left-3 top-1/2 h-[52px] w-[52px] -translate-y-[56%] -rotate-[14deg] drop-shadow-[0_4px_6px_rgba(146,64,14,0.35)]"
      />
      {SPARKLES.map((sparkle) => (
        <svg
          key={sparkle.delay}
          aria-hidden
          viewBox="0 0 16 16"
          className={cn(
            'pointer-events-none absolute text-amber-400 opacity-0 motion-safe:animate-[vault-twinkle_2.6s_ease-in-out_infinite] motion-reduce:opacity-70',
            sparkle.className,
          )}
          style={{ animationDelay: sparkle.delay }}
        >
          <path fill="currentColor" d="M8 0c.6 4.4 3.6 7.4 8 8-4.4.6-7.4 3.6-8 8-.6-4.4-3.6-7.4-8-8 4.4-.6 7.4-3.6 8-8z" />
        </svg>
      ))}
    </span>
  );
}

type Props = {
  frogName: string;
  humanName: string | null;
  habitCount: number;
  indices?: Partial<Record<WardrobeSlot, number>>;
  onDone: () => void;
};

export default function PlusStep({ frogName, humanName, habitCount, indices, onDone }: Props) {
  const {
    mounted,
    step,
    stepDirection,
    plan,
    purchasing,
    purchaseError,
    needsAccount,
    linking,
    linkError,
    pricing,
    pricingFailed,
    reduceMotion,
    setPricingAttempt,
    markClose,
    selectPlan,
    dismissAccountPrompt,
    linkGuestAccount,
    continueWithEmail,
    startPurchase,
    restorePurchases,
    selected,
    paywallContext,
    steps,
    stepIndex,
    onPlans,
    goStep,
    showBack,
    goBack,
    pricesPending,
    ctaLabel,
    caption,
  } = usePlusPaywall({ open: true, onClose: onDone, placement: 'onboarding', frogName });

  const frogRef = useRef<FrogHandle>(null);
  const [frogReady, setFrogReady] = useState(false);
  const shortScreen = useMediaQuery('(max-width: 767px) and (max-height: 700px)');
  const frogHeight = shortScreen ? 178 : 200;
  const frogWidth = Math.round((frogHeight * 128) / 144);

  useEffect(() => {
    const timer = window.setTimeout(() => setFrogReady(true), 280);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (step !== 'offer') frogRef.current?.fireEmote(step === 'trial' ? 'loveHeartbeat' : 'hop');
  }, [step]);

  if (!mounted) return null;

  const trialDuration = selected?.trialDuration ?? null;
  const goal =
    habitCount > 1 ? 'your habits' : habitCount === 1 ? 'your habit' : 'your goals';
  const heading =
    step === 'trial'
      ? { title: 'How your free trial works', subtitle: 'Nothing to pay today.' }
      : step === 'plans'
        ? {
            title: 'Choose your plan',
            subtitle: trialDuration ? 'For after your free trial.' : 'Cancel anytime.',
          }
        : {
            title: humanName ? `${humanName}, make ${goal} stick` : `Make ${goal} stick`,
            subtitle: trialDuration ? `Try Plus free for ${trialDuration}.` : paywallContext.accent,
          };
  const next = () => {
    if (onPlans) void startPurchase();
    else goStep(steps[Math.min(steps.length - 1, stepIndex + 1)]);
  };
  const slide = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: 24 * stepDirection },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -24 * stepDirection },
      };

  return (
    <div className="relative isolate flex w-full flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[72dvh] bg-[radial-gradient(120%_62%_at_50%_0%,rgba(252,211,77,0.32),rgba(252,211,77,0.1)_48%,transparent_78%)] dark:bg-[radial-gradient(120%_62%_at_50%_0%,rgba(251,191,36,0.16),rgba(251,191,36,0.05)_48%,transparent_78%)]"
      />
      <OnboardingTopBar onBack={showBack && !purchasing ? goBack : undefined} />

      <div className="flex w-full flex-col pt-[calc(4rem+env(safe-area-inset-top))] short:pt-[calc(3.25rem+env(safe-area-inset-top))] md:mx-auto md:max-w-md md:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="flex justify-center"
        >
          <PlusBadge />
        </motion.div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="mt-4 text-center short:mt-3"
          >
            <h1 className="flex min-h-[4rem] items-center justify-center text-balance text-[28px] font-black leading-[1.15] tracking-tight text-foreground short:min-h-[3.5rem] short:text-[25px]">
              {heading.title}
            </h1>
            <p
              className={cn(
                'mx-auto mt-1.5 max-w-[19rem] text-balance text-[15px] leading-snug',
                step === 'offer' ? 'font-bold text-primary' : 'font-medium text-muted-foreground',
              )}
            >
              {heading.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="relative mt-[150px] w-full short:mt-[90px]">
          <div
            className="pointer-events-none absolute bottom-[calc(100%-11px)] left-[-18px] z-20"
            style={{ width: frogWidth, height: frogHeight }}
          >
            {frogReady && (
              <Frog
                ref={frogRef}
                width={frogWidth}
                height={frogHeight}
                indices={indices}
                greet="hop"
                paused={!!reduceMotion}
              />
            )}
            {frogReady && !shortScreen && (
              <PremiumFrogAura
                show
                alwaysPlay
                paused={!!reduceMotion}
                flySize={50}
                className="[--premium-fly-top:30%] [--premium-fly-x-max:34px] [--premium-fly-x-min:-84px] [--premium-fly-y-max:16px] [--premium-fly-y-min:-10px]"
              />
            )}
          </div>
          <FrogSpeechBubble
            key={step}
            side
            rate={0}
            done={0}
            total={0}
            fixedMessage={FROG_LINES[step]}
            messageClassName="!text-[14px]"
            className={cn(
              '[--bubble-max:calc(100vw-11.5rem)] md:[--bubble-max:14rem]',
              shortScreen ? '!left-[126px]' : '!left-[140px]',
              step === 'plans' ? '!top-[-46px]' : shortScreen ? '!top-[-34px]' : '!top-[-36px]',
            )}
          />

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              {...slide}
              transition={{ duration: 0.28, ease: EASE }}
              className="relative z-10 flex w-full flex-col"
            >
              {step === 'trial' && selected?.trialPeriod ? (
                <div className={cn(CARD_CLASS, 'px-4 pb-4 pt-6 short:pb-3.5 short:pt-5')}>
                  <TrialTimeline trial={selected.trialPeriod} showFrog={false} compact />
                </div>
              ) : step === 'plans' ? (
                <>
                  <PlanPicker
                    plan={plan}
                    onSelect={selectPlan}
                    pricing={pricing}
                    pricingFailed={pricingFailed}
                    busy={purchasing}
                    onRetry={() => setPricingAttempt((attempt) => attempt + 1)}
                  />
                  <PlanFooter
                    plan={plan}
                    selected={selected}
                    busy={purchasing}
                    onRestore={restorePurchases}
                  />
                </>
              ) : (
                <ul
                  className={cn(
                    CARD_CLASS,
                    'flex flex-col gap-4 px-4 pb-5 pt-6 short:gap-3 short:pb-4 short:pt-5',
                  )}
                >
                  {paywallContext.benefits.map((benefit, index) => (
                    <motion.li
                      key={benefit.title}
                      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 + 0.06 * index, duration: 0.35, ease: EASE }}
                      className="flex items-center gap-3"
                    >
                      <span
                        aria-hidden
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white shadow-[0_2px_0_0_rgba(217,119,6,0.14)] ring-1 ring-amber-200 dark:bg-amber-400/15 dark:shadow-none dark:ring-amber-400/25"
                      >
                        <Icon name={benefit.icon} className="h-8 w-8" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold leading-tight text-foreground">
                          {benefit.title}
                        </span>
                        <span className="mt-0.5 block text-[13px] font-medium leading-snug text-muted-foreground short:hidden">
                          {benefit.body}
                        </span>
                      </span>
                    </motion.li>
                  ))}
                </ul>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-1" />

      <OnboardingFooter
        hint={
          step !== 'offer' && !purchaseError ? null : (
            <span
              aria-live="polite"
              role={purchaseError ? 'alert' : undefined}
              className={purchaseError ? 'text-destructive' : undefined}
            >
              {purchaseError ?? (pricesPending ? ' ' : caption)}
            </span>
          )
        }
      >
        <OnboardingButton
          onClick={next}
          disabled={pricesPending || (onPlans && !selected)}
          loading={purchasing || pricesPending}
          className="isolate overflow-hidden"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-[40%] -z-10 w-[35%] bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 motion-safe:animate-[plus-cta-shine_4.2s_ease-in-out_1.2s_infinite]"
          />
          {ctaLabel}
        </OnboardingButton>
        <OnboardingButton
          variant="ghost"
          onClick={() => {
            markClose('continue_free');
            onDone();
          }}
          disabled={purchasing}
        >
          Not now
        </OnboardingButton>
      </OnboardingFooter>

      <PlusAccountPrompt
        open={needsAccount}
        linking={linking}
        linkError={linkError}
        onDismiss={dismissAccountPrompt}
        onLink={(provider) => void linkGuestAccount(provider)}
        onEmail={continueWithEmail}
      />
    </div>
  );
}
