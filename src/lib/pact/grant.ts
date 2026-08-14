import type { PactDoc } from '@/lib/models/Pact';
import type { PactConfigDoc } from '@/lib/models/PactConfig';
import type { QuestReward } from '@/lib/quests/types';
import {
  pactComebackFlies,
  pactSessionFlies,
  pactWeekBonusFlies,
} from './engine';

export type PactRewardSummary = {
  fliesGranted: number;
  flyBalanceBefore: number;
  flyBalanceAfter: number;
  grantedItemIds: string[];
  grantedBackgroundIds: string[];
  streakTierHit: number | null;
  masteryTierHit: number | null;
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
}): number {
  const { user, config, owedSessions, comeback, isPremium } = args;
  const multiplier = isPremium ? 2 : 1;
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
 * Pays out one kept pact onto a loaded user document — the week bonus, the
 * weekly gift, the milestone gift, and any streak/mastery tier the week lands
 * on. The sessions themselves were already paid as they were ticked (see
 * `reconcilePactSessionFlies`), so this is only what finishing adds.
 *
 * Deliberately takes the week numbers as arguments rather than deriving them:
 * the claim path runs before the week is settled (so it projects), while the
 * settle path runs after (so it passes the numbers it just wrote). Deriving
 * them internally is what made tiers fire twice or not at all.
 *
 * Mutates `user`; the caller saves.
 */
export function applyPactRewards(args: {
  user: any;
  config: PactConfigDoc;
  pact: PactDoc;
  streakWeeks: number;
  areaWeeks: number;
  isPremium: boolean;
}): PactRewardSummary {
  const { user, config, pact, streakWeeks, areaWeeks, isPremium } = args;
  const multiplier = isPremium ? 2 : 1;

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
    streakTierHit: null,
    masteryTierHit: null,
  };

  const applyRewards = (rewards: QuestReward[] | undefined) => {
    for (const reward of rewards ?? []) {
      if (reward.type === 'FLIES') {
        const amount = (reward.amount ?? 0) * multiplier;
        user.wardrobe.flies += amount;
        summary.fliesGranted += amount;
      } else if (reward.type === 'BACKGROUND' && reward.backgroundId) {
        const inv = user.wardrobe.backgrounds.inventory;
        for (let i = 0; i < multiplier; i += 1) {
          inv[reward.backgroundId] = (inv[reward.backgroundId] ?? 0) + 1;
          summary.grantedBackgroundIds.push(reward.backgroundId);
        }
      } else if (reward.itemId) {
        for (let i = 0; i < multiplier; i += 1) {
          user.wardrobe.inventory[reward.itemId] =
            (user.wardrobe.inventory[reward.itemId] ?? 0) + 1;
          user.wardrobe.unseenItems.push(reward.itemId);
          summary.grantedItemIds.push(reward.itemId);
        }
      }
    }
  };

  applyRewards([{ type: 'FLIES', amount: pactWeekBonusFlies(config) }]);

  applyRewards(config.completionRewards);
  const everyN = Math.max(0, config.milestoneEveryWeeks ?? 0);
  if (everyN > 0 && streakWeeks % everyN === 0) {
    applyRewards(config.milestoneRewards);
  }

  // Tiers match the exact week they sit on, so the number passed in has to be
  // the week this pact actually is — not "wherever the streak happens to be".
  const streakTier = (config.streakTiers ?? []).find(
    (tier) => tier.weeks === streakWeeks,
  );
  if (streakTier) {
    applyRewards(streakTier.rewards);
    summary.streakTierHit = streakTier.weeks;
  }

  const masteryTier = (config.masteryTiers ?? []).find(
    (tier) => tier.weeks === areaWeeks,
  );
  if (masteryTier) {
    applyRewards(
      isPremium && masteryTier.plusRewards?.length
        ? masteryTier.plusRewards
        : masteryTier.rewards,
    );
    summary.masteryTierHit = masteryTier.weeks;
  }

  summary.flyBalanceAfter = user.wardrobe.flies;
  user.markModified('wardrobe');
  return summary;
}
