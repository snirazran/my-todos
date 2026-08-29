import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import User from '@/lib/models/User';
import { getPrizePool, type GiftPrize } from '@/lib/skins/gifts';
import { isPremiumActive } from '@/lib/skins/dailyDeal';
import { ensureTradeModifiersConfig } from '@/lib/models/TradeModifiersConfig';
import {
  DEFAULT_TRADE_MODIFIERS,
  quoteAimPrice,
  quoteTradeFuel,
  recipeFor,
  tradeNewFirstWeight,
} from '@/lib/skins/tradeModifiers';
import { aimableTradeTargets, pickTradeReward } from '@/lib/skins/tradeRewards';
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
    // Back-compat: legacy clients send `itemIds: string[]` (all items).
    const picks: Pick[] = Array.isArray(body?.picks)
      ? toPicks(body.picks)
      : Array.isArray(body?.itemIds)
        ? body.itemIds.map((id: any) => ({ id: String(id), kind: 'item' as const }))
        : [];
    const fuelPicks: Pick[] = toPicks(body?.fuel);
    const wantsAim = body?.aim === true;

    if (picks.length === 0 || picks.some((p) => !p.id)) {
      return NextResponse.json({ error: 'Pick items to trade.' }, { status: 400 });
    }
    if (fuelPicks.some((p) => !p.id)) {
      return NextResponse.json({ error: 'Pick fuel items to trade.' }, { status: 400 });
    }

    // The default scene is granted, not earned — it can't be spent. It's
    // already absent from the prize pool, so this only exists to return a
    // sentence that makes sense instead of "Invalid item: bg_default".
    if (
      [...picks, ...fuelPicks].some(
        (p) => p.kind === 'background' && p.id === DEFAULT_BACKGROUND_ID,
      )
    ) {
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

    // 1. Validate ownership and resolve definitions
    const inputs: GiftPrize[] = [];
    const fuelInputs: GiftPrize[] = [];
    const deduct: Record<string, number> = {};
    const resolve = (list: Pick[], into: GiftPrize[]) => {
      for (const pick of list) {
        const key = `${pick.kind}:${pick.id}`;
        const def = byKey.get(key);
        if (!def) return pick.id;
        into.push(def);
        deduct[key] = (deduct[key] || 0) + 1;
      }
      return null;
    };
    const invalid = resolve(picks, inputs) ?? resolve(fuelPicks, fuelInputs);
    if (invalid) {
      return NextResponse.json({ error: `Invalid item: ${invalid}` }, { status: 400 });
    }

    for (const [key, count] of Object.entries(deduct)) {
      const [kind, ...rest] = key.split(':');
      const id = rest.join(':');
      if (ownedCount(kind, id) < count) {
        return NextResponse.json({ error: `Not enough of ${id}` }, { status: 400 });
      }
    }

    // 2. Same rarity, and a recipe exists for it
    const firstRarity = inputs[0].rarity;
    if (!inputs.every((i) => i.rarity === firstRarity)) {
      return NextResponse.json(
        { error: 'All items must be of the same rarity.' },
        { status: 400 },
      );
    }
    const recipe = recipeFor(modifiers, firstRarity);
    if (!recipe) {
      return NextResponse.json(
        { error: `Cannot trade up from ${firstRarity}.` },
        { status: 400 },
      );
    }
    if (picks.length !== recipe.itemCount) {
      return NextResponse.json(
        {
          error: `${firstRarity} trades take exactly ${recipe.itemCount} items.`,
        },
        { status: 400 },
      );
    }
    const nextRarity = recipe.to;

    // 3. Fuel. Spares only means every main input is one the player owns more
    // than one of, so nothing they'd regret burning goes in — and it's what
    // waives fuel, so it's checked before the fuel count.
    const inputKeys = new Set(picks.map((p) => `${p.kind}:${p.id}`));
    const allSpares = Array.from(inputKeys).every((key) => {
      const [kind, ...rest] = key.split(':');
      return ownedCount(kind, rest.join(':')) >= 2;
    });
    const isPremium = isPremiumActive(user.premiumUntil);
    const fuelQuote = quoteTradeFuel({
      modifiers,
      recipe,
      allSpares,
      isPlus: isPremium,
    });
    if (fuelInputs.length !== fuelQuote.count) {
      return NextResponse.json(
        {
          error: fuelQuote.count
            ? `This trade also takes ${fuelQuote.count} ${recipe.fuelRarity} ${fuelQuote.count === 1 ? 'item' : 'items'}.`
            : 'This trade takes no extra items.',
          fuelCount: fuelQuote.count,
          fuelRarity: recipe.fuelRarity,
        },
        { status: 400 },
      );
    }
    if (
      recipe.fuelRarity &&
      !fuelInputs.every((i) => i.rarity === recipe.fuelRarity)
    ) {
      return NextResponse.json(
        { error: `Extra items must be ${recipe.fuelRarity}.` },
        { status: 400 },
      );
    }

    // 4. Rewards — guaranteed one tier up, identity is what's random. Aiming
    // pays flies to guarantee the identity comes off the wishlist.
    const owns = (prize: GiftPrize) => ownedCount(prize.kind, prize.id) > 0;
    const wishlistKeys = new Set(
      readWishlistPins(user.wardrobe).map((pin) => wishlistPinKey(pin)),
    );
    const aimQuote = quoteAimPrice({ modifiers, recipe, isPlus: isPremium });
    const balance = user.wardrobe?.flies ?? 0;
    const aimedTargets = aimableTradeTargets({
      pool,
      rarity: nextRarity,
      owns,
      wishlistKeys,
    });
    if (wantsAim) {
      if (aimedTargets.length === 0) {
        return NextResponse.json(
          { error: `Wishlist an un-owned ${nextRarity} item to aim this trade.` },
          { status: 400 },
        );
      }
      if (balance < aimQuote.price) {
        return NextResponse.json(
          {
            error: `You need ${aimQuote.price.toLocaleString()} flies to aim this trade.`,
            aimPrice: aimQuote.price,
            shortBy: aimQuote.price - balance,
          },
          { status: 400 },
        );
      }
    }
    const aimed = wantsAim && aimedTargets.length > 0;
    const newFirstWeight = tradeNewFirstWeight(modifiers, allSpares);

    const reward = pickTradeReward({
      pool,
      rarity: nextRarity,
      owns,
      wishlistKeys,
      modifiers,
      newFirstWeight,
      aimed,
      exclude: null,
    });
    if (!reward) {
      return NextResponse.json({ error: `No prizes for rarity ${nextRarity}` }, { status: 500 });
    }

    const golden =
      modifiers.goldenTradeRewardCount > 1 &&
      Math.random() * 100 < modifiers.goldenTradeChancePercent;
    const bonusReward = golden
      ? pickTradeReward({
          pool,
          rarity: nextRarity,
          owns,
          wishlistKeys,
          modifiers,
          newFirstWeight,
          exclude: reward,
        })
      : null;
    const rewards = bonusReward ? [reward, bonusReward] : [reward];

    // 5. Charge Aim on its own guarded write so two requests can't spend the
    // same flies twice. Nothing below writes `wardrobe.flies`, so the document
    // save that follows won't put the stale balance back.
    const aimSpend = aimed ? aimQuote.price : 0;
    if (aimSpend > 0) {
      const paid = await User.updateOne(
        { _id: userId, 'wardrobe.flies': { $gte: aimSpend } },
        { $inc: { 'wardrobe.flies': -aimSpend } },
      );
      if (paid.modifiedCount === 0) {
        return NextResponse.json(
          { error: 'Not enough flies', aimPrice: aimSpend },
          { status: 400 },
        );
      }
    }

    // 6. Execute
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
        }
      } else {
        user.wardrobe.inventory[id] = (user.wardrobe.inventory[id] || 0) - count;
        if (user.wardrobe.inventory[id] <= 0) {
          delete user.wardrobe.inventory[id];
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
      rarity: nextRarity,
      // An aimed trade was paid for a wishlist hit — a reroll swaps which one,
      // never whether.
      aimed,
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
    await bumpQuestMetric({ userId, metric: 'trade_completed', timezone });
    await bumpQuestMetric({ userId, metric: 'skin_acquired', timezone });
    await recordAnalyticsEvent({
      userId,
      name: 'skin_traded',
      properties: {
        from_rarity: firstRarity,
        to_rarity: nextRarity,
        rarity: reward.rarity,
        slot: reward.slot,
        item_count: recipe.itemCount,
        fuel_rarity: recipe.fuelRarity ?? 'none',
        fuel_count: fuelQuote.count,
        base_fuel_count: fuelQuote.baseCount,
        fuel_waived: fuelQuote.waived,
        all_spares: allSpares,
        aimed,
        aim_flies: aimSpend,
        golden: !!bonusReward,
        reward_count: rewards.length,
        is_premium: isPremium,
      },
    });
    if (aimSpend > 0) {
      await recordAnalyticsEvent({
        userId,
        name: 'fly_spent',
        properties: {
          source: 'trade_aim',
          fly_amount: aimSpend,
          is_premium: isPremium,
        },
      });
    }

    return NextResponse.json({
      success: true,
      reward,
      rewards,
      bonusReward,
      golden: !!bonusReward,
      aimed,
      aimPrice: aimSpend,
      rerollClaimId,
    });
  } catch (error) {
    console.error('Trade error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
