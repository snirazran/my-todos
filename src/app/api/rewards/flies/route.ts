export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { loadFlyEconomyConfig } from '@/lib/economy/config';
import { settleFlyGrant } from '@/lib/economy/ledger';
import { resolveEconomyTimezone } from '@/lib/economy/guards';
import { isPremiumActive } from '@/lib/skins/dailyDeal';
import { consumeAdView, readAdBudget, refundAdView } from '@/lib/rewards/adBudget';

const PLACEMENT = 'daily_flies' as const;

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();
    const config = await loadFlyEconomyConfig();
    const tz = await resolveEconomyTimezone(
      userId,
      req.nextUrl.searchParams.get('timezone'),
    );
    const user = await UserModel.findById(userId).select('premiumUntil').lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const premium = isPremiumActive(user.premiumUntil);
    const budget = await readAdBudget({
      userId,
      placement: PLACEMENT,
      premium,
      tz,
    });

    return NextResponse.json({
      reward: config.rewardedAds.reward,
      cap: budget.placementCap,
      // The shared ceiling is the one that actually binds, so it is what the
      // card counts down.
      remaining: Math.min(budget.remaining, budget.placementRemaining),
      cooldownSeconds: budget.cooldownSeconds,
      cooldownLeft: budget.cooldownLeft,
      available: budget.available,
      isPremium: premium,
    });
  } catch (err) {
    console.error('Ad fly status failed:', err);
    return NextResponse.json({ error: 'Status failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { timezone?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body → stored zone */
  }

  try {
    await connectMongo();
    const config = await loadFlyEconomyConfig();
    const tz = await resolveEconomyTimezone(userId, body.timezone);
    const user = await UserModel.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const today = getZonedToday(tz);
    const premium = isPremiumActive(user.premiumUntil);

    // One budget across every placement, so watching flat-fly ads spends the
    // same six views doubling and rerolling draw from.
    const spend = await consumeAdView({
      userId,
      placement: PLACEMENT,
      premium,
      tz,
    });
    if (!spend.ok) {
      return NextResponse.json({
        granted: false,
        reward: config.rewardedAds.reward,
        cap: config.rewardedAds.dailyCap,
        remaining: spend.remaining,
        cooldownLeft: spend.cooldownLeft,
        reason: spend.reason,
      });
    }

    // The view number is the occurrence: a retried request settles the same row
    // rather than paying a second time.
    const settlement = await settleFlyGrant({
      userId,
      source: 'rewarded_ad',
      occurrenceKey: `${today}:${spend.view}`,
      dayKey: today,
      targetAmount: config.rewardedAds.reward,
      meta: { view: spend.view, placement: PLACEMENT },
    });

    if (settlement.delta <= 0) {
      await refundAdView({ userId, placement: PLACEMENT, tz });
      return NextResponse.json({
        granted: false,
        reward: config.rewardedAds.reward,
        cap: config.rewardedAds.dailyCap,
        remaining: spend.remaining,
        cooldownLeft: 0,
        reason: settlement.breakerTripped ? 'breaker' : 'duplicate',
      });
    }

    if (!user.wardrobe) {
      user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
    }
    user.wardrobe.flies = (user.wardrobe.flies ?? 0) + settlement.delta;
    user.markModified('wardrobe');
    await user.save();
    await recordAnalyticsEvent({
      userId,
      name: 'fly_earned',
      properties: {
        source: 'rewarded_ad',
        fly_amount: settlement.delta,
        is_premium: premium,
        placement: PLACEMENT,
      },
    });

    return NextResponse.json({
      granted: true,
      amount: settlement.delta,
      balance: user.wardrobe.flies,
      reward: config.rewardedAds.reward,
      cap: config.rewardedAds.dailyCap,
      remaining: Math.min(spend.remaining, spend.placementRemaining),
      cooldownSeconds: spend.cooldownSeconds,
      cooldownLeft: spend.cooldownSeconds,
    });
  } catch (err) {
    console.error('Ad fly reward failed:', err);
    return NextResponse.json({ error: 'Reward failed' }, { status: 500 });
  }
}
