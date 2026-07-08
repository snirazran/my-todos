'use client';

import dynamic from 'next/dynamic';
import { type ReactNode } from 'react';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import type { FrogEmote, WardrobeSlot } from '@/components/ui/frog';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

export const ONBOARDING_BODY_CLASS = 'pt-[430px] short:pt-[382px] md:pt-[398px]';

// Default to the bare frog (no hat/body/hand item) so every onboarding screen
// shows the same plain frog instead of a random outfit.
const DEFAULT_FROG_INDICES: Partial<Record<WardrobeSlot, number>> = {
  skin: 0,
  hat: 0,
  body: 0,
  hand_item: 0,
};

type StageProps = {
  indices?: Partial<Record<WardrobeSlot, number>>;
  emote?: FrogEmote | null;
};

// Rendered once at the page level so the Rive canvas survives step
// transitions instead of remounting (and re-initializing) on every step.
export function OnboardingFrogStage({
  indices = DEFAULT_FROG_INDICES,
  emote = null,
}: StageProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(1.25rem+env(safe-area-inset-top)+1px)] z-30 flex justify-center md:-top-10">
      <div className="hidden md:block">
        <Frog width={280} height={315} indices={indices} emote={emote} />
      </div>
      <div className="block origin-top md:hidden short:scale-[0.85]">
        <Frog width={230} height={259} indices={indices} emote={emote} />
      </div>
    </div>
  );
}

type Props = {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  speechBubbleMessage?: string;
};

export function OnboardingFrogHeader({
  eyebrow,
  title,
  subtitle,
  speechBubbleMessage,
}: Props) {
  return (
    <>
      {speechBubbleMessage ? (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(1.25rem+env(safe-area-inset-top)+1px)] z-30 flex justify-center md:-top-10">
          <div className="relative h-[259px] w-[230px] md:h-[315px] md:w-[280px]">
            <FrogSpeechBubble
              rate={0}
              done={0}
              total={0}
              fixedMessage={speechBubbleMessage}
              className="!top-20 md:!top-24"
              messageClassName="!whitespace-pre-line !text-sm !leading-tight md:!text-base"
            />
          </div>
        </div>
      ) : (
        <div
          className={
            eyebrow
              ? 'absolute inset-x-0 top-[300px] z-20 px-5 short:top-[252px] md:top-[292px] md:px-8'
              : 'absolute inset-x-0 top-[312px] z-20 px-5 short:top-[264px] md:top-[294px] md:px-8'
          }
        >
          {eyebrow ? (
            <p className="mb-1 flex h-5 items-center justify-center text-center text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex items-center justify-center h-10">
            <h1 className="text-lg font-black leading-5 tracking-tight text-center line-clamp-2 text-foreground md:text-xl md:leading-6">
              {title}
            </h1>
          </div>
          <div className="flex items-start justify-center h-10 mt-1">
            {subtitle ? (
              <p className="text-base font-medium leading-5 text-center line-clamp-2 text-muted-foreground md:text-lg md:leading-6">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
