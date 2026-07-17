import type { Metadata } from 'next';
import { Suspense } from 'react';
import FlyCatchGame from '@/components/fly-game/FlyCatchGame';

export const metadata: Metadata = {
  title: 'Frogress — Can you catch one more?',
  description:
    'Catch a chaotic swarm, dodge trap flies, and turn your high score into starter flies for Frogress.',
  openGraph: {
    title: 'I set a new Frogress high score. Can you beat me?',
    description: '30 seconds. One frog. A very chaotic swarm.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Frogress High Score Challenge',
    description: 'Catch one more. Then turn that momentum into real progress.',
  },
};

export default function FlyCatchPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-[#07170f]" />}>
      <FlyCatchGame />
    </Suspense>
  );
}
