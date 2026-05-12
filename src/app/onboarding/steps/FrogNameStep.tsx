'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Shuffle, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { randomFrogIndices } from '@/lib/randomFrogIndices';
import type { OnboardingStepProps } from './types';

const Frog = dynamic(() => import('@/components/ui/FrogOnDeck'), { ssr: false });

const NAME_OPTIONS = [
  'Cookie',
  'Lily',
  'Pickle',
  'Mochi',
  'Sunny',
  'Jelly',
  'Bubbles',
  'Clover',
  'Pebble',
  'Sprout',
  'Waffles',
  'Pip',
  'Noodle',
  'Kiwi',
  'Miso',
  'Bean',
  'Pudding',
  'Poppy',
  'Basil',
  'Tofu',
  'Ziggy',
  'Minty',
  'Dumpling',
  'Freckles',
  'Gummy',
  'Olive',
  'Button',
  'Pickles',
  'Marshmallow',
  'Tadpole',
];

const getRandomName = (currentName?: string) => {
  const availableNames = currentName
    ? NAME_OPTIONS.filter((name) => name.toLowerCase() !== currentName.trim().toLowerCase())
    : NAME_OPTIONS;
  const names = availableNames.length > 0 ? availableNames : NAME_OPTIONS;
  return names[Math.floor(Math.random() * names.length)];
};

export default function FrogNameStep({ selections, onSelect, onNext, onBack, saving, direction }: OnboardingStepProps) {
  const frogIndices = useMemo(() => randomFrogIndices(), []);
  const [initialName] = useState(() => getRandomName());
  const storedName = selections.frogName?.[0];
  const frogName = storedName ?? initialName;
  const canContinue = frogName.trim().length > 0;

  useEffect(() => {
    if (storedName === undefined) {
      onSelect('frogName', initialName);
    }
  }, [initialName, onSelect, storedName]);

  const setName = (value: string) => {
    onSelect('frogName', value.slice(0, 24));
  };

  const shuffleName = () => {
    setName(getRandomName(frogName));
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

      <div className="h-10" />

      <div className="flex flex-col items-center px-4">
        <div className="hidden md:block">
          <Frog
            width={280}
            height={280}
            indices={frogIndices}
            title="What do you want to name your frog?"
          />
        </div>
        <div className="block md:hidden">
          <Frog
            width={230}
            height={230}
            indices={frogIndices}
            title="What do you want to name your frog?"
          />
        </div>

        <p className="text-base md:text-lg font-medium text-muted-foreground text-center mt-4">
          You can change this later.
        </p>

        <motion.div
          key="frog-name"
          custom={direction}
          initial={{ opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -40 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="w-full mt-6 md:mt-8"
        >

          <div className="relative w-full">
            <input
              value={frogName}
              onChange={(event) => setName(event.target.value)}
              className="w-full h-16 md:h-[4.25rem] rounded-3xl border-2 border-border/50 bg-background px-12 text-center text-xl md:text-2xl font-black text-foreground shadow-sm outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
              aria-label="Frog name"
              maxLength={24}
            />
            {frogName.length > 0 && (
              <button
                type="button"
                onClick={() => setName('')}
                className="absolute right-4 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:bg-muted/80"
                aria-label="Clear frog name"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={shuffleName}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-muted font-bold text-muted-foreground shadow-sm transition hover:bg-muted/80 active:scale-[0.98]"
          >
            <Shuffle className="h-4 w-4" />
            Shuffle
          </button>
        </motion.div>
      </div>

      <div className="flex-[8]" />

      <div className="pb-16 flex justify-center">
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
