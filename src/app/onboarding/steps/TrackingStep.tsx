'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { askTrackingAndMatchAd } from '@/lib/attribution/metaInstall';
import { cn } from '@/lib/utils';
import type { OnboardingStepProps } from './types';
import {
  OnboardingHeading,
  ONBOARDING_FLOW_TOP_CLASS,
  ONBOARDING_FOOTER_SPACER_CLASS,
  ONBOARDING_SPLIT_STEP_CLASS,
} from './OnboardingFrogHeader';
import { OnboardingButton, OnboardingFooter } from './OnboardingFooter';

export default function TrackingStep({ onNext, saving, direction }: OnboardingStepProps) {
  const [requesting, setRequesting] = useState(false);

  const handleContinue = async () => {
    setRequesting(true);
    try {
      await askTrackingAndMatchAd();
    } catch {
    } finally {
      setRequesting(false);
      onNext();
    }
  };

  return (
    <div className={cn('flex-1 flex flex-col relative', ONBOARDING_SPLIT_STEP_CLASS)}>
      <motion.div
        key="tracking"
        custom={direction}
        initial={{ opacity: 0, x: direction * 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className={cn('relative z-20 flex flex-col items-center', ONBOARDING_FLOW_TOP_CLASS)}
      >
        <OnboardingHeading
          title="Help Frogress find more people like you"
          subtitle="Tracking shows us which ads bring people here, so we only pay for the ones that work. Frogress works the same either way."
        />
      </motion.div>

      <div className={ONBOARDING_FOOTER_SPACER_CLASS} />

      <OnboardingFooter>
        <OnboardingButton onClick={handleContinue} disabled={saving} loading={requesting}>
          Continue
        </OnboardingButton>
      </OnboardingFooter>
    </div>
  );
}
