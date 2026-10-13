import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import type { QuestReward } from '@/lib/quests/types';
import type { ShieldConfigView, ShieldState } from '@/lib/shields/types';
import {
  grantShields,
  loadShieldConfig,
  persistShieldState,
  readShieldState,
} from '@/lib/shields/engine';
import { settleFlyGrant } from '@/lib/economy/ledger';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import type {
  BonusRarity,
  BonusRewards,
  LeapGrantSummary,
} from './types';

export type BonusSummary = LeapGrantSummary & {
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

async function clearGiftLuckInMemory(user: any, rarity: BonusRarity) {
  const { clearGiftLuck, readGiftLuck } = await import('@/lib/skins/giftRules');
  const next = clearGiftLuck(readGiftLuck(user.giftLuck), rarity);
  user.giftLuck = { ...next, updatedAt: new Date() };
  user.markModified('giftLuck');
}

async function drawRarityItem(user: any, rarity: BonusRarity) {
  const [{ getRewardPool }, { pickTradeReward }, wishlist, modifiers] =
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

export async function applyBonusRewards(args: {
  user: any;
  rewards: BonusRewards;
  isPremium: boolean;
  doubles: boolean;
  shieldState: ShieldState;
  shieldConfig: ShieldConfigView;
  flyMultiplier?: number;
}): Promise<BonusSummary> {
  const { user, rewards, isPremium, shieldConfig } = args;
  const plusMultiplier = args.doubles && isPremium ? 2 : 1;
  const flyMultiplier = plusMultiplier * Math.max(0, args.flyMultiplier ?? 1);
  ensureWardrobe(user);

  const summary: BonusSummary = {
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
      const amount = Math.max(1, Math.floor(reward.amount ?? 1));
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
      const copies = Math.max(1, Math.floor(reward.amount ?? 1));
      for (let i = 0; i < copies; i += 1) {
        const prize = await drawRarityItem(user, reward.rarity);
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
      const amount = Math.round((questReward.amount ?? 0) * flyMultiplier);
      user.wardrobe.flies += amount;
      summary.fliesGranted += amount;
    } else if (questReward.type === 'BACKGROUND' && questReward.backgroundId) {
      const inv = user.wardrobe.backgrounds.inventory;
      inv[questReward.backgroundId] = (inv[questReward.backgroundId] ?? 0) + 1;
      summary.grantedBackgroundIds.push(questReward.backgroundId);
    } else if (questReward.itemId) {
      addItem(
        questReward.itemId,
        Math.max(1, Math.floor(questReward.amount ?? 1)),
      );
    }
  }

  user.markModified('wardrobe');
  return summary;
}

export function scaleFlies(amount: number, multiplier: number, isPremium: boolean) {
  return Math.max(
    0,
    Math.round(Math.max(0, amount) * Math.max(0, multiplier) * (isPremium ? 2 : 1)),
  );
}

export function rewardFlies(rewards: BonusRewards) {
  return rewards.reduce(
    (sum, reward) =>
      reward.type === 'FLIES' ? sum + Math.max(0, reward.amount ?? 0) : sum,
    0,
  );
}

export function emptyGrant(): LeapGrantSummary {
  return {
    fliesGranted: 0,
    grantedItemIds: [],
    grantedBackgroundIds: [],
    shieldsGranted: 0,
  };
}

export function mergeGrant(into: LeapGrantSummary, from: LeapGrantSummary) {
  into.fliesGranted += from.fliesGranted;
  into.grantedItemIds.push(...from.grantedItemIds);
  into.grantedBackgroundIds.push(...from.grantedBackgroundIds);
  into.shieldsGranted += from.shieldsGranted;
  return into;
}

export async function grantLeapRewards(args: {
  userId: string;
  rewards: BonusRewards;
  occurrenceKey: string;
  dayKey: string;
  isPremium: boolean;
  flyMultiplier: number;
  meta?: Record<string, unknown>;
}): Promise<LeapGrantSummary> {
  const { userId, rewards, isPremium } = args;
  const summary = emptyGrant();
  if (!rewards.length) return summary;
  await connectMongo();

  const requestedFlies = scaleFlies(
    rewardFlies(rewards),
    args.flyMultiplier,
    isPremium,
  );
  let flies = 0;
  if (requestedFlies > 0) {
    const settlement = await settleFlyGrant({
      userId,
      source: 'leap',
      occurrenceKey: args.occurrenceKey,
      dayKey: args.dayKey,
      targetAmount: requestedFlies,
      meta: args.meta,
    });
    flies = Math.max(0, settlement.delta);
  }

  const inc: Record<string, number> = {};
  const unseen: string[] = [];
  let shields = 0;
  const rarityDraws: BonusRewards = [];
  if (flies > 0) inc['wardrobe.flies'] = flies;
  for (const reward of rewards) {
    if (reward.type === 'FLIES') continue;
    if (reward.type === 'SHIELD') {
      shields += Math.max(1, Math.floor(reward.amount ?? 1));
      continue;
    }
    if (reward.type === 'RARITY_ITEM') {
      rarityDraws.push(reward);
      continue;
    }
    const questReward = reward as QuestReward;
    if (questReward.type === 'BACKGROUND' && questReward.backgroundId) {
      const path = `wardrobe.backgrounds.inventory.${questReward.backgroundId}`;
      inc[path] = (inc[path] ?? 0) + 1;
      summary.grantedBackgroundIds.push(questReward.backgroundId);
      continue;
    }
    if (questReward.itemId) {
      const copies = Math.max(1, Math.floor(questReward.amount ?? 1));
      const path = `wardrobe.inventory.${questReward.itemId}`;
      inc[path] = (inc[path] ?? 0) + copies;
      for (let i = 0; i < copies; i += 1) {
        summary.grantedItemIds.push(questReward.itemId);
      }
      unseen.push(questReward.itemId);
    }
  }

  if (Object.keys(inc).length > 0) {
    await UserModel.updateOne(
      { _id: userId },
      {
        $inc: inc,
        ...(unseen.length
          ? { $addToSet: { 'wardrobe.unseenItems': { $each: unseen } } }
          : {}),
      },
    );
  }
  summary.fliesGranted = flies;
  if (flies > 0) {
    void recordAnalyticsEvent({
      userId,
      name: 'fly_earned',
      properties: {
        source: 'leap',
        fly_amount: flies,
        is_premium: isPremium,
        leap_kind: args.occurrenceKey.split(':')[1] ?? 'other',
      },
    }).catch(() => {});
  }

  if (shields > 0) {
    const [user, shieldConfig] = await Promise.all([
      UserModel.findById(userId).select('quests premiumUntil').lean(),
      loadShieldConfig(),
    ]);
    if (user) {
      const before = readShieldState(user);
      const after = grantShields(before, shieldConfig, isPremium, shields);
      if (after.count !== before.count) {
        await persistShieldState(userId, after);
        summary.shieldsGranted = after.count - before.count;
      }
    }
  }

  if (rarityDraws.length > 0) {
    const userDoc = await UserModel.findById(userId);
    if (userDoc) {
      const shieldConfig = await loadShieldConfig();
      const drawn = await applyBonusRewards({
        user: userDoc,
        rewards: rarityDraws,
        isPremium,
        doubles: false,
        shieldState: readShieldState(userDoc.toObject()),
        shieldConfig,
      });
      await userDoc.save();
      summary.grantedItemIds.push(...drawn.grantedItemIds);
      summary.grantedBackgroundIds.push(...drawn.grantedBackgroundIds);
    }
  }

  return summary;
}
