export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { isPremiumUser } from '@/lib/quests/engine';
import {
  ensurePactConfig,
  getPactView,
  normalizePactStreak,
  shieldAdsRequiredFor,
  shieldCapFor,
} from '@/lib/pact/engine';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

/**
 * Buys one streak shield, with flies or with rewarded ads.
 *
 * The cap is enforced here rather than trusted from the client: a shield is
 * the only thing in the pact that can rescue a broken week, so stock has to
 * stay scarce for the streak to keep meaning anything.
 */
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    const method = body.method === 'ad' ? 'ad' : 'flies';
    const adsWatched = Math.max(0, Math.floor(Number(body.adsWatched) || 0));

    await connectMongo();
    const config = await ensurePactConfig();
    if (!config.isActive) {
      return NextResponse.json(
        { error: 'The weekly pact is off right now' },
        { status: 400 },
      );
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isPremium = isPremiumUser(user.toObject());
    const streak = normalizePactStreak(user.toObject());
    const cap = shieldCapFor(config, isPremium);
    if (streak.shields >= cap) {
      return NextResponse.json(
        { error: `You can only hold ${cap} shield${cap === 1 ? '' : 's'}` },
        { status: 409 },
      );
    }

    if (method === 'flies') {
      const price = Math.max(1, Number(config.shieldPriceFlies ?? 100));
      const balance = Math.max(0, Number(user.wardrobe?.flies) || 0);
      if (balance < price) {
        return NextResponse.json(
          { error: 'Not enough flies' },
          { status: 400 },
        );
      }
      (user as any).wardrobe.flies = balance - price;
      user.markModified('wardrobe');
      await recordAnalyticsEvent({
        userId,
        name: 'fly_spent',
        properties: {
          source: 'pact_shield',
          fly_amount: price,
          is_premium: isPremium,
        },
      });
    } else {
      // Plus paid to not watch ads. The client hides the option; this makes
      // sure a stale client can't put a subscriber through one anyway.
      if (isPremium) {
        return NextResponse.json(
          { error: 'Plus never needs ads' },
          { status: 400 },
        );
      }
      const minStreak = Math.max(0, Number(config.shieldAdMinStreak ?? 0));
      if (streak.weeks < minStreak) {
        return NextResponse.json(
          {
            error: `Keep ${minStreak} week${minStreak === 1 ? '' : 's'} first`,
          },
          { status: 403 },
        );
      }
      const required = shieldAdsRequiredFor(config, streak.shieldRescues);
      if (adsWatched < required) {
        return NextResponse.json(
          { error: 'Watch the ad first', adsRequired: required },
          { status: 400 },
        );
      }
      await recordAnalyticsEvent({
        userId,
        name: 'ad_completed',
        properties: {
          placement: 'pact_shield',
          ads_watched: adsWatched,
          is_premium: isPremium,
        },
      });
    }

    (user as any).set('quests.pactStreak', {
      ...streak,
      shields: streak.shields + 1,
    });
    await user.save();

    const view = await getPactView({ userId, timezone });
    return NextResponse.json({
      ok: true,
      view,
      flyBalance: Math.max(0, Number((user as any).wardrobe?.flies) || 0),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not get a shield',
      },
      { status: 400 },
    );
  }
}
