export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { ensureShopSalesConfig } from '@/lib/models/ShopSalesConfig';
import { isPremiumActive, shopDay } from '@/lib/skins/dailyDeal';
import { loadFlyEconomyConfig } from '@/lib/economy/config';
import { economyDayKey, resolveEconomyTimezone } from '@/lib/economy/guards';
import { logFlyGrant } from '@/lib/economy/ledger';
import { recordPlusEarned } from '@/lib/plus/earned';
import { rollShopGift } from '@/lib/economy/shopGift';
import { shopGiftHeadroom } from '@/lib/economy/shopGiftServer';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });

type LeanUser = {
  premiumUntil?: Date | null;
  wardrobe?: { flies?: number; shopGift?: { dayKey?: string } } | null;
};

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { timezone?: string } = {};
  try {
    body = await req.json();
  } catch {}

  try {
    await connectMongo();
    const [config, salesConfig, tz] = await Promise.all([
      loadFlyEconomyConfig(),
      ensureShopSalesConfig(),
      resolveEconomyTimezone(userId, body.timezone),
    ]);
    const shop = shopDay(new Date(), tz, salesConfig);

    if (!config.shopGift.enabled) {
      return json({ granted: false, reason: 'disabled', endsAt: shop.endsAt });
    }

    const user = await UserModel.findById(userId)
      .select('premiumUntil wardrobe.flies wardrobe.shopGift')
      .lean<LeanUser | null>();
    if (!user) return json({ error: 'User not found' }, 404);

    if (user.wardrobe?.shopGift?.dayKey === shop.dayKey) {
      return json({ granted: false, reason: 'claimed', endsAt: shop.endsAt });
    }

    const premium = isPremiumActive(user.premiumUntil);
    const balanceBefore = user.wardrobe?.flies ?? 0;
    const first = !user.wardrobe?.shopGift?.dayKey;
    const roll = rollShopGift(balanceBefore, premium, config.shopGift, first);

    const ledgerDay = economyDayKey(tz);
    const amount = first
      ? roll.amount
      : Math.min(roll.amount, await shopGiftHeadroom(userId, tz, config));
    if (amount <= 0) {
      return json({ granted: false, reason: 'breaker', endsAt: shop.endsAt });
    }

    const updated = await UserModel.findOneAndUpdate(
      {
        _id: userId,
        'wardrobe.shopGift.dayKey': first
          ? { $exists: false }
          : { $ne: shop.dayKey },
      },
      {
        $set: {
          'wardrobe.shopGift': {
            dayKey: shop.dayKey,
            amount,
            lucky: roll.lucky,
            first,
            at: new Date(),
          },
        },
        $inc: { 'wardrobe.flies': amount },
      },
      { new: true, projection: { 'wardrobe.flies': 1 } },
    ).lean<{ wardrobe?: { flies?: number } } | null>();

    if (!updated) {
      return json({ granted: false, reason: 'claimed', endsAt: shop.endsAt });
    }

    const balance = updated.wardrobe?.flies ?? balanceBefore + amount;
    if (roll.plus) {
      const withoutPlus = Math.floor(
        roll.base * (roll.lucky ? config.shopGift.luckyMultiplier : 1),
      );
      await recordPlusEarned(userId, { flies: amount - withoutPlus });
    }

    await logFlyGrant({
      userId,
      source: 'shop_gift',
      occurrenceKey: shop.dayKey,
      dayKey: ledgerDay,
      amount,
      balanceAfter: balance,
      meta: { base: roll.base, lucky: roll.lucky, plus: premium, first, balanceBefore },
    });
    await Promise.all([
      recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'shop_gift',
          fly_amount: amount,
          is_premium: premium,
        },
      }),
      recordAnalyticsEvent({
        userId,
        name: 'shop_gift_claimed',
        externalId: `shop_gift_claimed:${userId}:${shop.dayKey}`,
        properties: {
          fly_amount: amount,
          base_amount: roll.base,
          lucky: roll.lucky,
          first,
          balance_before: balanceBefore,
          is_premium: premium,
        },
      }),
    ]);

    return json({
      granted: true,
      amount,
      base: roll.base,
      lucky: roll.lucky,
      luckyMultiplier: config.shopGift.luckyMultiplier,
      plus: roll.plus,
      first,
      plusMultiplier: config.shopGift.plusMultiplier,
      balance,
      endsAt: shop.endsAt,
    });
  } catch (err) {
    console.error('Shop gift claim failed:', err);
    return json({ error: 'Claim failed' }, 500);
  }
}
