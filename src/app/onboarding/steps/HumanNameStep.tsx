'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import { OnboardingFrogHeader, ONBOARDING_BODY_CLASS } from './OnboardingFrogHeader';

export default function HumanNameStep({ selections, onSelect, onNext, onBack, saving, direction }: OnboardingStepProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const frogName = selections.frogName?.[0]?.trim() || 'Cookie';
  const humanName = selections.humanName?.[0] ?? '';
  const canContinue = humanName.trim().length > 0;

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(inset > 80 ? inset : 0);
    };

    updateKeyboardInset();
    viewport.addEventListener('resize', updateKeyboardInset);
    viewport.addEventListener('scroll', updateKeyboardInset);
    return () => {
      viewport.removeEventListener('resize', updateKeyboardInset);
      viewport.removeEventListener('scroll', updateKeyboardInset);
    };
  }, []);

  const setHumanName = (value: string) => {
    onSelect('humanName', value.slice(0, 40));
  };

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
        indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
        emote="love"
        title={`*RIBBIT* I like the name ${frogName}!`}
        subtitle="What should I call you?"
        speechBubbleMessage={`*RIBBIT* I like the name ${frogName}!\nWhat should I call you?`}
      />

      <motion.div
        key="human-name"
        custom={direction}
        initial={{ opacity: 0, x: direction * 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -40 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className={cn('flex flex-col items-center px-4', ONBOARDING_BODY_CLASS)}
      >
        <div className="relative -mt-20 w-full">
          <input
            ref={inputRef}
            value={humanName}
            onChange={(event) => setHumanName(event.target.value)}
            className="relative w-full h-16 md:h-[4.25rem] rounded-3xl border-2 border-border/50 bg-background px-12 text-center text-lg md:text-xl font-bold text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/35 focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
            aria-label="Your name"
            placeholder={`Name for ${frogName}'s human...`}
            maxLength={40}
          />
          {humanName.length > 0 && (
            <button
              type="button"
              onClick={() => setHumanName('')}
              className="absolute right-4 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:bg-muted/80"
              aria-label="Clear your name"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.div>

      <div className="flex-[8]" />

      <div
        className="fixed inset-x-0 z-20 flex justify-center px-5 md:static md:px-0 md:pb-16"
        style={{ bottom: keyboardInset > 0 ? keyboardInset + 16 : 64 }}
      >
        <motion.button
          type="button"
          onClick={onNext}
          disabled={!canContinue || saving}
          whileTap={{ scale: 0.97 }}
          className={cn(
            'w-full md:w-80 h-14 rounded-2xl font-bold text-base tracking-wide transition-all duration-200',
            canContinue && !saving
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
