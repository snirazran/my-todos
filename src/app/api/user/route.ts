export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId, requireAuth } from '@/lib/auth';
import UserModel, { type UserDoc } from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';

export async function GET(req: NextRequest) {
  try {
    const uid = await requireUserId();
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const decoded = await requireAuth();
    const { uid, email, name } = decoded;
    await connectMongo();

    const existingUser = await UserModel.findById(uid).lean();
    if (existingUser) {
      return NextResponse.json({ ok: true, user: existingUser });
    }

    const now = new Date();
    const newUser = await UserModel.create({
      _id: uid,
      email: email || '',
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
    });

    return NextResponse.json({ ok: true, user: newUser });
  } catch (error) {
    console.error('Error syncing user:', error);
    return NextResponse.json(
      { error: 'Unauthorized or Internal Error' },
      { status: 401 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const uid = await requireUserId();
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
