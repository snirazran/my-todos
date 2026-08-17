export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import { adFliesRemaining, type AdFlyDaily } from '@/lib/rewards/adFlies';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { loadFlyEconomyConfig } from '@/lib/economy/config';
import { settleFlyGrant } from '@/lib/economy/ledger';
import { resolveEconomyTimezone } from '@/lib/economy/guards';

function cooldownLeft(prev: AdFlyDaily | undefined, cooldownSeconds: number) {
  if (!prev?.lastAt || cooldownSeconds <= 0) return 0;
  const elapsed = Date.now() - new Date(prev.lastAt).getTime();
  return Math.max(0, Math.ceil((cooldownSeconds * 1000 - elapsed) / 1000));
}

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
    const user = await UserModel.findById(userId).select('adFlyDaily').lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const today = getZonedToday(tz);
    const prev = (user as any).adFlyDaily as AdFlyDaily | undefined;
    return NextResponse.json({
      reward: config.rewardedAds.reward,
      cap: config.rewardedAds.dailyCap,
      remaining: adFliesRemaining(prev, today, config.rewardedAds.dailyCap),
      cooldownSeconds: config.rewardedAds.cooldownSeconds,
      cooldownLeft: cooldownLeft(prev, config.rewardedAds.cooldownSeconds),
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
    const prev = (user as any).adFlyDaily as AdFlyDaily | undefined;
    const count = prev && prev.date === today ? prev.count : 0;
    const cap = config.rewardedAds.dailyCap;
    const waitLeft = cooldownLeft(prev, config.rewardedAds.cooldownSeconds);

    if (count >= cap || waitLeft > 0) {
      return NextResponse.json({
        granted: false,
        reward: config.rewardedAds.reward,
        cap,
        remaining: Math.max(0, cap - count),
        cooldownLeft: waitLeft,
        reason: waitLeft > 0 ? 'cooldown' : 'cap',
      });
    }

    // The view number is the occurrence: a retried request settles the same row
    // rather than paying a second time.
    const settlement = await settleFlyGrant({
      userId,
      source: 'rewarded_ad',
      occurrenceKey: `${today}:${count + 1}`,
      dayKey: today,
      targetAmount: config.rewardedAds.reward,
      meta: { view: count + 1 },
    });

    if (settlement.delta <= 0) {
      return NextResponse.json({
        granted: false,
        reward: config.rewardedAds.reward,
        cap,
        remaining: Math.max(0, cap - count),
        cooldownLeft: 0,
        reason: settlement.breakerTripped ? 'breaker' : 'duplicate',
      });
    }

    if (!user.wardrobe) {
      user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
    }
    user.wardrobe.flies = (user.wardrobe.flies ?? 0) + settlement.delta;
    (user as any).adFlyDaily = {
      date: today,
      count: count + 1,
      lastAt: new Date(),
    };
    user.markModified('adFlyDaily');
    user.markModified('wardrobe');
    await user.save();
    await recordAnalyticsEvent({
      userId,
      name: 'fly_earned',
      properties: {
        source: 'rewarded_ad',
        fly_amount: settlement.delta,
        is_premium: false,
      },
    });

    return NextResponse.json({
      granted: true,
      amount: settlement.delta,
      balance: user.wardrobe.flies,
      reward: config.rewardedAds.reward,
      cap,
      remaining: Math.max(0, cap - (count + 1)),
      cooldownSeconds: config.rewardedAds.cooldownSeconds,
      cooldownLeft: config.rewardedAds.cooldownSeconds,
    });
  } catch (err) {
    console.error('Ad fly reward failed:', err);
    return NextResponse.json({ error: 'Reward failed' }, { status: 500 });
  }
}
