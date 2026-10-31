'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import {
  OnboardingFrogHeader,
  OnboardingHeading,
  ONBOARDING_BODY_CLASS,
  ONBOARDING_FLOW_TOP_CLASS,
  ONBOARDING_FOOTER_SPACER_CLASS,
  ONBOARDING_HEADER_TOP_CLASS,
  ONBOARDING_SPLIT_STEP_CLASS,
  useTypewriter,
} from './OnboardingFrogHeader';
import { OnboardingButton, OnboardingFooter } from './OnboardingFooter';
import { hapticSelect, hapticSuccess } from '@/lib/haptics';
import { FROG_TRAITS, FROG_TRAIT_ONBOARDING_BOOST, findFrogTrait, type FrogTrait } from '@/lib/frogTraits';

const EASE = [0.22, 1, 0.36, 1] as const;

type Props = OnboardingStepProps & {
  subStep: number;
  onSubStepChange: (index: number) => void;
};

export default function TraitStep({
  selections,
  onSelect,
  onNext,
  saving,
  direction,
  subStep,
  onSubStepChange,
}: Props) {
  const frogName = selections.frogName?.[0]?.trim() || 'Cookie';
  const trait = findFrogTrait(selections.frogTrait?.[0]);
  const advanceTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    },
    [],
  );

  const pick = (id: string) => {
    if (advanceTimerRef.current !== null) return;
    hapticSelect();
    onSelect('frogTrait', id);
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      onSubStepChange(1);
    }, 240);
  };

  if (subStep > 0 && trait) {
    return <TraitGained frogName={frogName} trait={trait} onNext={onNext} saving={saving} />;
  }

  return (
    <div className={cn('flex flex-1 flex-col', ONBOARDING_SPLIT_STEP_CLASS)}>
      <div className={cn('relative z-20 flex flex-col', ONBOARDING_FLOW_TOP_CLASS)}>
        <OnboardingHeading
          title={`Choose a trait for ${frogName}`}
          subtitle={`${frogName} cares about…`}
        />
        <motion.ul
          key="trait-pick"
          initial={{ opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="mx-auto mt-5 flex w-[calc(100%+2rem)] max-w-[calc(100vw-2rem)] flex-col gap-2.5 pb-6 md:w-full md:max-w-md"
        >
          {FROG_TRAITS.map((option) => {
            const isSelected = trait?.id === option.id;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => pick(option.id)}
                  disabled={saving}
                  className={cn(
                    'flex h-[58px] w-full items-center gap-4 rounded-2xl border-2 bg-card px-4 text-left text-base font-black text-foreground shadow-[0_3px_0_0_rgba(0,0,0,0.06)] transition-all duration-150 [-webkit-tap-highlight-color:transparent] active:translate-y-[2px] active:shadow-none',
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary shadow-none'
                      : 'border-border/60 [@media(hover:hover)]:hover:border-primary/40',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center text-[28px] leading-none transition-transform duration-200',
                      isSelected && 'scale-110',
                    )}
                  >
                    {option.emoji}
                  </span>
                  <span className="flex-1">{option.label}</span>
                  {isSelected ? (
                    <span
                      aria-hidden
                      className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground"
                    >
                      <Check className="h-4 w-4" strokeWidth={3.5} />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </motion.ul>
      </div>
    </div>
  );
}

function TraitGained({
  frogName,
  trait,
  onNext,
  saving,
}: {
  frogName: string;
  trait: FrogTrait;
  onNext: () => void;
  saving: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const typed = useTypewriter(trait.line);
  const [shown, setShown] = useState(reduceMotion ? FROG_TRAIT_ONBOARDING_BOOST : 0);

  useEffect(() => {
    if (reduceMotion) {
      setShown(FROG_TRAIT_ONBOARDING_BOOST);
      return;
    }
    const controls = animate(0, FROG_TRAIT_ONBOARDING_BOOST, {
      delay: 0.45,
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: setShown,
      onComplete: hapticSuccess,
    });
    return () => controls.stop();
  }, [reduceMotion]);

  return (
    <div className={cn('relative flex flex-1 flex-col', ONBOARDING_SPLIT_STEP_CLASS)}>
      <OnboardingFrogHeader title="" speechBubbleMessage={trait.line} speechTypedChars={typed} />

      <div className={cn('absolute inset-x-0 z-20 flex justify-center px-5 md:px-8', ONBOARDING_HEADER_TOP_CLASS)}>
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 420, damping: 24, delay: 0.2 }}
          className="flex w-full items-center gap-3.5 rounded-[22px] border-2 bg-card px-4 py-3 md:max-w-md"
          style={{
            borderColor: `${trait.tint}55`,
            boxShadow: `0 4px 0 0 ${trait.tint}33`,
          }}
        >
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[30px] leading-none"
            style={{ backgroundColor: `${trait.tint}1f` }}
          >
            {trait.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold leading-tight text-muted-foreground">
              {frogName} gained
            </span>
            <span className="mt-0.5 block text-xl font-black leading-tight tracking-tight text-foreground">
              <span className="tabular-nums" style={{ color: trait.tint }}>
                +{shown.toFixed(1)}
              </span>{' '}
              {trait.label}
            </span>
          </span>
        </motion.div>
      </div>

      <div className={ONBOARDING_BODY_CLASS} />
      <div className={ONBOARDING_FOOTER_SPACER_CLASS} />

      <OnboardingFooter>
        <OnboardingButton onClick={onNext} loading={saving}>
          Next
        </OnboardingButton>
      </OnboardingFooter>
    </div>
  );
}
