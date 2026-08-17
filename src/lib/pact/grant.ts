import type { PactDoc } from '@/lib/models/Pact';
import type { PactConfigDoc } from '@/lib/models/PactConfig';
import type { QuestReward } from '@/lib/quests/types';
import type { ShieldConfigView, ShieldState } from '@/lib/shields/types';
import { grantShields } from '@/lib/shields/engine';
import type { PactBonusRewards, PactRarity } from './types';
import {
  pactCompletionRewards,
  pactComebackFlies,
  pactMultiplier,
  pactSessionFlies,
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

export type PactBonusSummary = {
  fliesGranted: number;
  grantedItemIds: string[];
  grantedBackgroundIds: string[];
  shieldsGranted: number;
  /** The pool after any shields were added; the caller persists it. */
  shieldState: ShieldState;
};

function ensureWardrobe(user: any) {
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
}

/**
 * Moves a pact's session flies onto a loaded user document. `owedSessions` is
 * a delta, so an undone completion passes a negative and gets refunded.
 * Returns what actually moved, which a clamped refund makes smaller than asked.
 *
 * The multiplier is fractional now, so the amount is derived as the difference
 * between two rounded RUNNING TOTALS rather than by rounding the delta. Paying
 * three sessions one at a time and paying them at once therefore cost the same,
 * and a refund always gives back exactly what the session paid.
 *
 * Mutates `user`; the caller saves.
 */
export function applyPactSessionFlies(args: {
  user: any;
  config: PactConfigDoc;
  /** Sessions already paid for, before this reconciliation. */
  paidSessions: number;
  owedSessions: number;
  comeback: boolean;
  isPremium: boolean;
  /** The week's own streak number. Constant for a whole week. */
  streakWeeks: number;
  /** Cycles completed — the permanent floor under the streak's step. */
  laps?: number;
}): number {
  const { user, config, owedSessions, comeback, isPremium } = args;
  const multiplier =
    (isPremium ? 2 : 1) *
    pactMultiplier(config, args.streakWeeks, args.laps ?? 0);
  const rate = pactSessionFlies(config);
  const paidBefore = Math.max(0, args.paidSessions);
  const paidAfter = Math.max(0, paidBefore + owedSessions);
  const amount =
    Math.round(paidAfter * rate * multiplier) -
    Math.round(paidBefore * rate * multiplier) +
    (comeback ? Math.round(pactComebackFlies(config) * multiplier) : 0);
  if (amount === 0) return 0;

  ensureWardrobe(user);
  const before = Math.max(0, Number(user.wardrobe.flies) || 0);
  // A refund can never dig a hole: flies spent between earning and undoing are
  // the user's, and a negative balance breaks every price check downstream.
  const after = Math.max(0, before + amount);
  user.wardrobe.flies = after;
  user.markModified('wardrobe');
  return after - before;
}

/**
 * Pays out one kept pact onto a loaded user document — the completion bonus and
 * the week's gift, both at the streak's rate. The sessions themselves were
 * already paid as they were ticked (see `reconcilePactSessionFlies`), so this
 * is only what finishing adds.
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
  laps?: number;
  isPremium: boolean;
}): PactRewardSummary {
  const { user, config, pact, streakWeeks, isPremium } = args;
  const streakMultiplier = pactMultiplier(config, streakWeeks, args.laps ?? 0);
  const plusMultiplier = isPremium ? 2 : 1;
  // Only flies scale with the streak. Copies of a gift box are not a bigger
  // reward, they are five of the same thing to open — and a week's gift that
  // arrives five-at-a-time stops reading as the week's gift.
  const flyMultiplier = plusMultiplier * streakMultiplier;
  const sessions = Math.max(0, pact.target ?? 0);

  ensureWardrobe(user);

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
        const amount = Math.round((reward.amount ?? 0) * flyMultiplier);
        user.wardrobe.flies += amount;
        summary.fliesGranted += amount;
      } else if (reward.type === 'BACKGROUND' && reward.backgroundId) {
        const inv = user.wardrobe.backgrounds.inventory;
        for (let i = 0; i < plusMultiplier; i += 1) {
          inv[reward.backgroundId] = (inv[reward.backgroundId] ?? 0) + 1;
          summary.grantedBackgroundIds.push(reward.backgroundId);
        }
      } else if (reward.itemId) {
        const copies = Math.max(1, Math.floor(reward.amount ?? 1));
        for (let i = 0; i < copies * plusMultiplier; i += 1) {
          user.wardrobe.inventory[reward.itemId] =
            (user.wardrobe.inventory[reward.itemId] ?? 0) + 1;
          user.wardrobe.unseenItems.push(reward.itemId);
          summary.grantedItemIds.push(reward.itemId);
        }
      }
    }
  };

  applyRewards([
    { type: 'FLIES', amount: pactWeekBonusFlies(config, sessions) },
  ]);
  applyRewards(pactCompletionRewards(config, sessions));

  summary.flyBalanceAfter = user.wardrobe.flies;
  user.markModified('wardrobe');
  return summary;
}

/**
 * One draw of a guaranteed rarity. Runs the same contract trade-ups do — the
 * wishlist gets first refusal and un-owned items outweigh duplicates — so a
 * milestone's "guaranteed epic" lands on something the player actually wanted
 * rather than a fourth copy of a hat they own.
 */
/**
 * A milestone epic or legendary clears the shared gift Luck counter like any
 * other source would. Mutated in memory so the caller's save carries it.
 */
async function clearGiftLuckInMemory(user: any, rarity: PactRarity) {
  const { clearGiftLuck, readGiftLuck } = await import('@/lib/skins/giftRules');
  const next = clearGiftLuck(readGiftLuck(user.giftLuck), rarity);
  user.giftLuck = { ...next, updatedAt: new Date() };
  user.markModified('giftLuck');
}

async function drawRarityItem(user: any, rarity: PactRarity) {
  const [{ getRewardPool }, { pickTradeReward, prizeKey }, wishlist, modifiers] =
    await Promise.all([
      import('@/lib/skins/gifts'),
      import('@/lib/skins/tradeRewards'),
      import('@/lib/skins/wishlist'),
      import('@/lib/models/TradeModifiersConfig').then((mod) =>
        mod.ensureTradeModifiersConfig(),
      ),
    ]);
  const pool = await getRewardPool();
  const wishlistKeys = new Set(
    wishlist
      .readWishlistPins(user.wardrobe)
      .map((pin) => wishlist.wishlistPinKey(pin)),
  );
  const owns = (prize: { kind: string; id: string }) => {
    const inventory =
      prize.kind === 'background'
        ? user.wardrobe?.backgrounds?.inventory
        : user.wardrobe?.inventory;
    return (inventory?.[prize.id] ?? 0) > 0;
  };
  return pickTradeReward({
    pool,
    rarity,
    owns,
    wishlistKeys,
    modifiers,
    aimed: false,
    exclude: null,
  });
}

/**
 * Milestone and prestige payouts: everything a week's own reward is not. These
 * are one-time, so nothing here is multiplied by the streak — a rung is worth
 * what it says it is worth, at every point on the ladder.
 *
 * Plus doubles flies and boxes, as it does everywhere else, but never a drawn
 * item or a shield: two copies of a set piece is not a reward, and shields are
 * capped by the pool anyway.
 *
 * Mutates `user`; the caller saves.
 */
export async function applyPactBonusRewards(args: {
  user: any;
  rewards: PactBonusRewards;
  isPremium: boolean;
  shieldState: ShieldState;
  shieldConfig: ShieldConfigView;
}): Promise<PactBonusSummary> {
  const { user, rewards, isPremium, shieldConfig } = args;
  const plusMultiplier = isPremium ? 2 : 1;
  ensureWardrobe(user);

  const summary: PactBonusSummary = {
    fliesGranted: 0,
    grantedItemIds: [],
    grantedBackgroundIds: [],
    shieldsGranted: 0,
    shieldState: args.shieldState,
  };

  const addItem = (itemId: string, copies: number) => {
    for (let i = 0; i < copies; i += 1) {
      user.wardrobe.inventory[itemId] =
        (user.wardrobe.inventory[itemId] ?? 0) + 1;
      user.wardrobe.unseenItems.push(itemId);
      summary.grantedItemIds.push(itemId);
    }
  };

  for (const reward of rewards ?? []) {
    if (reward.type === 'SHIELD') {
      const amount = Math.max(1, Math.floor((reward as any).amount ?? 1));
      const before = summary.shieldState.count;
      summary.shieldState = grantShields(
        summary.shieldState,
        shieldConfig,
        isPremium,
        amount,
      );
      summary.shieldsGranted += summary.shieldState.count - before;
      continue;
    }
    if (reward.type === 'RARITY_ITEM') {
      const copies = Math.max(1, Math.floor((reward as any).amount ?? 1));
      for (let i = 0; i < copies; i += 1) {
        const prize = await drawRarityItem(user, (reward as any).rarity);
        if (!prize) continue;
        await clearGiftLuckInMemory(user, prize.rarity);
        if (prize.kind === 'background') {
          const inv = user.wardrobe.backgrounds.inventory;
          inv[prize.id] = (inv[prize.id] ?? 0) + 1;
          summary.grantedBackgroundIds.push(prize.id);
        } else {
          addItem(prize.id, 1);
        }
      }
      continue;
    }
    const questReward = reward as QuestReward;
    if (questReward.type === 'FLIES') {
      const amount = Math.round((questReward.amount ?? 0) * plusMultiplier);
      user.wardrobe.flies += amount;
      summary.fliesGranted += amount;
    } else if (questReward.type === 'BACKGROUND' && questReward.backgroundId) {
      const inv = user.wardrobe.backgrounds.inventory;
      for (let i = 0; i < plusMultiplier; i += 1) {
        inv[questReward.backgroundId] =
          (inv[questReward.backgroundId] ?? 0) + 1;
        summary.grantedBackgroundIds.push(questReward.backgroundId);
      }
    } else if (questReward.itemId) {
      const copies = Math.max(1, Math.floor(questReward.amount ?? 1));
      addItem(questReward.itemId, copies * plusMultiplier);
    }
  }

  user.markModified('wardrobe');
  return summary;
}
