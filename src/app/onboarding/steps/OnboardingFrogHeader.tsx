'use client';

import dynamic from 'next/dynamic';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { useReducedMotion } from 'framer-motion';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { FrogEmote, FrogEmoteLoop, FrogHandle, WardrobeSlot } from '@/components/ui/frog';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

export const ONBOARDING_BODY_CLASS =
  'pt-[calc(392px+env(safe-area-inset-top))] short:pt-[calc(360px+env(safe-area-inset-top))] md:pt-[434px] lg:pt-0';

export const ONBOARDING_FROG_POSITION_CLASS =
  'inset-x-0 top-[calc(env(safe-area-inset-top)-27px)] short:top-[calc(env(safe-area-inset-top)-11px)] md:-top-10 lg:right-1/2 lg:top-[calc(50vh_-_270px)]';

export const ONBOARDING_FROG_WIDE_POSITION_CLASS =
  'inset-x-0 top-[calc(env(safe-area-inset-top)-27px)] short:top-[calc(env(safe-area-inset-top)-11px)] md:-top-10 lg:top-[calc(50vh_-_270px)]';

const GLIDE = '500ms cubic-bezier(0.32, 0.72, 0, 1)';
export const SCENE_GLIDE_TRANSITION = `top ${GLIDE}, left ${GLIDE}, right ${GLIDE}`;

export const ONBOARDING_SPLIT_CONTAINER_CLASS =
  'lg:max-w-none lg:pl-[calc(50%_+_max(3rem,calc((50%_-_30rem)/2)))] lg:pr-[max(3rem,calc((50%_-_30rem)/2))]';

export const ONBOARDING_SPLIT_BAR_CLASS =
  'lg:left-[calc(50%_+_max(3rem,calc((50%_-_30rem)/2)))] lg:right-[max(3rem,calc((50%_-_30rem)/2))] lg:top-6 lg:px-0';

export const ONBOARDING_SPLIT_STEP_CLASS = 'lg:static lg:justify-center lg:py-24';

// Phone viewports are short enough that a bottom-pinned action lands just below
// the content. A desktop window is far taller, so cap how far the spacer pushes.
export const ONBOARDING_FOOTER_SPACER_CLASS = 'flex-[8] md:max-h-40 lg:max-h-10';

export const ONBOARDING_DOCK_POSITION_CLASS =
  'inset-x-3 top-[calc(238px+env(safe-area-inset-top))] h-14 short:top-[calc(206px+env(safe-area-inset-top))] md:inset-x-0 md:top-[261px] md:mx-auto md:w-full md:max-w-lg lg:right-1/2 lg:top-[calc(50vh_+_31px)] lg:w-auto lg:max-w-[26rem]';
export const ONBOARDING_DOCK_SURFACE_CLASS =
  'rounded-[20px] border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_28px_-18px_rgba(15,23,42,0.35)] dark:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.8)]';

const progressEase = (fraction: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, fraction)), 1.5);

