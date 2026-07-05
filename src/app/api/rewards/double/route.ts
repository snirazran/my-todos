export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import {
  DOUBLE_CLAIM_WINDOW_MS,
  type AdDoubleClaim,
} from '@/lib/rewards/adDouble';

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

    if (!user.wardrobe) {
      user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
    }
    user.wardrobe.inventory = user.wardrobe.inventory ?? {};
    user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];
    user.wardrobe.flies = user.wardrobe.flies ?? 0;
    if (!user.wardrobe.backgrounds) {
      user.wardrobe.backgrounds = { equipped: null, inventory: {} };
    }
    user.wardrobe.backgrounds.inventory =
      user.wardrobe.backgrounds.inventory ?? {};

    if (claim.fliesGranted > 0) {
      user.wardrobe.flies += claim.fliesGranted;
    }
    for (const itemId of claim.grantedItemIds ?? []) {
      user.wardrobe.inventory[itemId] =
        (user.wardrobe.inventory[itemId] ?? 0) + 1;
      user.wardrobe.unseenItems.push(itemId);
    }
    for (const bgId of claim.grantedBackgroundIds ?? []) {
      user.wardrobe.backgrounds.inventory[bgId] =
        (user.wardrobe.backgrounds.inventory[bgId] ?? 0) + 1;
    }

    (user as any).adDoubleClaim = { ...claim, doubled: true };
    user.markModified('adDoubleClaim');
    user.markModified('wardrobe');
    await user.save();

    return NextResponse.json({
      granted: true,
      summary: {
        fliesGranted: claim.fliesGranted,
        grantedItemIds: claim.grantedItemIds ?? [],
        grantedBackgroundIds: claim.grantedBackgroundIds ?? [],
        flyBalanceAfter: user.wardrobe.flies,
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
