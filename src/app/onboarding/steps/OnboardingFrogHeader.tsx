'use client';

import dynamic from 'next/dynamic';
import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type {
  FrogEmote,
  FrogEmoteLoop,
  FrogHandle,
  WardrobeSlot,
} from '@/components/ui/frog';

const Frog = dynamic(() => import('@/components/ui/frog'), { ssr: false });

export const ONBOARDING_BODY_CLASS =
  'pt-[calc(440px+env(safe-area-inset-top))] short:pt-[calc(392px+env(safe-area-inset-top))] md:pt-[434px]';

// Phone viewports are short enough that a bottom-pinned action lands just below
// the content. A desktop window is far taller, so cap how far the spacer pushes.
export const ONBOARDING_FOOTER_SPACER_CLASS = 'flex-[8] md:max-h-40';

export const ONBOARDING_DOCK_POSITION_CLASS =
  'inset-x-3 top-[calc(286px+env(safe-area-inset-top))] h-14 short:top-[calc(238px+env(safe-area-inset-top))] md:inset-x-0 md:top-[278px] md:mx-auto md:w-full md:max-w-lg lg:max-w-xl';
const ONBOARDING_DOCK_SURFACE_CLASS =
  'rounded-[20px] border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_28px_-18px_rgba(15,23,42,0.35)] dark:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.8)]';

export function OnboardingProgressDock({
  done,
  total,
  className,
  style,
}: {
  done: number;
  total: number;
  className?: string;
  style?: CSSProperties;
}) {
  const filled = Math.min(total, done + 1);
  const pct = total > 0 ? (filled / total) * 100 : 0;
  return (
    <div
      className={cn(
        'pointer-events-none absolute',
        ONBOARDING_DOCK_POSITION_CLASS,
        ONBOARDING_DOCK_SURFACE_CLASS,
        className,
      )}
      style={style}
    >
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/20" />
      <div className="flex h-full items-center px-5">
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
  emote: FrogEmoteLoop | null;
  cue: { emote: FrogEmote; id: number } | null;
  bump: number;
};

type StageProps = {
  indices?: Partial<Record<WardrobeSlot, number>>;
  emote?: FrogEmoteLoop | null;
  hidden?: boolean;
  pose?: FrogPose | null;
  frogRef?: RefObject<FrogHandle | null>;
};

const poseTransition = (motion: FrogPose['motion']) =>
  motion === 'seated' ? 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)' : undefined;

// Rendered once at the page level so the Rive canvas survives step
// transitions instead of remounting (and re-initializing) on every step.
export function OnboardingFrogStage({
  indices = DEFAULT_FROG_INDICES,
  emote = null,
  hidden = false,
  pose = null,
  frogRef,
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
        'pointer-events-none absolute inset-x-0 top-[calc(1.25rem+env(safe-area-inset-top)+1px)] z-30 flex justify-center md:-top-10',
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
            emote={pose ? pose.emote : emote}
            paused={hidden || pose?.motion === 'hidden'}
            placeholder={indices === DEFAULT_FROG_INDICES}
          />
        </div>
      </div>
    </div>
  );
}

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  speechBubbleMessage?: string;
  speechTypedChars?: number;
};

export const ONBOARDING_TITLE_CLASS =
  'line-clamp-2 text-balance text-center text-xl font-black leading-6 tracking-tight text-foreground';
export const ONBOARDING_SUBTITLE_CLASS =
  'line-clamp-2 text-balance text-center text-[15px] font-medium leading-5 text-muted-foreground md:text-base';

export const ONBOARDING_HEADER_TOP_CLASS =
  'top-[calc(346px+env(safe-area-inset-top))] short:top-[calc(298px+env(safe-area-inset-top))] md:top-[338px]';

export function OnboardingFrogHeader({
  title,
  subtitle,
  speechBubbleMessage,
  speechTypedChars,
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
              typedChars={speechTypedChars}
              className="!top-[162px] short:!top-[138px] md:!top-[197px]"
            />
          </div>
        </div>
      ) : (
        <div className={cn('absolute inset-x-0 z-20 px-5 md:px-8', ONBOARDING_HEADER_TOP_CLASS)}>
          <div className="flex h-12 items-end justify-center">
            <h1 className={ONBOARDING_TITLE_CLASS}>{title}</h1>
          </div>
          <div className="mt-1.5 flex h-10 items-start justify-center">
            {subtitle ? <p className={ONBOARDING_SUBTITLE_CLASS}>{subtitle}</p> : null}
          </div>
        </div>
      )}
    </>
  );
}
