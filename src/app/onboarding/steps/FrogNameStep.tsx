'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shuffle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import { hapticSelect } from '@/lib/haptics';
import { OnboardingButton, OnboardingFooter } from './OnboardingFooter';
import { OnboardingFrogHeader, ONBOARDING_BODY_CLASS, ONBOARDING_FOOTER_SPACER_CLASS } from './OnboardingFrogHeader';

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

export default function FrogNameStep({ selections, onSelect, onNext, saving, direction }: OnboardingStepProps) {
  const [initialName] = useState(() => getRandomName());
  const [spins, setSpins] = useState(0);
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
    hapticSelect();
    setSpins((n) => n + 1);
    setName(getRandomName(frogName));
  };

  return (
    <div className="flex-1 flex flex-col relative">
      <OnboardingFrogHeader
        title="What do you want to name your frog?"
        subtitle="You can change this later."
      />

      <div className={cn('flex flex-col items-center', ONBOARDING_BODY_CLASS)}>
        <motion.div
          key="frog-name"
          custom={direction}
          initial={{ opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-full flex-col items-center md:max-w-md"
        >
          <form
            className="relative w-full"
            onSubmit={(event) => {
              event.preventDefault();
              if (canContinue && !saving) onNext();
            }}
          >
            <input
              value={frogName}
              onChange={(event) => setName(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              className="h-16 w-full rounded-3xl border-2 border-border/60 bg-card px-12 text-center text-2xl font-black tracking-tight text-foreground shadow-[0_3px_0_0_rgba(0,0,0,0.06)] outline-none transition placeholder:text-muted-foreground/40 focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
              aria-label="Frog name"
              placeholder="Frog name"
              name="frog-nickname"
              maxLength={24}
              enterKeyHint="next"
              autoComplete="off"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
            />
            {frogName.length > 0 && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setName('')}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/70 transition hover:bg-muted active:scale-90"
                aria-label="Clear frog name"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </form>

          <button
            type="button"
            onClick={shuffleName}
            className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/70 bg-card px-5 text-sm font-black text-muted-foreground shadow-[0_3px_0_0_rgba(0,0,0,0.08)] transition-all active:translate-y-[3px] active:shadow-none [@media(hover:hover)]:hover:text-foreground"
          >
            <motion.span
              animate={{ rotate: spins * 180 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="inline-flex"
            >
              <Shuffle className="h-4 w-4" />
            </motion.span>
            Suggest a name
          </button>
        </motion.div>
      </div>

      <div className={ONBOARDING_FOOTER_SPACER_CLASS} />

      <OnboardingFooter>
        <OnboardingButton onClick={onNext} disabled={!canContinue} loading={saving}>
          Next
        </OnboardingButton>
      </OnboardingFooter>
    </div>
  );
}
