import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import User from '@/lib/models/User';
import { getPrizePool, type GiftPrize } from '@/lib/skins/gifts';
import { isPremiumActive } from '@/lib/skins/dailyDeal';
import { ensureTradeModifiersConfig } from '@/lib/models/TradeModifiersConfig';
import { DEFAULT_TRADE_MODIFIERS, recipeFor } from '@/lib/skins/tradeModifiers';
import { pickTradeReward } from '@/lib/skins/tradeRewards';
import { clearGiftLuckForPrizes } from '@/lib/skins/giftLuck';
import { readWishlistPins, wishlistPinKey } from '@/lib/skins/wishlist';
import { dropFromWishlist } from '@/lib/skins/wishlistServer';
import { DEFAULT_BACKGROUND_ID } from '@/lib/backgrounds/constants';
import { bumpQuestMetric } from '@/lib/quests/metrics';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

type Pick = { id: string; kind: 'item' | 'background' };

export async function GET() {
  try {
    const userId = await requireUserId();
    await dbConnect();
    const [modifiers, user] = await Promise.all([
      ensureTradeModifiersConfig(),
      User.findById(userId).select('premiumUntil').lean(),
    ]);
    return NextResponse.json({
      modifiers,
      isPremium: isPremiumActive((user as any)?.premiumUntil),
    });
  } catch {
    const modifiers = await ensureTradeModifiersConfig().catch(
      () => DEFAULT_TRADE_MODIFIERS,
    );
    return NextResponse.json({ modifiers, isPremium: false });
  }
}

