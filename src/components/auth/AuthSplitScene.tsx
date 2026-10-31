'use client';

import { useId } from 'react';
import {
  OnboardingProgressDock,
  OnboardingSpeechBubble,
  useTypewriter,
} from '@/app/onboarding/steps/OnboardingFrogHeader';
import { OnboardingBackground } from '@/components/ui/OnboardingBackground';
import { DEFAULT_BACKGROUND_IMAGES } from '@/hooks/useBackgrounds';

export const AUTH_SPLIT_MIN_WIDTH = '(min-width: 1024px)';
export const AUTH_SPLIT_FROG_SIZE = { width: 280, height: 315 };

export function FrogressWordmark({ className }: { className?: string }) {
  const arcId = useId();
  return (
    <svg
      aria-label="Frogress"
      role="img"
      viewBox="0 0 220 34"
      className={className}
    >
      <path id={arcId} d="M 36 22 Q 110 6 184 22" fill="none" />
      <text
        fill="currentColor"
        fontSize="20"
        fontWeight="800"
        textAnchor="middle"
        style={{
          fontFamily:
            '"Arial Rounded MT Bold", "Avenir Next Rounded", ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <textPath href={`#${arcId}`} startOffset="50%">
          Frogress
        </textPath>
      </text>
    </svg>
  );
}

export function AuthScenePreload() {
  return (
    <link
      rel="preload"
      as="image"
      href={DEFAULT_BACKGROUND_IMAGES.webLarge}
      media={AUTH_SPLIT_MIN_WIDTH}
      fetchPriority="high"
    />
  );
}

export function AuthSplitScene({ message }: { message: string }) {
  const typed = useTypewriter(message);
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 left-0 right-1/2 -z-20 bg-[linear-gradient(to_bottom,#4aa3ee,#9cc48a_45%,#6f9a63)]"
      />
      <OnboardingBackground className="lg:animate-none" />
      <OnboardingProgressDock done={0} total={0} className="z-[5] lg:fixed">
        <FrogressWordmark className="h-11 w-[285px] shrink-0 translate-y-[11px] overflow-visible text-foreground" />
      </OnboardingProgressDock>
      <OnboardingSpeechBubble
        message={message}
        typedChars={typed}
        positionClassName="inset-x-0 fixed right-1/2 top-[calc(50vh_-_270px)]"
      />
    </>
  );
}
