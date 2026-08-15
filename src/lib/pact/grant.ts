import type { PactDoc } from '@/lib/models/Pact';
import type { PactConfigDoc } from '@/lib/models/PactConfig';
import type { QuestReward } from '@/lib/quests/types';
import {
  pactComebackFlies,
  pactSessionFlies,
  pactStreakMultiplier,
  pactStreakRewards,
  pactWeekBonusFlies,
} from './engine';

export type PactRewardSummary = {
  fliesGranted: number;
  flyBalanceBefore: number;
  flyBalanceAfter: number;
  grantedItemIds: string[];
  grantedBackgroundIds: string[];
  /** What the week was multiplied by, for the settlement screen to report. */
  streakMultiplier: number;
};

/**
 * Moves a pact's session flies onto a loaded user document. `owedSessions` is
 * a delta, so an undone completion passes a negative and gets refunded.
 * Returns what actually moved, which a clamped refund makes smaller than asked.
 *
 * Mutates `user`; the caller saves.
 */
export function applyPactSessionFlies(args: {
  user: any;
  config: PactConfigDoc;
  owedSessions: number;
  comeback: boolean;
  isPremium: boolean;
  /** The week's own streak number. Constant for a whole week, so a refund
   *  always gives back exactly what the session paid. */
  streakWeeks: number;
}): number {
  const { user, config, owedSessions, comeback, isPremium } = args;
  const multiplier =
    (isPremium ? 2 : 1) * pactStreakMultiplier(config, args.streakWeeks);
  const amount =
    owedSessions * pactSessionFlies(config) * multiplier +
    (comeback ? pactComebackFlies(config) * multiplier : 0);
  if (amount === 0) return 0;

  if (!user.wardrobe) {
    user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
  }
  const before = Math.max(0, Number(user.wardrobe.flies) || 0);
  // A refund can never dig a hole: flies spent between earning and undoing are
  // the user's, and a negative balance breaks every price check downstream.
  const after = Math.max(0, before + amount);
  user.wardrobe.flies = after;
  user.markModified('wardrobe');
  return after - before;
}

/**
 * Pays out one kept pact onto a loaded user document — the week bonus and the
 * week's gift, both at the streak's rate. The sessions themselves were already
 * paid as they were ticked (see `reconcilePactSessionFlies`), so this is only
 * what finishing adds.
 *
 * Deliberately takes the week's streak number as an argument rather than
 * deriving it: the claim path runs before the week is settled (so it projects),
 * while the settle path runs after (so it passes the number it just wrote).
 *
 * Mutates `user`; the caller saves.
 */
export function applyPactRewards(args: {
  user: any;
  config: PactConfigDoc;
  pact: PactDoc;
  streakWeeks: number;
  isPremium: boolean;
}): PactRewardSummary {
  const { user, config, streakWeeks, isPremium } = args;
  const streakMultiplier = pactStreakMultiplier(config, streakWeeks);
  const plusMultiplier = isPremium ? 2 : 1;
  // Only flies scale with the streak. Copies of a gift box are not a bigger
  // reward, they are five of the same thing to open — and a week's gift that
  // arrives five-at-a-time stops reading as the week's gift.
  const flyMultiplier = plusMultiplier * streakMultiplier;

  if (!user.wardrobe) {
    user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
  }
  user.wardrobe.inventory = user.wardrobe.inventory ?? {};
  user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];
  user.wardrobe.flies = user.wardrobe.flies ?? 0;
  if (!user.wardrobe.backgrounds) {
    user.wardrobe.backgrounds = { equipped: null, inventory: {} };
  }
  user.wardrobe.backgrounds.inventory =
    user.wardrobe.backgrounds.inventory ?? {};

  const summary: PactRewardSummary = {
    fliesGranted: 0,
    flyBalanceBefore: user.wardrobe.flies,
    flyBalanceAfter: user.wardrobe.flies,
    grantedItemIds: [],
    grantedBackgroundIds: [],
    streakMultiplier,
  };

  const applyRewards = (rewards: QuestReward[] | undefined) => {
    for (const reward of rewards ?? []) {
      if (reward.type === 'FLIES') {
        const amount = (reward.amount ?? 0) * flyMultiplier;
        user.wardrobe.flies += amount;
        summary.fliesGranted += amount;
      } else if (reward.type === 'BACKGROUND' && reward.backgroundId) {
        const inv = user.wardrobe.backgrounds.inventory;
        for (let i = 0; i < plusMultiplier; i += 1) {
          inv[reward.backgroundId] = (inv[reward.backgroundId] ?? 0) + 1;
          summary.grantedBackgroundIds.push(reward.backgroundId);
        }
      } else if (reward.itemId) {
        for (let i = 0; i < plusMultiplier; i += 1) {
          user.wardrobe.inventory[reward.itemId] =
            (user.wardrobe.inventory[reward.itemId] ?? 0) + 1;
          user.wardrobe.unseenItems.push(reward.itemId);
          summary.grantedItemIds.push(reward.itemId);
        }
      }
    }
  };

  applyRewards([{ type: 'FLIES', amount: pactWeekBonusFlies(config) }]);
  applyRewards(pactStreakRewards(config, streakWeeks));

  summary.flyBalanceAfter = user.wardrobe.flies;
  user.markModified('wardrobe');
  return summary;
}
