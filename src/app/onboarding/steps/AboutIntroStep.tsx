'use client';

import { motion } from 'framer-motion';
import type { OnboardingStepProps } from './types';
import { OnboardingFrogHeader, ONBOARDING_FOOTER_SPACER_CLASS } from './OnboardingFrogHeader';
import { OnboardingButton, OnboardingFooter } from './OnboardingFooter';

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
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="pt-[370px] md:pt-[398px]"
      />

      <div className={ONBOARDING_FOOTER_SPACER_CLASS} />

      <OnboardingFooter hint="4 quick questions · under a minute">
        <OnboardingButton onClick={onNext} loading={saving}>
          Let&apos;s hop!
        </OnboardingButton>
      </OnboardingFooter>
    </div>
  );
}
