'use client';

import { useEffect, useState } from 'react';
import CelebrationStep from '../onboarding/steps/CelebrationStep';
import { OnboardingFrogStage, OnboardingProgressDock } from '../onboarding/steps/OnboardingFrogHeader';
import { OnboardingBackground } from '@/components/ui/OnboardingBackground';

export default function FinalePreview() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <main className="fixed inset-0 isolate flex flex-col items-center overflow-y-auto overflow-x-hidden bg-background px-5 pt-4">
      <OnboardingBackground />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[calc(300px+env(safe-area-inset-top))] z-[4] bg-[linear-gradient(to_bottom,transparent,hsl(var(--background))_44px)] short:top-[calc(252px+env(safe-area-inset-top))] md:top-[292px]"
      />
      <OnboardingProgressDock done={11} total={11} className="z-[5]" />
      <div className="relative z-10 flex w-full max-w-none flex-col md:max-w-lg lg:max-w-xl" style={{ minHeight: '100%' }}>
        <OnboardingFrogStage indices={{ skin: 1, hat: 0, body: 0, hand_item: 0 }} emote="love" hidden={false} pose={null} />
        <CelebrationStep humanName="Snir" frogName="Pebble" habitCount={3} ready={ready} />
      </div>
    </main>
  );
}
