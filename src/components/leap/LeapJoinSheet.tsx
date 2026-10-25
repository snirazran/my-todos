'use client';

import { useReducedMotion } from 'framer-motion';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import {
  enqueueQuestRewardReveal,
  type RevealCatalog,
} from '@/components/ui/questRewardReveal';
import type { LeapJoin, LeapView } from '@/lib/leap/types';
import {
  joinFrogLine,
  leagueName,
  leagueTitle,
  leapCompeting,
  leapHasHabits,
  leapTarget,
  nextLeagueName,
  weekEndDay,
  weekdayOf,
} from './leapCopy';
import { LeapStage, LeapStageBody, LeapStageButton, type LeapStageProps } from './LeapStage';
import { LeapWeekGoal } from './LeapStagePanels';

const GIFT_RIVE_FALLBACKS: Record<string, number> = {
  gift_box_1: 0,
  gift_box_rare: 1,
  gift_box_legendary: 2,
};

export function giftRiveIndexFor(catalog: Record<string, unknown>, giftId: string | undefined) {
  const item = giftId ? (catalog[giftId] as { riveIndex?: unknown } | undefined) : undefined;
  return typeof item?.riveIndex === 'number' ? item.riveIndex : (GIFT_RIVE_FALLBACKS[giftId ?? ''] ?? 0);
}

export function openJoinGifts(join: LeapJoin, view: LeapView) {
  if (!join.giftIds.length) return;
  enqueueQuestRewardReveal(
    { fliesGranted: 0, grantedItemIds: join.giftIds },
    {
      catalog: view.rewardCatalog as RevealCatalog,
      isPremium: view.isPremium,
      showFlyGainPill: false,
    },
  );
}

function JoinPanel({ view }: { view: LeapView }) {
  const { week } = view;
  const next = nextLeagueName(view);
  if (leapHasHabits(view) && leapCompeting(view) && next) {
    return (
      <LeapWeekGoal
        done={week.hops}
        target={leapTarget(view)}
        goal={next}
        goalIndex={view.league + 1}
        caption={`Finish them by ${weekEndDay(week.weekKey)}`}
      />
    );
  }
  return (
    <LeapWeekGoal
      done={week.hops}
      target={0}
      goal={leagueName(view)}
      goalIndex={view.league}
      caption={`Your league week starts ${weekdayOf(week.weekKey)}`}
    />
  );
}

function useJoinStage(
  join: LeapJoin,
  view: LeapView,
  active: boolean,
  onClose: (openGift: boolean) => void,
): LeapStageProps {
  const reduceMotion = useReducedMotion();
  const gift = join.giftIds[0];
  return {
    leagues: view.leagues.map((league) => league.label),
    from: view.league,
    to: view.league,
    eyebrow: 'Weekly Leap',
    title: `You joined the ${leagueTitle(leagueName(view))}!`,
    frogLine: joinFrogLine(view),
    celebrate: true,
    panel: <JoinPanel view={view} />,
    actions: (
      <LeapStageButton onClick={() => onClose(!!gift)}>
        {gift && (
          <span
            aria-hidden="true"
            className="-my-5 -ml-1 aspect-[282/381] h-[60px] w-auto shrink-0 -translate-y-[12px]"
          >
            <GiftRive
              className="h-full w-full"
              color={giftRiveIndexFor(view.rewardCatalog, gift)}
              paused={!active || !!reduceMotion}
              ambient="jump"
            />
          </span>
        )}
        {gift ? 'Open your gift' : "Let's go"}
      </LeapStageButton>
    ),
  };
}

export function LeapJoinContent({
  join,
  view,
  active,
  onClose,
  quiet = false,
  wide = false,
}: {
  join: LeapJoin;
  view: LeapView;
  active: boolean;
  onClose: (openGift: boolean) => void;
  quiet?: boolean;
  wide?: boolean;
}) {
  const stage = useJoinStage(join, view, active, onClose);
  return <LeapStageBody {...stage} active={active} quiet={quiet} wide={wide} />;
}

export function LeapJoinSheet({
  join,
  view,
  open,
  onClose,
}: {
  join: LeapJoin;
  view: LeapView;
  open: boolean;
  onClose: (openGift: boolean) => void;
}) {
  const stage = useJoinStage(join, view, open, onClose);
  return (
    <LeapStage
      {...stage}
      open={open}
      onClose={() => onClose(false)}
      label={stage.title}
    />
  );
}
