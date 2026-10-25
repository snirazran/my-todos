'use client';

import { useReducedMotion } from 'framer-motion';
import { create } from 'zustand';
import {
  enqueueQuestRewardReveal,
  type RevealCatalog,
} from '@/components/ui/questRewardReveal';
import type { LeapHopResult, LeapView } from '@/lib/leap/types';
import { leagueTitle, weekdayOf, zoneFrogLine } from './leapCopy';
import { giftRiveIndexFor } from './LeapJoinSheet';
import { LeapStage, LeapStageBody, LeapStageButton, type LeapStageProps } from './LeapStage';
import { LeapPrizeReceipt } from './LeapStagePanels';

const GIFT_PREFIX = 'gift_box';

export const useLeapZoneMoment = create<{ result: LeapHopResult | null }>(() => ({
  result: null,
}));

export function queueLeapZoneMoment(result: LeapHopResult) {
  useLeapZoneMoment.setState({ result });
}

export function zoneGiftIds(result: LeapHopResult) {
  return [
    ...(result.lucky?.grantedItemIds ?? []),
    ...result.marks.flatMap((mark) => mark.grantedItemIds),
  ].filter((id) => id.startsWith(GIFT_PREFIX));
}

export function openZoneGifts(result: LeapHopResult) {
  const gifts = zoneGiftIds(result);
  if (!gifts.length) return;
  enqueueQuestRewardReveal(
    { fliesGranted: 0, grantedItemIds: gifts },
    {
      catalog: result.catalog as RevealCatalog,
      isPremium: result.isPremium,
      showFlyGainPill: false,
    },
  );
}

function useZoneStage(
  result: LeapHopResult,
  view: LeapView | undefined,
  active: boolean,
  onClose: (openGift: boolean) => void,
): LeapStageProps {
  const reduceMotion = useReducedMotion();
  const next = result.nextLeagueLabel;
  const gifts = zoneGiftIds(result);
  const flies =
    result.hopFlies +
    result.comebackFlies +
    (result.lucky?.fliesGranted ?? 0) +
    result.marks.reduce((sum, mark) => sum + mark.fliesGranted, 0);
  const leagues = view?.leagues.length
    ? view.leagues.map((league) => league.label)
    : [result.leagueLabel, ...(next ? [next] : [])];
  const index = view?.leagues.length ? result.league : 0;
  return {
    leagues,
    from: index,
    to: index,
    nextNote: next ? weekdayOf(result.weekKey) : null,
    eyebrow: 'Weekly Leap',
    title: next ? "You're in the promotion zone!" : 'Top prize won!',
    body: next
      ? `You advance to the ${leagueTitle(next)} on ${weekdayOf(result.weekKey)}.`
      : `The ${leagueTitle(result.leagueLabel)} is still yours.`,
    frogLine: zoneFrogLine(result),
    celebrate: true,
    panel: (
      <LeapPrizeReceipt
        title={next ? 'Promotion prize' : 'Top prize'}
        flies={flies}
        gifts={gifts.length}
        giftColor={giftRiveIndexFor(result.catalog, gifts[0])}
        paused={!active || !!reduceMotion}
        caption="Extra habits this week still earn flies"
      />
    ),
    actions: (
      <LeapStageButton onClick={() => onClose(gifts.length > 0)}>
        {gifts.length ? 'Open your gift' : 'Keep going'}
      </LeapStageButton>
    ),
  };
}

export function LeapZoneContent({
  result,
  view,
  active,
  onClose,
  quiet = false,
  wide = false,
}: {
  result: LeapHopResult;
  view: LeapView | undefined;
  active: boolean;
  onClose: (openGift: boolean) => void;
  quiet?: boolean;
  wide?: boolean;
}) {
  const stage = useZoneStage(result, view, active, onClose);
  return <LeapStageBody {...stage} active={active} quiet={quiet} wide={wide} />;
}

export function LeapZoneSheet({
  result,
  view,
  open,
  onClose,
}: {
  result: LeapHopResult;
  view: LeapView | undefined;
  open: boolean;
  onClose: (openGift: boolean) => void;
}) {
  const stage = useZoneStage(result, view, open, onClose);
  return (
    <LeapStage {...stage} open={open} onClose={() => onClose(false)} label={stage.title} />
  );
}
