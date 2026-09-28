'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import { OnboardingFrogHeader, ONBOARDING_BODY_CLASS, ONBOARDING_FOOTER_SPACER_CLASS } from './OnboardingFrogHeader';
import { OnboardingButton, OnboardingFooter } from './OnboardingFooter';

export default function HumanNameStep({ selections, onSelect, onNext, saving, direction }: OnboardingStepProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const frogName = selections.frogName?.[0]?.trim() || 'Cookie';
  const humanName = selections.humanName?.[0] ?? '';
  const canContinue = humanName.trim().length > 0;

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const setHumanName = (value: string) => {
    onSelect('humanName', value.slice(0, 40));
  };

  return (
    <div className="flex-1 flex flex-col relative">
      <OnboardingFrogHeader
        title={`*RIBBIT* I like the name ${frogName}!`}
        subtitle="What should I call you?"
        speechBubbleMessage={`*RIBBIT* I like the name ${frogName}!\nWhat should I call you?`}
      />

      <motion.div
        key="human-name"
        custom={direction}
        initial={{ opacity: 0, x: direction * 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className={cn('flex flex-col items-center', ONBOARDING_BODY_CLASS)}
      >
        <form
          className="relative -mt-28 w-full md:max-w-md"
          onSubmit={(event) => {
            event.preventDefault();
            if (canContinue && !saving) onNext();
          }}
        >
          <input
            ref={inputRef}
            value={humanName}
            onChange={(event) => setHumanName(event.target.value)}
            className="relative h-16 w-full rounded-3xl border-2 border-border/60 bg-card px-12 text-center text-xl font-black tracking-tight text-foreground shadow-[0_3px_0_0_rgba(0,0,0,0.06)] outline-none transition placeholder:font-bold placeholder:text-muted-foreground/40 focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
            aria-label="Your name"
            placeholder="Your first name"
            name="given-name"
            maxLength={40}
            enterKeyHint="next"
            autoComplete="given-name"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
          />
          {humanName.length > 0 && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setHumanName('')}
              className="absolute right-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/70 transition hover:bg-muted active:scale-90"
              aria-label="Clear your name"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
      </motion.div>

      <div className={ONBOARDING_FOOTER_SPACER_CLASS} />

      <OnboardingFooter>
        <OnboardingButton onClick={onNext} disabled={!canContinue} loading={saving}>
          Next
        </OnboardingButton>
      </OnboardingFooter>
    </div>
  );
}
