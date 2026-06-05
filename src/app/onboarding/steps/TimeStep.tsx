'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { randomFrogIndices } from '@/lib/randomFrogIndices';
import type { OnboardingStepProps } from './types';
import { OnboardingFrogHeader, ONBOARDING_BODY_CLASS } from './OnboardingFrogHeader';

const OPTIONS = [
  { id: 'morning', emoji: '🌅', label: 'Morning person' },
  { id: 'afternoon', emoji: '☀️', label: 'Afternoon grinder' },
  { id: 'evening', emoji: '🌙', label: 'Night owl' },
  { id: 'varies', emoji: '🎲', label: 'It varies' },
];

export default function TimeStep({ selections, onSelect, onNext, onBack, saving, direction }: OnboardingStepProps) {
  const selected = selections['time'] ?? [];
  const frogIndices = useMemo(() => randomFrogIndices(), []);

  return (
    <div className="relative flex flex-1 flex-col">
      <OnboardingFrogHeader
        indices={frogIndices}
        title="When are you most productive?"
        subtitle="We'll use this to suggest the best times for your tasks."
      />

      <div className={cn('flex-1', ONBOARDING_BODY_CLASS)}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key="time"
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex flex-col gap-3">
              {OPTIONS.map((opt) => {
                const isSelected = selected.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onSelect('time', opt.id)}
                    className={cn(
                      'flex items-center gap-4 w-full px-4 py-3.5 md:px-5 md:py-4 rounded-2xl border text-left transition-all duration-200 active:scale-[0.98] hover:scale-[1.01]',
                      isSelected
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border/50 bg-background hover:border-primary/30 hover:bg-muted/40',
                    )}
                  >
                    <span className="text-2xl w-8 text-center shrink-0">{opt.emoji}</span>
                    <span
                      className={cn(
                        'flex-1 text-sm md:text-base font-bold',
                        isSelected ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {opt.label}
                    </span>
                    <div
                      className={cn(
                        'flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all duration-200 shrink-0',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border/50 text-transparent',
                      )}
                    >
                      {isSelected ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Plus className="w-3 h-3 text-muted-foreground/50" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="pt-4 pb-8 md:pb-10 flex justify-center">
        <motion.button
          type="button"
          onClick={onNext}
          disabled={selected.length === 0 || saving}
          whileTap={{ scale: 0.97 }}
          className={cn(
            'w-full md:w-80 h-14 rounded-2xl font-bold text-base tracking-wide transition-all duration-200',
            selected.length > 0 && !saving
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {saving ? 'Setting up...' : "Let's go!"}
        </motion.button>
      </div>
    </div>
  );
}
