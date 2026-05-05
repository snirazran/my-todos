'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

const OPTIONS = [
  { id: 'productive', emoji: '⚡', label: 'Stay productive' },
  { id: 'habits', emoji: '🔁', label: 'Build better habits' },
  { id: 'plan', emoji: '📅', label: 'Plan my week' },
  { id: 'all', emoji: '🐸', label: 'All of the above' },
];

export default function GoalStep({ selections, onSelect, onNext, onBack, saving, direction }: OnboardingStepProps) {
  const selected = selections['goal'] ?? [];

  return (
    <>
      <div className="flex justify-center" style={{ marginTop: -30, marginBottom: -20 }}>
        <Frog
          width={200}
          height={200}
          indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
        />
      </div>

      <div className="flex-1">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key="goal"
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-2xl font-black tracking-tight text-foreground text-center mb-1">
              What&apos;s your main goal?
            </h1>
            <p className="text-sm font-medium text-muted-foreground text-center mb-8">
              We&apos;ll tailor your experience around this.
            </p>

            <div className="flex flex-col gap-3">
              {OPTIONS.map((opt) => {
                const isSelected = selected.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onSelect('goal', opt.id)}
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
          {saving ? 'Setting up...' : 'Next'}
        </motion.button>
      </div>
    </>
  );
}
