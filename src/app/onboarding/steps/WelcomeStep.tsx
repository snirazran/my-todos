'use client';

import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import type { OnboardingStepProps } from './types';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

export default function WelcomeStep({ onNext, saving }: OnboardingStepProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-0 px-4">
      <p className="text-lg md:text-xl font-semibold text-primary text-center mb-2 md:mb-3">
        Meet your frog
      </p>
      <h1 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-foreground text-center mb-6 md:mb-10 max-w-sm md:max-w-md lg:max-w-lg leading-snug">
        Your new productivity companion is here!
      </h1>
      <Frog
        width={280}
        height={280}
        indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
      />
      <motion.button
        type="button"
        onClick={onNext}
        disabled={saving}
        whileTap={{ scale: 0.97 }}
        className="mt-6 md:mt-10 w-full md:w-80 h-14 rounded-2xl font-bold text-base tracking-wide transition-all duration-200 bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110"
      >
        {saving ? 'Setting up...' : 'Get Started'}
      </motion.button>
    </div>
  );
}
