export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId, requireAuth } from '@/lib/auth';
import UserModel, { type UserDoc } from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';

export async function GET(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch (error) {
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Unauthorized' }
        : {
            error: 'Unauthorized',
            details: error instanceof Error ? error.message : 'Unknown auth error',
          },
      { status: 401 },
    );
  }

  try {
    await connectMongo();
    
    const user = await UserModel.findById(uid)
      .select('createdAt premiumUntil calendarSyncEnabled calendarAccessToken')
      .lean();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date();
    const isPremium = user.premiumUntil
      ? new Date(user.premiumUntil) > now
      : false;

    return NextResponse.json({
      createdAt: user.createdAt.toISOString(),
      premiumUntil: user.premiumUntil,
      isPremium,
      calendarSyncEnabled: user.calendarSyncEnabled || false,
      hasCalendarToken: !!user.calendarAccessToken,
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Failed to load user data' }
        : {
            error: 'Failed to load user data',
            details: error instanceof Error ? error.message : 'Unknown user error',
          },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  let decoded: Awaited<ReturnType<typeof requireAuth>>;
  try {
    decoded = await requireAuth();
  } catch (error) {
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Unauthorized' }
        : {
            error: 'Unauthorized',
            details: error instanceof Error ? error.message : 'Unknown auth error',
          },
      { status: 401 },
    );
  }

  try {
    const { uid, email, name, phone_number: phoneNumber, firebase } = decoded as any;
    const isAnonymous = firebase?.sign_in_provider === 'anonymous';
    await connectMongo();

    const existingUser = await UserModel.findById(uid).lean();
    if (existingUser) {
      const patch: Record<string, unknown> = {};
      if (email && !existingUser.email) patch.email = email;
      if (phoneNumber && !existingUser.phoneNumber) patch.phoneNumber = phoneNumber;
      if (!isAnonymous && existingUser.isGuest) patch.isGuest = false;
      if (Object.keys(patch).length) {
        await UserModel.updateOne({ _id: uid }, { $set: patch });
      }
      return NextResponse.json({ ok: true, isNewUser: false, user: { ...existingUser, ...patch } });
    }

    const now = new Date();
    const newUser = await UserModel.create({
      _id: uid,
      ...(email ? { email } : {}),
      ...(phoneNumber ? { phoneNumber } : {}),
      isGuest: isAnonymous,
      name: name || 'Anonymous Frog',
      createdAt: now,
      wardrobe: {
        equipped: {},
        inventory: {},
        flies: 0,
        hunger: 86400000,
        lastHungerUpdate: now,
        stolenFlies: 0,
      },
      statistics: {
        daily: {
          date: '',
          dailyTasksCount: 0,
          dailyMilestoneGifts: 0,
          completedTaskIds: [],
          taskCountAtLastGift: 0,
        },
      },
      focusProfile: {
        selectedCategoryIds: [],
        categoryTagMap: [],
        unlockedAnimationIds: [],
      },
    });

    return NextResponse.json({ ok: true, isNewUser: true, user: newUser });
  } catch (error) {
    console.error('Error syncing user:', error);
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Failed to sync user' }
        : {
            error: 'Failed to sync user',
            details: error instanceof Error ? error.message : 'Unknown user sync error',
          },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch (error) {
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Unauthorized' }
        : {
            error: 'Unauthorized',
            details: error instanceof Error ? error.message : 'Unknown auth error',
          },
      { status: 401 },
    );
  }

  try {
    await connectMongo();

    const body = await req.json();
    const { calendarSyncEnabled, calendarAccessToken } = body;

    const updates: any = {};
    if (typeof calendarSyncEnabled === 'boolean') {
      updates.calendarSyncEnabled = calendarSyncEnabled;
    }
    if (calendarAccessToken !== undefined) {
      updates.calendarAccessToken = calendarAccessToken;
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      uid,
      { $set: updates },
      { new: true },
    ).lean();

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, user: updatedUser });
  } catch (error) {
    console.error('Error updating user settings:', error);
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Failed to update user settings' }
        : {
            error: 'Failed to update user settings',
            details: error instanceof Error ? error.message : 'Unknown user update error',
          },
      { status: 500 },
    );
  }
}
