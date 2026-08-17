import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import User from '@/lib/models/User';
import { getRewardPool, type PrizeKind } from '@/lib/skins/gifts';
import { ensureTradeModifiersConfig } from '@/lib/models/TradeModifiersConfig';
import { pickTradeReward } from '@/lib/skins/tradeRewards';
import { readWishlistPins, wishlistPinKey } from '@/lib/skins/wishlist';
import { dropFromWishlist } from '@/lib/skins/wishlistServer';
import { clearGiftLuckForPrizes } from '@/lib/skins/giftLuck';
import type { Rarity } from '@/lib/skins/catalog';
import { DOUBLE_CLAIM_WINDOW_MS } from '@/lib/rewards/adDouble';
import { consumeAdView } from '@/lib/rewards/adBudget';
import { isPremiumActive } from '@/lib/skins/dailyDeal';

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { claimId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const claimId = String(body.claimId ?? '');
  if (!claimId) {
    return NextResponse.json({ error: 'Missing claimId' }, { status: 400 });
  }

  try {
    await dbConnect();
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const claim = (user as any).tradeRerollClaim as
      | {
          id: string;
          rewardId: string;
          rewardKind: 'item' | 'background';
          rarity: string;
          aimed?: boolean;
          used: boolean;
          createdAt: Date | string;
        }
      | undefined;
    if (!claim || claim.id !== claimId || claim.used) {
      return NextResponse.json({ granted: false });
    }
    const age = Date.now() - new Date(claim.createdAt).getTime();
    if (age > DOUBLE_CLAIM_WINDOW_MS) {
      return NextResponse.json({ granted: false });
    }

    const premium = isPremiumActive(user.premiumUntil);
    if (!premium) {
      const spend = await consumeAdView({
        userId,
        placement: 'trade_reroll',
        premium: false,
      });
      if (!spend.ok) {
        return NextResponse.json({ granted: false, reason: spend.reason });
      }
    }

    const itemInv = user.wardrobe?.inventory ?? {};
    const bgInv = user.wardrobe?.backgrounds?.inventory ?? {};
    const ownedCount =
      claim.rewardKind === 'background'
        ? bgInv[claim.rewardId] || 0
        : itemInv[claim.rewardId] || 0;
    if (ownedCount < 1) {
      return NextResponse.json({ granted: false });
    }

    const [pool, modifiers] = await Promise.all([
      getRewardPool(),
      ensureTradeModifiersConfig(),
    ]);
    const owns = (prize: { kind: string; id: string }) =>
      ((prize.kind === 'background' ? bgInv[prize.id] : itemInv[prize.id]) || 0) >
      0;
    const wishlistKeys = new Set(
      readWishlistPins(user.wardrobe).map((pin) => wishlistPinKey(pin)),
    );
    const draw = (
      exclude: { kind: PrizeKind; id: string } | null,
      aimed: boolean,
    ) =>
      pickTradeReward({
        pool,
        rarity: claim.rarity as Rarity,
        owns,
        wishlistKeys,
        modifiers,
        aimed,
        exclude: exclude as any,
      });
    const excluded = { kind: claim.rewardKind, id: claim.rewardId };
    // An aimed trade paid for a wishlist hit, so its reroll stays on the
    // wishlist — it only swaps which one. It falls back to an open draw when
    // that was the last un-owned wishlisted item at this tier.
    const reward = claim.aimed
      ? (draw(excluded, true) ?? draw(null, true) ?? draw(excluded, false) ?? draw(null, false))
      : (draw(excluded, false) ?? draw(null, false));
    if (!reward) {
      return NextResponse.json(
        { error: `No prizes for rarity ${claim.rarity}` },
        { status: 500 },
      );
    }

    if (!user.wardrobe) {
      user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
    }
    user.wardrobe.inventory = user.wardrobe.inventory ?? {};
    if (!user.wardrobe.backgrounds) {
      user.wardrobe.backgrounds = { equipped: null, inventory: {} };
    }
    user.wardrobe.backgrounds.inventory =
      user.wardrobe.backgrounds.inventory ?? {};
    user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];

    if (claim.rewardKind === 'background') {
      const next = (user.wardrobe.backgrounds.inventory[claim.rewardId] || 0) - 1;
      if (next <= 0) delete user.wardrobe.backgrounds.inventory[claim.rewardId];
      else user.wardrobe.backgrounds.inventory[claim.rewardId] = next;
    } else {
      const next = (user.wardrobe.inventory[claim.rewardId] || 0) - 1;
      if (next <= 0) {
        delete user.wardrobe.inventory[claim.rewardId];
        user.wardrobe.unseenItems = user.wardrobe.unseenItems.filter(
          (id: string) => id !== claim.rewardId,
        );
      } else {
        user.wardrobe.inventory[claim.rewardId] = next;
      }
    }

    if (reward.kind === 'background') {
      user.wardrobe.backgrounds.inventory[reward.id] =
        (user.wardrobe.backgrounds.inventory[reward.id] || 0) + 1;
      user.markModified('wardrobe.backgrounds');
    } else {
      user.wardrobe.inventory[reward.id] =
        (user.wardrobe.inventory[reward.id] || 0) + 1;
      if (!user.wardrobe.inventoryHistory) user.wardrobe.inventoryHistory = {};
      if (!user.wardrobe.inventoryHistory[reward.id]) {
        user.wardrobe.inventoryHistory[reward.id] = new Date().toISOString();
      }
      if (!user.wardrobe.unseenItems.includes(reward.id)) {
        user.wardrobe.unseenItems.push(reward.id);
      }
      user.markModified('wardrobe.inventoryHistory');
    }
    user.markModified('wardrobe.unseenItems');
    user.markModified('wardrobe.inventory');

    (user as any).tradeRerollClaim = { ...claim, used: true };
    user.markModified('tradeRerollClaim');
    await user.save();
    await dropFromWishlist(userId, user.wardrobe, reward.id, reward.kind);
    await clearGiftLuckForPrizes(userId, [reward.rarity]);

    return NextResponse.json({ granted: true, reward });
  } catch (error) {
    console.error('Trade reroll error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
