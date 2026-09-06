import type { Metadata } from 'next';
import { Suspense } from 'react';
import FlyCatchGame from '@/components/fly-game/FlyCatchGame';
import { openGraphFor } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Fly Catch — the 30-second frog game',
  description:
    'A free 30-second frog game: catch a chaotic swarm, dodge the trap flies, and turn your high score into starter flies for the Frogress to-do list app.',
  alternates: { canonical: '/fly-catch' },
  openGraph: {
    ...openGraphFor({
      title: 'I set a new Frogress high score. Can you beat me?',
      description: '30 seconds. One frog. A very chaotic swarm.',
      path: '/fly-catch',
    }),
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
