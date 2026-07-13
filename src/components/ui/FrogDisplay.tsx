'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Frog, {
  type FrogHandle,
  type WardrobeSlot,
} from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { FrogSpeechBubble } from './FrogSpeechBubble';
import { PremiumFrogAura } from './PremiumFrogAura';
import { useInventory } from '@/hooks/useInventory';
import { useLoginStreak } from '@/hooks/useLoginStreak';
import useSWR from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import type { FrogSpeechContext } from '@/lib/frogSpeech';
import { cn } from '@/lib/utils';
import { prefetchQuests } from './QuestsPanel';

const HUNGER_SEGMENTS = 6;

type Props = {
  frogRef: React.RefObject<FrogHandle | null>;
  frogBoxRef?: React.RefObject<HTMLDivElement | null>;
  mouthOpen?: boolean;
  mouthOffset?: { x?: number; y?: number };
  indices?: Partial<Record<WardrobeSlot, number>>;
  openWardrobe: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  flyBalance?: number;
  rate?: number;
  done?: number;
  total?: number;
  isCatching?: boolean;
  animateBalance?: boolean;
  animateHunger?: boolean;
  hunger?: number;
  maxHunger?: number;
  isGuest?: boolean;
  questClaimableCount?: number;
  questActiveCount?: number;
  deferInventorySummary?: boolean;
  paused?: boolean;
  showActionButtons?: boolean;
  showSpeechBubble?: boolean;
  // Renders the bubble with exactly this text (demo/guest contexts) instead of
  // the fact-driven speech engine.
  fixedSpeech?: string | null;
};

