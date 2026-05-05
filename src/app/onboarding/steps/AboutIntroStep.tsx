'use client';

import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

const PRONOUN_COPY: Record<string, string> = {
  he: 'he',
  she: 'she',
  they: 'they',
};

export default function AboutIntroStep({ selections, onNext, onBack, saving, direction }: OnboardingStepProps) {
  const frogName = selections.frogName?.[0]?.trim() || 'Cookie';
  const pronoun = PRONOUN_COPY[selections.gender?.[0] ?? ''] ?? 'they';

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

      <div className="flex-[5]" />

      <motion.div
        key="about-intro"
        custom={direction}
        initial={{ opacity: 0, x: direction * 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -40 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center px-4 text-center"
      >
        <div className="mb-5">
          <div className="hidden md:block">
            <Frog
              width={280}
              height={280}
              indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
            />
          </div>
          <div className="block md:hidden">
            <Frog
              width={230}
              height={230}
              indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
            />
          </div>
        </div>

        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
          Let&apos;s learn a bit about you!
        </h1>
        <p className="mt-3 text-base md:text-lg font-medium leading-snug text-muted-foreground">
          {frogName} is curious about how {pronoun} can grow with you.
        </p>
      </motion.div>

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
