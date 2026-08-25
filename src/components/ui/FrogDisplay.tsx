'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Frog, { type FrogHandle, type WardrobeSlot } from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { FrogSpeechBubble } from './FrogSpeechBubble';
import { PremiumFrogAura } from './PremiumFrogAura';
import { useInventory } from '@/hooks/useInventory';
import { useLoginStreak } from '@/hooks/useLoginStreak';
import useSWR from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import type { FrogSpeechContext } from '@/lib/frogSpeech';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { cn } from '@/lib/utils';
import { prefetchQuests } from './QuestsPanel';

import { FrogBellyDeck } from './FrogBellyDeck';

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
  const timerLive = useFrogodoroStore((s) => s.timerActive && s.isRunning);

  const tapAreaRef = React.useRef<HTMLDivElement | null>(null);
  const hoverRafRef = React.useRef(0);
  const hoverPointRef = React.useRef({ x: -1, y: -1 });

  const trackHover = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== 'mouse' || hoverRafRef.current) return;
      const { clientX, clientY } = event;
      const last = hoverPointRef.current;
      if (Math.abs(clientX - last.x) < 4 && Math.abs(clientY - last.y) < 4) {
        return;
      }
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = 0;
        hoverPointRef.current = { x: clientX, y: clientY };
        const el = tapAreaRef.current;
        if (!el) return;
        el.style.cursor =
          frogRef.current?.hitTest(clientX, clientY) === false
            ? 'default'
            : 'pointer';
      });
    },
    [frogRef],
  );

  React.useEffect(
    () => () => {
      if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
    },
    [],
  );

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
        typeof hunger === 'number' &&
        typeof maxHunger === 'number' &&
        maxHunger > 0
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

  return (
    // Added mb-12 to create the requested space from the tabs below

    <div
      data-fly-hero
      className={`${className} flex flex-col items-center mb-2 md:mb-2 relative md:-translate-y-6`}
    >
      <div
        ref={frogBoxRef}
        className="relative z-50 -mb-6 transition-transform duration-500 origin-top scale-100 pointer-events-none -translate-y-9 md:mb-6 md:scale-100 md:translate-y-3"
      >
        <div
          ref={tapAreaRef}
          data-fly-hero-frog
          className="pointer-events-auto"
          onPointerMove={trackHover}
          onPointerLeave={() => {
            hoverPointRef.current = { x: -1, y: -1 };
            if (tapAreaRef.current) tapAreaRef.current.style.cursor = '';
          }}
          onClick={(e) => {
            if (frogRef.current?.hitTest(e.clientX, e.clientY) === false)
              return;
            setClickedAt(Date.now());
          }}
        >
          <Frog
            ref={frogRef}
            mouthOpen={!!mouthOpen}
            mouthOffset={mouthOffset}
            indices={indices}
            paused={paused}
            ignoreIdlePause={timerLive}
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

      <FrogBellyDeck
        hunger={hunger}
        maxHunger={maxHunger}
        animateHunger={animateHunger}
        className="-mt-6"
      />
    </div>
  );
}
