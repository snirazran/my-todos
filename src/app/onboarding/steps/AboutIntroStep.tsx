'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import { OnboardingFrogHeader } from './OnboardingFrogHeader';

export default function AboutIntroStep({ selections, onNext, saving, direction }: OnboardingStepProps) {
  const humanName = selections.humanName?.[0]?.trim();

  return (
    <div className="flex-1 flex flex-col relative">
      <OnboardingFrogHeader
        title="Let's hop into it!"
        speechBubbleMessage={`*RIBBIT* Nice to meet you${humanName ? `, ${humanName}` : ''}!\nTell me a bit about yourself so we can grow together.`}
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

      <div className="flex flex-col items-center pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
          4 quick questions · under a minute
        </p>
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
          {saving ? 'Setting up...' : "Let's hop!"}
        </motion.button>
      </div>
    </div>
  );
}
