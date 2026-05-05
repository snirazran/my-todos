'use client';

import { motion } from 'framer-motion';
import { Check, Heart } from 'lucide-react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

const OPTIONS = [
  { id: 'he', label: 'he/him', color: 'text-blue-400 fill-blue-400', borderColor: 'border-blue-400/60 bg-blue-50 dark:bg-blue-400/10' },
  { id: 'she', label: 'she/her', color: 'text-pink-400 fill-pink-400', borderColor: 'border-pink-400/60 bg-pink-50 dark:bg-pink-400/10' },
  { id: 'they', label: 'they/them', color: 'text-purple-400 fill-purple-400', borderColor: 'border-purple-400/60 bg-purple-50 dark:bg-purple-400/10' },
];

export default function GenderStep({ selections, onSelect, onNext, onBack, saving, direction }: OnboardingStepProps) {
  const selected = selections['gender'] ?? [];

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

      <div className="flex-[1]" />

      <div className="flex flex-col items-center px-4">
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

        <motion.div
          key="gender"
          custom={direction}
          initial={{ opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -40 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
        >
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground text-center mb-1">
            Say hello to your frog!
          </h1>
          <p className="text-base md:text-lg font-medium text-muted-foreground text-center mb-6 md:mb-8">
            Choose your frog&apos;s pronouns
          </p>

          <div className="flex flex-col gap-3 w-full">
            {OPTIONS.map((opt) => {
              const isSelected = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelect('gender', opt.id)}
                  className={cn(
                    'flex items-center gap-4 w-full px-5 py-4 md:px-6 md:py-5 rounded-2xl border-2 text-left transition-all duration-200 active:scale-[0.98] hover:scale-[1.01]',
                    isSelected
                      ? opt.borderColor
                      : 'border-border/40 bg-background hover:border-border/60',
                  )}
                >
                  <Heart
                    className={cn(
                      'w-6 h-6 md:w-7 md:h-7 shrink-0 transition-colors duration-200',
                      isSelected ? opt.color : 'text-border/50 fill-border/20',
                    )}
                  />
                  <span
                    className={cn(
                      'flex-1 text-base md:text-lg font-semibold',
                      isSelected ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {opt.label}
                  </span>
                  {isSelected && (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>

      <div className="flex-[8]" />

      <div className="pb-16 flex justify-center">
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
    </div>
  );
}
