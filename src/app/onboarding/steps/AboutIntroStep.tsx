'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { OnboardingStepProps } from './types';
import { cn } from '@/lib/utils';
import {
  OnboardingFrogHeader,
  ONBOARDING_HEADER_TOP_CLASS,
  ONBOARDING_SUBTITLE_CLASS,
  ONBOARDING_TITLE_CLASS,
} from './OnboardingFrogHeader';

const TYPE_DELAY_MS = 350;
const TYPE_MS_PER_CHAR = 24;
const HOLD_MS = 1400;

export default function AboutIntroStep({ selections, onNext }: OnboardingStepProps) {
  const reduceMotion = useReducedMotion();
  const humanName = selections.humanName?.[0]?.trim();
  const message = `*RIBBIT!* Nice to meet you${humanName ? `, ${humanName}` : ''}!\nTell me a bit about yourself so we can grow together.`;
  const [typed, setTyped] = useState(0);
  const advancedRef = useRef(false);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const totalMs = TYPE_DELAY_MS + message.length * TYPE_MS_PER_CHAR + HOLD_MS;

  const advance = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onNextRef.current();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setTyped(message.length);
      return;
    }
    const startAt = performance.now() + TYPE_DELAY_MS;
    const interval = window.setInterval(() => {
      const count = Math.floor((performance.now() - startAt) / TYPE_MS_PER_CHAR);
      if (count <= 0) return;
      setTyped(Math.min(message.length, count));
      if (count >= message.length) window.clearInterval(interval);
    }, TYPE_MS_PER_CHAR);
    return () => window.clearInterval(interval);
  }, [message, reduceMotion]);

  useEffect(() => {
    const t = window.setTimeout(advance, totalMs);
    return () => window.clearTimeout(t);
  }, [advance, totalMs]);

  return (
    <div
      className="relative flex flex-1 cursor-pointer flex-col [-webkit-tap-highlight-color:transparent]"
      onClick={advance}
    >
      <OnboardingFrogHeader
        title="Let's hop into it!"
        speechBubbleMessage={message}
        speechTypedChars={typed}
      />

      <div
        className={cn(
          'absolute inset-x-0 z-20 flex flex-col items-center px-5 text-center',
          ONBOARDING_HEADER_TOP_CLASS,
        )}
      >
        <div className="flex h-12 items-end justify-center">
          <p className={ONBOARDING_TITLE_CLASS}>4 quick questions</p>
        </div>
        <p className={cn('mt-1.5', ONBOARDING_SUBTITLE_CLASS)}>Under a minute</p>
        <div className="mt-3 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
          <div
            className="onboarding-auto-fill h-full w-full rounded-full bg-primary"
            style={{ '--auto-fill-ms': `${totalMs}ms` } as CSSProperties}
          />
        </div>
      </div>
    </div>
  );
}