export function OnboardingProgressDock({
  done,
  total,
  className,
  style,
  children,
}: {
  done: number;
  total: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const filled = Math.min(total, done + 1);
  const pct = total > 0 ? progressEase(filled / total) * 100 : 0;
  return (
    <div
      className={cn(
        'pointer-events-none absolute lg:[transition:right_500ms_cubic-bezier(0.32,0.72,0,1)]',
        ONBOARDING_DOCK_POSITION_CLASS,
        ONBOARDING_DOCK_SURFACE_CLASS,
        className,
      )}
      style={style}
    >
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/20" />
      <div className="flex h-full items-center justify-center px-5">
        {children}
        {total > 0 && (
          <div
            role="progressbar"
            aria-label="Onboarding progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={filled}
            className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-primary/15 dark:bg-primary/20"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary shadow-[inset_0_-2px_0_0_rgba(0,0,0,0.14)] transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{ width: `${pct}%` }}
            >
              <span className="absolute inset-x-2 top-[3px] h-[3px] rounded-full bg-white/30" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Default to the bare frog (no hat/body/hand item) so every onboarding screen
// shows the same plain frog instead of a random outfit.
const DEFAULT_FROG_INDICES: Partial<Record<WardrobeSlot, number>> = {
  skin: 0,
  hat: 0,
  body: 0,
  hand_item: 0,
};

export type FrogPose = {
  y: number;
  lift?: number;
  motion: 'hidden' | 'hop' | 'seated';
  clip: string | null;
  fromX: number;
  fromY: number;
  rise: number;
  peak: number;
  cue: { emote: FrogEmote; id: number } | null;
  bump: number;
};

type StageProps = {
  indices?: Partial<Record<WardrobeSlot, number>>;
  hidden?: boolean;
  pose?: FrogPose | null;
  frogRef?: RefObject<FrogHandle | null>;
  emote?: FrogEmoteLoop | null;
  positionClassName?: string;
};

const poseTransition = (motion: FrogPose['motion']) =>
  motion === 'seated'
    ? `transform 280ms cubic-bezier(0.32, 0.72, 0, 1), ${SCENE_GLIDE_TRANSITION}`
    : undefined;

// Rendered once at the page level so the Rive canvas survives step
// transitions instead of remounting (and re-initializing) on every step.
export function OnboardingFrogStage({
  indices = DEFAULT_FROG_INDICES,
  hidden = false,
  pose = null,
  frogRef,
  emote = null,
  positionClassName = ONBOARDING_FROG_POSITION_CLASS,
}: StageProps) {
  const ownFrogRef = useRef<FrogHandle>(null);
  const stageFrogRef = frogRef ?? ownFrogRef;
  const cue = pose?.cue ?? null;
  useEffect(() => {
    if (cue) stageFrogRef.current?.fireEmote(cue.emote);
  }, [cue, stageFrogRef]);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const frogWidth = isDesktop ? 280 : 230;
  const frogHeight = isDesktop ? 315 : 259;
  const bumpClass =
    pose?.motion === 'seated' && pose.bump > 0
      ? pose.bump % 2
        ? 'adopt-frog-bump-a'
        : 'adopt-frog-bump-b'
      : undefined;
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-30 flex justify-center lg:transition-[top,left,right] lg:duration-500 lg:ease-[cubic-bezier(0.32,0.72,0,1)]',
        positionClassName,
        hidden && 'opacity-0',
      )}
      style={
        pose
          ? {
              transform: `translate3d(0, ${pose.y}px, 0)`,
              transition: poseTransition(pose.motion),
              clipPath: pose.clip ?? undefined,
            }
          : undefined
      }
    >
      <div
        data-onboarding-frog
        className={isDesktop ? undefined : 'origin-top short:scale-[0.85]'}
        style={{ width: frogWidth, height: frogHeight }}
      >
        <div
          className={cn(pose?.motion === 'hop' && 'adopt-frog-hop', bumpClass)}
          style={
            pose
              ? ({
                  '--adopt-from-x': `${pose.fromX}px`,
                  '--adopt-from-y': `${pose.fromY}px`,
                  '--adopt-rise': `${pose.rise}px`,
                  '--adopt-peak': `${pose.peak}px`,
                  transformOrigin: '50% 96%',
                  transform:
                    pose.motion === 'hidden'
                      ? `translate3d(${pose.fromX}px, ${pose.fromY + pose.rise}px, 0)`
                      : undefined,
                } as CSSProperties)
              : undefined
          }
        >
          <Frog
            ref={stageFrogRef}
            width={frogWidth}
            height={frogHeight}
            indices={indices}
            paused={hidden || pose?.motion === 'hidden'}
            placeholder={indices === DEFAULT_FROG_INDICES}
            emote={emote}
          />
        </div>
      </div>
    </div>
  );
}

const TYPE_DELAY_MS = 350;
const TYPE_MS_PER_CHAR = 24;

export function useTypewriter(message: string) {
  const reduceMotion = useReducedMotion();
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      setTyped(message.length);
      return;
    }
    setTyped(0);
    const startAt = performance.now() + TYPE_DELAY_MS;
    const interval = window.setInterval(() => {
      const count = Math.floor((performance.now() - startAt) / TYPE_MS_PER_CHAR);
      if (count <= 0) return;
      setTyped(Math.min(message.length, count));
      if (count >= message.length) window.clearInterval(interval);
    }, TYPE_MS_PER_CHAR);
    return () => window.clearInterval(interval);
  }, [message, reduceMotion]);

  return typed;
}

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  speechBubbleMessage?: string;
  speechTypedChars?: number;
  bubblePositionClassName?: string;
};

export const ONBOARDING_TITLE_CLASS =
  'line-clamp-2 text-balance text-center text-xl font-black leading-6 tracking-tight text-foreground';
export const ONBOARDING_SUBTITLE_CLASS =
  'line-clamp-2 text-balance text-center text-[15px] font-medium leading-5 text-muted-foreground md:text-base';

export const ONBOARDING_HEADER_TOP_CLASS =
  'top-[calc(314px+env(safe-area-inset-top))] short:top-[calc(282px+env(safe-area-inset-top))] md:top-[354px] lg:static';

export const ONBOARDING_FLOW_TOP_CLASS =
  'pt-[calc(314px+env(safe-area-inset-top))] short:pt-[calc(282px+env(safe-area-inset-top))] md:pt-[354px] lg:pt-0';

export function OnboardingHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="flex w-full flex-col items-center">
      {eyebrow ? (
        <p className="mb-2 text-center text-[11px] font-black uppercase leading-4 tracking-[0.14em] text-primary">
          {eyebrow}
        </p>
      ) : null}
      <h1 className={ONBOARDING_TITLE_CLASS}>{title}</h1>
      {subtitle ? <p className={cn('mt-2', ONBOARDING_SUBTITLE_CLASS)}>{subtitle}</p> : null}
    </header>
  );
}

export function OnboardingSpeechBubble({
  message,
  typedChars,
  positionClassName = ONBOARDING_FROG_POSITION_CLASS,
}: {
  message: string;
  typedChars?: number;
  positionClassName?: string;
}) {
  return (
    <div className={cn('pointer-events-none absolute z-30 flex justify-center', positionClassName)}>
      <div className="relative h-[259px] w-[230px] md:h-[315px] md:w-[280px]">
        <FrogSpeechBubble
          rate={0}
          done={0}
          total={0}
          fixedMessage={message}
          typedChars={typedChars}
          className="!top-[162px] short:!top-[138px] md:!top-[197px]"
        />
      </div>
    </div>
  );
}

export function OnboardingFrogHeader({
  title,
  subtitle,
  speechBubbleMessage,
  speechTypedChars,
  bubblePositionClassName,
}: Props) {
  if (speechBubbleMessage) {
    return (
      <OnboardingSpeechBubble
        message={speechBubbleMessage}
        typedChars={speechTypedChars}
        positionClassName={bubblePositionClassName}
      />
    );
  }
  return (
    <div className={cn('absolute inset-x-0 z-20 px-5 md:px-8', ONBOARDING_HEADER_TOP_CLASS)}>
      <OnboardingHeading title={title} subtitle={subtitle} />
    </div>
  );
}
