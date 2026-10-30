'use client';

import { motion } from 'framer-motion';
import type { OnboardingStepProps } from './types';
import { cn } from '@/lib/utils';
import {
  OnboardingFrogHeader,
  OnboardingHeading,
  ONBOARDING_BODY_CLASS,
  ONBOARDING_FOOTER_SPACER_CLASS,
  ONBOARDING_HEADER_TOP_CLASS,
  useTypewriter,
} from './OnboardingFrogHeader';
import { OnboardingButton, OnboardingFooter } from './OnboardingFooter';

export default function AboutIntroStep({ selections, onNext, saving }: OnboardingStepProps) {
  const humanName = selections.humanName?.[0]?.trim();
  const frogName = selections.frogName?.[0]?.trim() || 'Cookie';
  const message = `*Ribbit!* Nice to meet you${humanName ? `, ${humanName}` : ''}!`;
  const typed = useTypewriter(message);

  return (
    <div className="relative flex flex-1 flex-col">
      <OnboardingFrogHeader title="" speechBubbleMessage={message} speechTypedChars={typed} />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'absolute inset-x-0 z-20 flex flex-col items-center px-5 text-center md:px-8',
          ONBOARDING_HEADER_TOP_CLASS,
        )}
      >
        <OnboardingHeading
          title="Let's learn a bit about you!"
          subtitle={`${frogName} is curious how you two can grow together.`}
        />
      </motion.div>

      <div className={ONBOARDING_BODY_CLASS} />
      <div className={ONBOARDING_FOOTER_SPACER_CLASS} />

      <OnboardingFooter>
        <OnboardingButton onClick={onNext} loading={saving}>
          Next
        </OnboardingButton>
      </OnboardingFooter>
    </div>
  );
}