export function FrogDisplay({
  frogRef,
  frogBoxRef,
  mouthOpen = false,
  mouthOffset,
  indices,
  openWardrobe,
  onOpenChange,
  className = '',
  flyBalance,
  rate,
  done,
  total,
  isCatching,
  animateBalance = true,
  animateHunger = true,
  hunger,
  maxHunger,
  isGuest,
  questClaimableCount = 0,
  questActiveCount = 0,
  deferInventorySummary = false,
  paused = false,
  showActionButtons = true,
  showSpeechBubble = true,
  fixedSpeech = null,
}: Props) {
  const router = useRouter();
  const { unseenCount, unseenContainerCount } = useInventory(
    !isGuest && (!deferInventorySummary || openWardrobe),
    true,
  );
  const [clickedAt, setClickedAt] = React.useState(0);

  const speechEnabled = showSpeechBubble && !isGuest;
  const { view: streakView } = useLoginStreak(speechEnabled);
  const { data: profile } = useSWR<{
    name?: string | null;
    frogName?: string | null;
  }>(speechEnabled ? '/api/user' : null, bootstrapFetcher, {
    revalidateOnFocus: false,
  });

  const speechFacts = React.useMemo<FrogSpeechContext>(() => {
    const rawName = profile?.name?.trim();
    const firstName = rawName?.split(/\s+/)[0];
    const frogName = profile?.frogName?.trim();
    return {
      hungerPercent:
        typeof hunger === 'number' && typeof maxHunger === 'number' && maxHunger > 0
          ? Math.max(0, Math.min(100, (hunger / maxHunger) * 100))
          : null,
      streak: streakView?.count ?? 0,
      name:
        firstName && firstName.length <= 12 && !/^anonymous$/i.test(firstName)
          ? firstName
          : null,
      frogName: frogName && frogName.length <= 12 ? frogName : null,
    };
  }, [profile, streakView, hunger, maxHunger]);

  const wardrobeBadge = unseenCount + unseenContainerCount;

  // Local state for smooth hunger updates
  const [displayedHunger, setDisplayedHunger] = React.useState(hunger ?? 0);
  const prevHungerRef = React.useRef<number | null>(null);
  const feedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedGainMs, setFeedGainMs] = React.useState(0);
  const feedPulse = feedGainMs > 0;

  // Sync with prop updates; a jump of over a minute means the frog was fed
  React.useEffect(() => {
    if (typeof hunger !== 'number') return;
    const prev = prevHungerRef.current;
    prevHungerRef.current = hunger;
    setDisplayedHunger(hunger);
    if (prev !== null && hunger - prev > 60_000) {
      setFeedGainMs(hunger - prev);
      if (feedTimerRef.current) clearTimeout(feedTimerRef.current);
      feedTimerRef.current = setTimeout(() => setFeedGainMs(0), 1200);
    }
  }, [hunger]);

  React.useEffect(
    () => () => {
      if (feedTimerRef.current) clearTimeout(feedTimerRef.current);
    },
    [],
  );

  // Constant visual decay
  React.useEffect(() => {
    if (!animateHunger) return;

    const interval = setInterval(() => {
      setDisplayedHunger((prev) => {
        if (prev <= 0) return 0;
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [animateHunger]);

  const hungerPercent =
    typeof displayedHunger === 'number' && typeof maxHunger === 'number'
      ? Math.max(0, Math.min(100, (displayedHunger / maxHunger) * 100))
      : 100;

  const getHungerState = (p: number) => {
    if (p > 80)
      return {
        bg: 'bg-emerald-500',
        text: 'text-emerald-600',
        label: 'Full',
      };
    if (p > 60)
      return { bg: 'bg-lime-500', text: 'text-lime-600', label: 'Content' };
    if (p > 40)
      return {
        bg: 'bg-yellow-500',
        text: 'text-yellow-600',
        label: 'Peckish',
      };
    if (p > 20)
      return { bg: 'bg-amber-500', text: 'text-amber-600', label: 'Hungry' };
    return { bg: 'bg-rose-500', text: 'text-rose-600', label: 'Starving' };
  };

  const {
    bg: hungerColor,
    text: hungerTextColor,
    label: hungerStatus,
  } = getHungerState(hungerPercent);

  return (
    // Added mb-12 to create the requested space from the tabs below

    <div
      className={`${className} flex flex-col items-center mb-2 md:mb-2 relative md:-translate-y-6`}
    >
      <div
        ref={frogBoxRef}
        className="relative z-50 -mb-6 transition-transform duration-500 origin-top scale-100 pointer-events-none -translate-y-9 md:mb-6 md:scale-100 md:translate-y-3"
      >
        <div
          className="cursor-pointer pointer-events-auto"
          onClick={() => setClickedAt(Date.now())}
        >
          <Frog
            ref={frogRef}
            mouthOpen={!!mouthOpen}
            mouthOffset={mouthOffset}
            indices={indices}
            paused={paused}
          />
        </div>

        {!isGuest && <PremiumFrogAura />}

        {/* SPEECH BUBBLE - NOW INSIDE FROG'S CONTAINER */}

        {fixedSpeech ? (
          <FrogSpeechBubble
            rate={0}
            done={0}
            total={0}
            fixedMessage={fixedSpeech}
            className="!top-20"
          />
        ) : (
          showSpeechBubble &&
          typeof rate === 'number' &&
          typeof done === 'number' &&
          typeof total === 'number' && (
            <FrogSpeechBubble
              rate={rate}
              done={done}
              total={total}
              readyQuests={questClaimableCount}
              isCatching={isCatching}
              clickedAt={clickedAt}
              facts={speechFacts}
              className="!top-20"
            />
          )
        )}
      </div>

      {/* 2. THE CONTROL DECK 

                - Ceramic Glass Aesthetic

                - Subtle gradient border

            */}

      <div
        className="relative z-10 -mt-6 flex items-center justify-center

              w-[340px] max-w-[min(94vw,100%)] h-[50px] px-2

              bg-card/80

              backdrop-blur-2xl

              rounded-[18px]

              border border-border/50

              shadow-sm"
      >
        {/* Decorative Top Highlight to simulate glass edge light */}
        <div className="absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50" />

        {/* Hunger: state label + 6 fly-meal pips (each pip = 8h) */}
        <div className="relative flex items-center w-full h-full px-3">
          {typeof hunger === 'number' ? (
            <div className="flex items-center gap-2.5 w-full" data-hint="hunger-bar">
              <span
                className={cn(
                  'w-[64px] shrink-0 text-[11px] font-black tracking-[0.06em] whitespace-nowrap transition-colors duration-300',
                  feedPulse ? 'text-emerald-500' : hungerTextColor,
                  hungerPercent <= 20 && !feedPulse && 'animate-pulse',
                )}
              >
                {feedPulse
                  ? `Yum! +${Math.round(feedGainMs / 3_600_000)}h`
                  : hungerStatus}
              </span>
              <div
                className={cn(
                  'flex flex-1 items-center gap-1',
                  feedPulse && 'animate-feed-pop',
                )}
              >
                {Array.from({ length: HUNGER_SEGMENTS }).map((_, i) => {
                  const fill = Math.max(
                    0,
                    Math.min(1, (hungerPercent / 100) * HUNGER_SEGMENTS - i),
                  );
                  return (
                    <div
                      key={i}
                      className={cn(
                        'relative h-3.5 flex-1 overflow-hidden rounded-full bg-muted',
                        hungerPercent <= 20 && 'ring-1 ring-rose-500/15',
                      )}
                    >
                      <div
                        className={cn(
                          'absolute inset-y-0 left-0 rounded-full',
                          hungerColor,
                          animateHunger &&
                            'transition-all duration-700 ease-out',
                          feedPulse && 'brightness-125',
                        )}
                        style={{ width: `${fill * 100}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      </div>
    </div>
  );
}
