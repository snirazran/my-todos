export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { isPremiumUser } from '@/lib/quests/engine';
import { getZonedToday } from '@/lib/utils';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import {
  applyMonthlyGrant,
  buildShieldView,
  grantShields,
  loadShieldConfig,
  markOfferDismissed,
  markOfferPurchased,
  markOfferShown,
  persistShieldState,
  readShieldState,
  shieldCapFor,
} from '@/lib/shields/engine';

function timezoneFrom(value: unknown) {
  return typeof value === 'string' && value ? value : 'UTC';
}

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectMongo();
  const config = await loadShieldConfig();
  const user = await UserModel.findById(userId)
    .select('quests premiumUntil wardrobe.flies')
    .lean();
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const todayKey = getZonedToday(
    timezoneFrom(req.nextUrl.searchParams.get('timezone')),
  );
  const isPremium = isPremiumUser(user as any);
  const state = applyMonthlyGrant(
    readShieldState(user),
    config,
    isPremium,
    todayKey,
  );
  return NextResponse.json({
    shields: buildShieldView({ state, config, isPremium, todayKey }),
    flyBalance: Math.max(0, Number((user as any)?.wardrobe?.flies) || 0),
  });
}

/**
 * Buys one shield, or the two-pack. There is no ad path and no equip step: the
 * only thing a user ever does with a shield is pay for it, and the only thing
 * it ever does is spend itself on a miss.
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
    const todayKey = getZonedToday(timezoneFrom(body?.timezone));
    const action = body?.action === 'dismiss' ? 'dismiss' : 'buy';
    const quantity = body?.quantity === 2 ? 2 : 1;

    await connectMongo();
    const config = await loadShieldConfig();
    const user = await UserModel.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userObject = user.toObject();
    const isPremium = isPremiumUser(userObject);
    let state = applyMonthlyGrant(
      readShieldState(userObject),
      config,
      isPremium,
      todayKey,
    );

    if (action === 'dismiss') {
      state = markOfferDismissed(markOfferShown(state, todayKey));
      await persistShieldState(userId, state);
      return NextResponse.json({
        shields: buildShieldView({ state, config, isPremium, todayKey }),
      });
    }

    if (!config.isActive) {
      return NextResponse.json(
        { error: 'Shields are off right now' },
        { status: 400 },
      );
    }

    const cap = shieldCapFor(config, isPremium);
    if (state.count + quantity > cap) {
      return NextResponse.json(
        { error: `You can only hold ${cap} shield${cap === 1 ? '' : 's'}` },
        { status: 409 },
      );
    }

    const price =
      quantity === 2 ? config.twoPackPriceFlies : config.priceFlies;
    const balance = Math.max(0, Number(user.wardrobe?.flies) || 0);
    if (balance < price) {
      return NextResponse.json({ error: 'Not enough flies' }, { status: 400 });
    }

    (user as any).wardrobe.flies = balance - price;
    user.markModified('wardrobe');
    state = markOfferPurchased(
      grantShields(state, config, isPremium, quantity),
      todayKey,
    );
    (user as any).set('quests.shields', state);
    if ((user as any).quests?.loginStreak) {
      (user as any).set('quests.loginStreak.freezes', 0);
    }
    if ((user as any).quests?.pactStreak) {
      (user as any).set('quests.pactStreak.shields', 0);
    }
    user.markModified('quests');
    await user.save();

    await recordAnalyticsEvent({
      userId,
      name: 'fly_spent',
      properties: {
        source: 'shield',
        fly_amount: price,
        quantity,
        is_premium: isPremium,
      },
    });

    return NextResponse.json({
      shields: buildShieldView({ state, config, isPremium, todayKey }),
      flyBalance: Math.max(0, Number((user as any).wardrobe?.flies) || 0),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Could not get a shield',
      },
      { status: 400 },
    );
  }
}
