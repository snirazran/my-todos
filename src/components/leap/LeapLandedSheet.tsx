'use client';

import { useState } from 'react';
import type { LeapView } from '@/lib/leap/types';
import { leagueTitle, nextLeagueName, weekEndDay } from './leapCopy';
import { LeapChestLanes } from './LeapChestLanes';
import { LeapStage, LeapStageBody, LeapStageButton, type LeapStageProps } from './LeapStage';

export type LandedChoice = 'open' | 'plus' | 'later';

function useLandedStage(
  view: LeapView,
  busy: boolean,
  onChoice: (choice: LandedChoice) => void,
): LeapStageProps {
  const next = nextLeagueName(view);
  const end = weekEndDay(view.week.weekKey);
  return {
    leagues: view.leagues.map((league) => league.label),
    from: view.league,
    to: view.league,
    eyebrow: 'Weekly Leap',
    title: 'You landed your Leap!',
    body: next
      ? `You move up to the ${leagueTitle(next)} after ${end}.`
      : 'You hold the top of the pond for another week.',
    frogLine: 'We did it! Open it, open it!',
    celebrate: true,
    panel: (
      <LeapChestLanes
        view={view}
        tone="stage"
        onPlus={view.isPremium ? undefined : () => onChoice('plus')}
      />
    ),
    actions: (
      <>
        <LeapStageButton onClick={() => !busy && onChoice('open')}>
          {busy ? 'Opening…' : 'Open your gift'}
        </LeapStageButton>
        {!view.isPremium && view.week.chest.plusRewards.length > 0 && (
          <p className="text-center text-[12.5px] font-bold text-[color:var(--leap-ink-muted)]">
            The Plus gift waits for you until {end}.
          </p>
        )}
      </>
    ),
  };
}

export function LeapLandedContent({
  view,
  active,
  onChoice,
  quiet = false,
  wide = false,
}: {
  view: LeapView;
  active: boolean;
  onChoice: (choice: LandedChoice) => void;
  quiet?: boolean;
  wide?: boolean;
}) {
  const stage = useLandedStage(view, false, onChoice);
  return <LeapStageBody {...stage} active={active} quiet={quiet} wide={wide} />;
}

export function LeapLandedSheet({
  view,
  open,
  onChoice,
}: {
  view: LeapView;
  open: boolean;
  onChoice: (choice: LandedChoice) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const choose = (choice: LandedChoice) => {
    if (choice !== 'open') {
      void onChoice(choice);
      return;
    }
    setBusy(true);
    void Promise.resolve(onChoice(choice)).finally(() => setBusy(false));
  };
  const stage = useLandedStage(view, busy, choose);
  return (
    <LeapStage
      {...stage}
      open={open}
      onClose={() => choose('later')}
      label={stage.title}
    />
  );
}
