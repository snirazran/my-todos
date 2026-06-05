'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { randomFrogIndices } from '@/lib/randomFrogIndices';
import type { OnboardingStepProps } from './types';
import { OnboardingFrogHeader } from './OnboardingFrogHeader';

export default function AboutIntroStep({ selections, onNext, onBack, saving, direction }: OnboardingStepProps) {
  const frogName = selections.frogName?.[0]?.trim() || 'Cookie';
  const frogIndices = useMemo(() => randomFrogIndices(), []);

  return (
    <div className="flex-1 flex flex-col relative">
      <button
        onClick={onBack}
        className="absolute top-2 left-0 flex items-center justify-center w-8 h-8 rounded-full border border-border/60 bg-background text-muted-foreground hover:bg-muted transition z-10"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <OnboardingFrogHeader
        indices={frogIndices}
        title="Let's learn a bit about you!"
        subtitle={`${frogName} is curious about how to grow with you.`}
      />

      <motion.div
        key="about-intro"
        custom={direction}
        initial={{ opacity: 0, x: direction * 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -40 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="pt-[370px] md:pt-[398px]"
      />

      <div className="flex-[8]" />

      <div className="pb-16 flex justify-center">
        <motion.button
          type="button"
          onClick={onNext}
          disabled={saving}
          whileTap={{ scale: 0.97 }}
          className={cn(
            'w-full md:w-80 h-14 rounded-2xl font-bold text-base tracking-wide transition-all duration-200',
            !saving
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {saving ? 'Setting up...' : 'Next'}
        </motion.button>
      </div>
    </div>
  );
}
