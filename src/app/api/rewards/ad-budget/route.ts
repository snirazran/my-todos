export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { isPremiumActive } from '@/lib/skins/dailyDeal';
import {
  AD_PLACEMENTS,
  readAdBudget,
  type AdPlacement,
} from '@/lib/rewards/adBudget';

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { placement?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const placement = String(body.placement ?? '') as AdPlacement;
  if (!AD_PLACEMENTS.includes(placement)) {
    return NextResponse.json({ error: 'Unknown placement' }, { status: 400 });
  }

  try {
    await connectMongo();
    const user = await UserModel.findById(userId).select('premiumUntil').lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const premium = isPremiumActive(user.premiumUntil);
    const budget = await readAdBudget({ userId, placement, premium });

    const reason = premium
      ? 'premium'
      : budget.placementRemaining <= 0
        ? 'placement_cap'
        : budget.remaining <= 0
          ? 'daily_cap'
          : budget.cooldownLeft > 0
            ? 'cooldown'
            : null;

    return NextResponse.json(
      { ok: reason === null, reason, cooldownLeft: budget.cooldownLeft },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('Ad budget check failed:', err);
    return NextResponse.json({ error: 'Check failed' }, { status: 500 });
  }
}
