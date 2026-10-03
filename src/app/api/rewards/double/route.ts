export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import {
  DOUBLE_CLAIM_WINDOW_MS,
  type AdDoubleClaim,
} from '@/lib/rewards/adDouble';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { isPremiumActive } from '@/lib/skins/dailyDeal';
import { consumeAdView, refundAdView } from '@/lib/rewards/adBudget';

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
    /* empty body handled below */
  }
  const claimId = String(body.claimId ?? '');
  if (!claimId) {
    return NextResponse.json({ error: 'Missing claimId' }, { status: 400 });
  }

  try {
    await connectMongo();
    const user = await UserModel.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const claim = (user as any).adDoubleClaim as AdDoubleClaim | undefined;
    if (!claim || claim.id !== claimId || claim.doubled) {
      return NextResponse.json({ granted: false });
    }
    const age = Date.now() - new Date(claim.createdAt).getTime();
    if (age > DOUBLE_CLAIM_WINDOW_MS) {
      return NextResponse.json({ granted: false });
    }

    const premium = isPremiumActive(user.premiumUntil);
    const spend = premium
      ? null
      : await consumeAdView({
          userId,
          placement: 'reward_double',
          premium: false,
        });
    if (spend && !spend.ok) {
      return NextResponse.json({
        granted: false,
        reason: spend.reason,
        cooldownLeft: spend.cooldownLeft,
        remaining: spend.remaining,
      });
    }

    const inc: Record<string, number> = {};
    if (claim.fliesGranted > 0) inc['wardrobe.flies'] = claim.fliesGranted;
    for (const itemId of claim.grantedItemIds ?? []) {
      const key = `wardrobe.inventory.${itemId}`;
      inc[key] = (inc[key] ?? 0) + 1;
    }
    for (const bgId of claim.grantedBackgroundIds ?? []) {
      const key = `wardrobe.backgrounds.inventory.${bgId}`;
      inc[key] = (inc[key] ?? 0) + 1;
    }
    const update: Record<string, unknown> = {
      $set: { 'adDoubleClaim.doubled': true },
    };
    if (Object.keys(inc).length > 0) update.$inc = inc;
    if (claim.grantedItemIds?.length) {
      update.$push = { 'wardrobe.unseenItems': { $each: claim.grantedItemIds } };
    }

    let updated: { wardrobe?: { flies?: number } } | null;
    try {
      updated = await UserModel.findOneAndUpdate(
        {
          _id: userId,
          'adDoubleClaim.id': claimId,
          'adDoubleClaim.doubled': false,
        },
        update,
        { returnDocument: 'after', projection: { 'wardrobe.flies': 1 } },
      ).lean();
    } catch (saveErr) {
      if (spend) await refundAdView({ userId, placement: 'reward_double' });
      throw saveErr;
    }
    if (!updated) {
      if (spend) await refundAdView({ userId, placement: 'reward_double' });
      return NextResponse.json({ granted: false });
    }
    if (claim.fliesGranted > 0) {
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'rewarded_ad_double',
          fly_amount: claim.fliesGranted,
          is_premium: premium,
        },
      });
    }

    return NextResponse.json({
      granted: true,
      summary: {
        fliesGranted: claim.fliesGranted,
        grantedItemIds: claim.grantedItemIds ?? [],
        grantedBackgroundIds: claim.grantedBackgroundIds ?? [],
        flyBalanceAfter: updated.wardrobe?.flies ?? 0,
      },
    });
  } catch (err) {
    console.error('Reward double failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Double failed' },
      { status: 500 },
    );
  }
}
