'use client';

import { useReducedMotion } from 'framer-motion';
import {
  enqueueQuestRewardReveal,
  type RevealCatalog,
} from '@/components/ui/questRewardReveal';
import type { LeapView, LeapWeekResult } from '@/lib/leap/types';
import { resultFrogLine } from './leapCopy';
import { giftRiveIndexFor } from './LeapJoinSheet';
import { LeapStage, LeapStageBody, LeapStageButton, type LeapStageProps } from './LeapStage';
import { LeapWeekReceipt } from './LeapStagePanels';

function labelFor(view: LeapView | undefined, index: number) {
  return view?.leagues[index]?.label ?? 'Lily';
}

function copyFor(result: LeapWeekResult, view: LeapView | undefined) {
  const after = labelFor(view, result.leagueAfter);
  const before = labelFor(view, result.leagueBefore);
  const upNext = view?.leagues[result.leagueAfter + 1]?.label;
  if (result.firstWeek && result.outcome === 'stay' && result.leagueAfter === 0) {
    return {
      title: 'Your first week is done',
      body: upNext
        ? `Reach the promotion zone this week to advance to the ${upNext} League.`
        : 'Reach the promotion zone this week to advance.',
    };
  }
  switch (result.outcome) {
    case 'up':
      return {
        title: `You advanced to the ${after} League!`,
        body: upNext ? `Next up: the ${upNext} League.` : "That's the top league!",
      };
    case 'top':
      return { title: 'You stayed on top!', body: `The ${after} League is still yours.` };
    case 'covered':
      return { title: 'A Lily Pad saved you', body: `You stay in the ${after} League.` };
    case 'down':
      return {
        title: `You were demoted to the ${after} League`,
        body: `Reach the promotion zone to climb back to ${before}.`,
      };
    default:
      return {
        title: `You stayed in the ${after} League`,
        body: 'Reach the promotion zone this week to advance.',
      };
  }
}

export function revealLeapPrizes(result: LeapWeekResult, view: LeapView | undefined) {
  const items = result.newItemIds ?? [];
  const backgrounds = result.newBackgroundIds ?? [];
  if (!view || (!items.length && !backgrounds.length)) return;
  enqueueQuestRewardReveal(
    { fliesGranted: 0, grantedItemIds: items, grantedBackgroundIds: backgrounds },
    {
      catalog: view.rewardCatalog as RevealCatalog,
      isPremium: view.isPremium,
      showFlyGainPill: false,
    },
  );
}

function useResultStage(
  result: LeapWeekResult,
  view: LeapView | undefined,
  active: boolean,
  onClose: (openPrize: boolean) => void,
): LeapStageProps {
  const reduceMotion = useReducedMotion();
  const { title, body } = copyFor(result, view);
  const gifts = result.grantedItemIds.filter((id) => id.startsWith('gift_box'));
  const newPrizes = (result.newItemIds?.length ?? 0) + (result.newBackgroundIds?.length ?? 0);
  const newGift = (result.newItemIds ?? []).some((id) => id.startsWith('gift_box'));
  const leagues = view?.leagues.length
    ? view.leagues.map((league) => league.label)
    : [labelFor(view, result.leagueBefore)];
  const stayAt = result.stayAt ?? 0;
  const moveUpAt = result.moveUpAt ?? 0;
  const stayLine = (result.outcome === 'down' || result.outcome === 'covered') && stayAt > 0;
  return {
    leagues,
    from: view?.leagues.length ? result.leagueBefore : 0,
    to: view?.leagues.length ? result.leagueAfter : 0,
    eyebrow: 'Weekly Leap',
    title,
    body,
    frogLine: resultFrogLine(result),
    celebrate: result.outcome === 'up' || result.outcome === 'top',
    panel: (
      <LeapWeekReceipt
        hops={result.hops}
        scheduled={result.scheduled}
        lineAt={stayLine ? stayAt : moveUpAt}
        lineLabel={stayLine ? `${stayAt} to stay` : `${moveUpAt} to move up`}
        flies={result.fliesGranted}
        gifts={gifts.length}
        giftColor={giftRiveIndexFor(view?.rewardCatalog ?? {}, gifts[0])}
        paused={!active || !!reduceMotion}
      />
    ),
    actions: (
      <LeapStageButton onClick={() => onClose(newPrizes > 0)}>
        {newPrizes > 0 ? (newGift ? 'Open your gift' : 'See your prize') : "Let's go"}
      </LeapStageButton>
    ),
  };
}

export function LeapDayContent({
  result,
  view,
  active,
  onClose,
  quiet = false,
  wide = false,
}: {
  result: LeapWeekResult;
  view: LeapView | undefined;
  active: boolean;
  onClose: (openPrize: boolean) => void;
  quiet?: boolean;
  wide?: boolean;
}) {
  const stage = useResultStage(result, view, active, onClose);
  return <LeapStageBody {...stage} active={active} quiet={quiet} wide={wide} />;
}

export function LeapDaySheet({
  result,
  view,
  open,
  onClose,
}: {
  result: LeapWeekResult;
  view: LeapView | undefined;
  open: boolean;
  onClose: (openPrize: boolean) => void;
}) {
  const stage = useResultStage(result, view, open, onClose);
  return (
    <LeapStage
      {...stage}
      open={open}
      onClose={() => onClose(false)}
      label={stage.title}
    />
  );
}
