'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, type ReactNode } from 'react';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import type { WardrobeSlot } from '@/components/ui/frog';
import { useBackgrounds, type BackgroundItem } from '@/hooks/useBackgrounds';
import { useOnboardingBackgroundStore } from '@/lib/onboardingBackgroundStore';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

type Props = {
  indices?: Partial<Record<WardrobeSlot, number>>;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  speechBubbleMessage?: string;
};

export const ONBOARDING_BODY_CLASS = 'pt-[370px] md:pt-[398px]';

// Remember the last background so consecutive onboarding screens never repeat it.
let lastBackgroundId: string | null = null;

function rollBackgroundId(catalog: BackgroundItem[]): string | null {
  const pool = catalog.filter((b) => !b.hidden);
  if (pool.length === 0) return null;
  let choices = pool.length > 1 ? pool.filter((b) => b.id !== lastBackgroundId) : pool;
  if (choices.length === 0) choices = pool;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  lastBackgroundId = pick.id;
  return pick.id;
}

export function OnboardingFrogHeader({ indices, eyebrow, title, subtitle, speechBubbleMessage }: Props) {
  // Pair a fresh, non-repeating background with each frog outfit. `indices` is a
  // stable reference per screen, so this rolls once per look (as soon as the
  // background catalog is available).
  const { data } = useBackgrounds();
  const catalog = data?.catalog;
  const setBackgroundId = useOnboardingBackgroundStore((s) => s.setBackgroundId);
  const rolledForRef = useRef<Props['indices'] | null>(null);

  useEffect(() => {
    if (!catalog || catalog.length === 0) return;
    if (rolledForRef.current === indices) return;
    const id = rollBackgroundId(catalog);
    if (id) {
      setBackgroundId(id);
      rolledForRef.current = indices;
    }
  }, [indices, catalog, setBackgroundId]);

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
              className="!left-[calc(50%-7.5rem)] !top-4"
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
              className="!left-[calc(50%-7.5rem)] !top-4"
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