const toPicks = (raw: unknown): Pick[] =>
  Array.isArray(raw)
    ? raw.map((p: any) => ({
        id: String(p?.id ?? ''),
        kind: p?.kind === 'background' ? 'background' : 'item',
      }))
    : [];

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    const body = await req.json();
    const picks: Pick[] = Array.isArray(body?.picks)
      ? toPicks(body.picks)
      : Array.isArray(body?.itemIds)
        ? body.itemIds.map((id: any) => ({ id: String(id), kind: 'item' as const }))
        : [];

    if (picks.length === 0 || picks.some((p) => !p.id)) {
      return NextResponse.json({ error: 'Pick items to trade.' }, { status: 400 });
    }
    if (picks.some((p) => p.kind === 'background' && p.id === DEFAULT_BACKGROUND_ID)) {
      return NextResponse.json(
        { error: 'The default background cannot be traded.' },
        { status: 400 },
      );
    }

    await dbConnect();
    const [pool, modifiers] = await Promise.all([
      getPrizePool(),
      ensureTradeModifiersConfig(),
    ]);
    const byKey = new Map<string, GiftPrize>(
      pool.map((p) => [`${p.kind}:${p.id}`, p]),
    );

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const itemInv = user.wardrobe?.inventory || {};
    const bgInv = user.wardrobe?.backgrounds?.inventory || {};
    const ownedCount = (kind: string, id: string) =>
      (kind === 'background' ? bgInv[id] : itemInv[id]) || 0;

    const inputs: GiftPrize[] = [];
    const deduct: Record<string, number> = {};
    for (const pick of picks) {
      const key = `${pick.kind}:${pick.id}`;
      const def = byKey.get(key);
      if (!def) {
        return NextResponse.json({ error: `Invalid item: ${pick.id}` }, { status: 400 });
      }
      inputs.push(def);
      deduct[key] = (deduct[key] || 0) + 1;
    }

    let lastCopies = 0;
    for (const [key, count] of Object.entries(deduct)) {
      const [kind, ...rest] = key.split(':');
      const owned = ownedCount(kind, rest.join(':'));
      if (owned < count) {
        return NextResponse.json({ error: `Not enough of ${rest.join(':')}` }, { status: 400 });
      }
      if (owned === count) lastCopies += 1;
    }

    const fromRarity = inputs[0].rarity;
    if (!inputs.every((i) => i.rarity === fromRarity)) {
      return NextResponse.json(
        { error: 'All items must be the same rarity.' },
        { status: 400 },
      );
    }
    const recipe = recipeFor(modifiers, fromRarity);
    if (!recipe) {
      return NextResponse.json(
        { error: `${fromRarity} items can't be traded up.` },
        { status: 400 },
      );
    }
    if (picks.length !== recipe.itemCount) {
      return NextResponse.json(
        { error: `This trade takes exactly ${recipe.itemCount} ${fromRarity} items.` },
        { status: 400 },
      );
    }
    const toRarity = recipe.to;

    const owns = (prize: GiftPrize) => ownedCount(prize.kind, prize.id) > 0;
    const wishlistKeys = new Set(
      readWishlistPins(user.wardrobe).map((pin) => wishlistPinKey(pin)),
    );
    const reward = pickTradeReward({
      pool,
      rarity: toRarity,
      owns,
      wishlistKeys,
      modifiers,
    });
    if (!reward) {
      return NextResponse.json({ error: `No ${toRarity} items to trade for yet.` }, { status: 500 });
    }

    const golden =
      modifiers.goldenTradeRewardCount > 1 &&
      Math.random() * 100 < modifiers.goldenTradeChancePercent;
    const bonusReward = golden
      ? pickTradeReward({
          pool,
          rarity: toRarity,
          owns: (prize) => owns(prize) || (prize.kind === reward.kind && prize.id === reward.id),
          wishlistKeys,
          modifiers,
          exclude: reward,
        })
      : null;
    const rewards = bonusReward ? [reward, bonusReward] : [reward];

    if (!user.wardrobe) {
      user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
    }
    user.wardrobe.inventory = user.wardrobe.inventory ?? {};
    if (!user.wardrobe.backgrounds) {
      user.wardrobe.backgrounds = { equipped: null, inventory: {} };
    }
    user.wardrobe.backgrounds.inventory = user.wardrobe.backgrounds.inventory ?? {};

    for (const [key, count] of Object.entries(deduct)) {
      const [kind, ...rest] = key.split(':');
      const id = rest.join(':');
      if (kind === 'background') {
        user.wardrobe.backgrounds.inventory[id] =
          (user.wardrobe.backgrounds.inventory[id] || 0) - count;
        if (user.wardrobe.backgrounds.inventory[id] <= 0) {
          delete user.wardrobe.backgrounds.inventory[id];
          if (user.wardrobe.backgrounds.equipped === id) {
            user.wardrobe.backgrounds.equipped = null;
          }
        }
      } else {
        user.wardrobe.inventory[id] = (user.wardrobe.inventory[id] || 0) - count;
        if (user.wardrobe.inventory[id] <= 0) {
          delete user.wardrobe.inventory[id];
          const equipped = (user.wardrobe.equipped ?? {}) as Record<string, string | null>;
          for (const slot of Object.keys(equipped)) {
            if (equipped[slot] === id) equipped[slot] = null;
          }
          user.markModified('wardrobe.equipped');
        }
      }
    }

    for (const prize of rewards) {
      if (prize.kind === 'background') {
        user.wardrobe.backgrounds.inventory[prize.id] =
          (user.wardrobe.backgrounds.inventory[prize.id] || 0) + 1;
      } else {
        user.wardrobe.inventory[prize.id] = (user.wardrobe.inventory[prize.id] || 0) + 1;
        if (!user.wardrobe.inventoryHistory) user.wardrobe.inventoryHistory = {};
        if (!user.wardrobe.inventoryHistory[prize.id]) {
          user.wardrobe.inventoryHistory[prize.id] = new Date().toISOString();
        }
        if (!user.wardrobe.unseenItems) user.wardrobe.unseenItems = [];
        if (!user.wardrobe.unseenItems.includes(prize.id)) {
          user.wardrobe.unseenItems.push(prize.id);
        }
        user.markModified('wardrobe.inventoryHistory');
        user.markModified('wardrobe.unseenItems');
      }
    }

    const rerollClaimId = randomUUID();
    (user as any).tradeRerollClaim = {
      id: rerollClaimId,
      rewardId: reward.id,
      rewardKind: reward.kind,
      rarity: toRarity,
      used: false,
      createdAt: new Date(),
    };
    user.markModified('tradeRerollClaim');
    user.markModified('wardrobe.inventory');
    user.markModified('wardrobe.backgrounds');
    await user.save();

    for (const prize of rewards) {
      await dropFromWishlist(userId, user.wardrobe, prize.id, prize.kind);
    }
    await clearGiftLuckForPrizes(
      userId,
      rewards.map((prize) => prize.rarity),
    );

    const timezone = typeof body?.timezone === 'string' ? body.timezone : undefined;
    await Promise.allSettled([
      bumpQuestMetric({ userId, metric: 'trade_completed', timezone }),
      bumpQuestMetric({ userId, metric: 'skin_acquired', timezone }),
      recordAnalyticsEvent({
        userId,
        name: 'skin_traded',
        properties: {
          from_rarity: fromRarity,
          to_rarity: toRarity,
          rarity: reward.rarity,
          slot: reward.slot,
          item_count: recipe.itemCount,
          last_copies: lastCopies,
          spares_only: lastCopies === 0,
          wishlist_hit: wishlistKeys.has(`${reward.kind}:${reward.id}`),
          golden: !!bonusReward,
          reward_count: rewards.length,
          is_premium: isPremiumActive(user.premiumUntil),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      reward,
      rewards,
      bonusReward,
      golden: !!bonusReward,
      rerollClaimId,
    });
  } catch (error) {
    console.error('Trade error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
