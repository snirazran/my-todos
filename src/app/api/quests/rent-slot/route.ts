import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import {
  RENT_SLOT_ADS_REQUIRED,
  RENT_SLOT_DURATION_MS,
  activeRentedFocusCategoryId,
  isPremiumUser,
  normalizeFocusProfile,
  resolveActiveFocusCategoryId,
} from '@/lib/quests/engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { categoryId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const categoryId = String(body.categoryId ?? '');
  if (!categoryId) {
    return NextResponse.json({ error: 'Missing categoryId' }, { status: 400 });
  }

  try {
    await connectMongo();
    const user = await UserModel.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userObj = user.toObject();
    if (isPremiumUser(userObj)) {
      return NextResponse.json(
        { error: 'Premium already unlocks every focus quest' },
        { status: 400 },
      );
    }

    const profile = normalizeFocusProfile(userObj);
    if (!(profile.selectedCategoryIds ?? []).includes(categoryId)) {
      return NextResponse.json(
        { error: 'Category is not one of your focus areas' },
        { status: 400 },
      );
    }
    const activeId = resolveActiveFocusCategoryId(profile, false);
    if (categoryId === activeId) {
      return NextResponse.json(
        { error: 'This focus quest is already active' },
        { status: 400 },
      );
    }

    const now = new Date();
    const liveRentalId = activeRentedFocusCategoryId(profile, now);
    if (liveRentalId) {
      return NextResponse.json(
        { error: 'You already have a rented focus slot' },
        { status: 400 },
      );
    }

    const prev = profile.rentedFocus;
    const inProgress =
      prev && !prev.expiresAt && prev.categoryId === categoryId
        ? prev.adsWatched
        : 0;
    const adsWatched = inProgress + 1;
    const unlocked = adsWatched >= RENT_SLOT_ADS_REQUIRED;
    const expiresAt = unlocked
      ? new Date(now.getTime() + RENT_SLOT_DURATION_MS)
      : null;

    user.focusProfile = {
      ...profile,
      rentedFocus: { categoryId, adsWatched, expiresAt },
    };
    user.markModified('focusProfile');
    await user.save();

    return NextResponse.json({
      granted: true,
      unlocked,
      categoryId,
      adsWatched,
      adsRequired: RENT_SLOT_ADS_REQUIRED,
      expiresAt,
    });
  } catch (err) {
    console.error('Rent focus slot failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Rent failed' },
      { status: 500 },
    );
  }
}
