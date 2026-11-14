'use client';

import {
  enqueueQuestRewardReveal,
  type RevealCatalog,
} from '@/components/ui/questRewardReveal';
import type { LeapJoin, LeapView } from '@/lib/leap/types';
import { nextLeagueName } from './leapCopy';
import { LeapStage, LeapStageBody, LeapStageButton, type LeapStageProps } from './LeapStage';

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

function useJoinStage(
  join: LeapJoin,
  view: LeapView,
  onClose: (openGift: boolean) => void,
): LeapStageProps {
  const gift = join.giftIds[0];
  return {
    leagues: view.leagues.map((league) => league.label),
    from: view.league,
    to: view.league,
    eyebrow: 'Weekly Leap',
    title: 'Welcome to Weekly Leap!',
    body: nextLeagueName(view)
      ? 'Finish repeating goals to earn gifts and move up.'
      : 'Finish repeating goals to earn weekly gifts.',
    frogLine: '',
    greenBackground: true,
    celebrate: true,
    panel: null,
    prize: gift ? (
      <div className="mt-6 flex w-full items-center gap-3 rounded-2xl bg-[#486a43] px-4 py-2 text-white dark:bg-black/20" aria-label="Your welcome prize is ready to open">
        <span aria-hidden="true" className="grid h-20 w-20 shrink-0 place-items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gift1.webp" alt="" className="h-full w-full object-contain" />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-black">Your welcome prize</span>
          <span className="mt-1 block text-[13px] font-semibold text-white">Earned by finishing a habit.</span>
        </span>
      </div>
    ) : null,
    actions: (
      <LeapStageButton onGreen onClick={() => onClose(!!gift)}>
        {gift ? 'Open your prize' : "Let's go"}
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
  const stage = useJoinStage(join, view, onClose);
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
  const stage = useJoinStage(join, view, onClose);
  return (
    <LeapStage
      {...stage}
      open={open}
      onClose={() => onClose(false)}
      label={stage.title}
    />
  );
}
