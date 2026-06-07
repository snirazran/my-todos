'use client';

import dynamic from 'next/dynamic';
import { type ReactNode } from 'react';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import type { WardrobeSlot } from '@/components/ui/frog';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

type Props = {
  indices?: Partial<Record<WardrobeSlot, number>>;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  speechBubbleMessage?: string;
};

export const ONBOARDING_BODY_CLASS = 'pt-[370px] md:pt-[398px]';

// Default to the bare frog (no hat/body/hand item) so every onboarding screen
// shows the same plain frog instead of a random outfit.
const DEFAULT_FROG_INDICES: Partial<Record<WardrobeSlot, number>> = {
  skin: 0,
  hat: 0,
  body: 0,
  hand_item: 0,
};

export function OnboardingFrogHeader({
  indices = DEFAULT_FROG_INDICES,
  eyebrow,
  title,
  subtitle,
  speechBubbleMessage,
}: Props) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center md:top-8">
        <div className="relative hidden md:block">
          {speechBubbleMessage ? (
            <FrogSpeechBubble
              rate={0}
              done={0}
              total={0}
              fixedMessage={speechBubbleMessage}
              className="!top-4"
              messageClassName="!whitespace-pre-line !text-sm !leading-tight md:!text-base"
            />
          ) : null}
          <Frog width={280} height={280} indices={indices} />
        </div>
        <div className="relative block md:hidden">
          {speechBubbleMessage ? (
            <FrogSpeechBubble
              rate={0}
              done={0}
              total={0}
              fixedMessage={speechBubbleMessage}
              className="!top-4"
              messageClassName="!whitespace-pre-line !text-sm !leading-tight md:!text-base"
            />
          ) : null}
          <Frog width={230} height={230} indices={indices} />
        </div>
      </div>

      {!speechBubbleMessage ? (
        <div
          className={
            eyebrow
              ? 'absolute inset-x-0 top-[246px] z-20 px-5 md:top-[292px] md:px-8'
              : 'absolute inset-x-0 top-[270px] z-20 px-5 md:top-[294px] md:px-8'
          }
        >
          {eyebrow ? (
            <p className="mb-1 flex h-5 items-center justify-center text-center text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex h-10 items-center justify-center">
            <h1 className="line-clamp-2 text-center text-lg font-black leading-5 tracking-tight text-foreground md:text-xl md:leading-6">
              {title}
            </h1>
          </div>
          <div className="mt-1 flex h-10 items-start justify-center">
            {subtitle ? (
              <p className="line-clamp-2 text-center text-base font-medium leading-5 text-muted-foreground md:text-lg md:leading-6">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
