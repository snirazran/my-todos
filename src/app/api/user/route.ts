export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId, requireAuth } from '@/lib/auth';
import UserModel, { type UserDoc } from '@/lib/models/User';
import TaskModel from '@/lib/models/Task';
import QuestModel from '@/lib/models/Quest';
import ReferralModel from '@/lib/models/Referral';
import { getAdminAuth } from '@/lib/firebaseAdmin';
import connectMongo from '@/lib/mongoose';
import { MAX_HUNGER_MS, TASK_HUNGER_REWARD_MS } from '@/lib/hungerLogic';
import { getZonedToday } from '@/lib/utils';
import { v4 as uuid } from 'uuid';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import FlyPurchaseModel from '@/lib/models/FlyPurchase';

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
      .select('createdAt premiumUntil calendarSyncEnabled calendarAccessToken name frogName birthday onboardingCompleted')
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
      name: user.name ?? null,
      frogName: user.frogName ?? null,
      birthday: user.birthday ?? null,
      onboardingCompleted: user.onboardingCompleted ?? null,
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
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const tz = typeof body?.timezone === 'string' ? body.timezone : 'UTC';
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
      plusIntroEligible: true,
      wardrobe: {
        equipped: {},
        inventory: {},
        flies: 0,
        hunger: MAX_HUNGER_MS - 2 * TASK_HUNGER_REWARD_MS,
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

    try {
      await TaskModel.create({
        userId: uid,
        type: 'regular',
        id: uuid(),
        text: 'Grab your first fly',
        order: 0,
        date: getZonedToday(tz),
        completed: false,
        isStarter: true,
        createdAt: now,
        updatedAt: now,
      });
    } catch (seedError) {
      console.error('Error seeding starter task:', seedError);
    }

    await recordAnalyticsEvent({
      userId: uid,
      name: 'account_created',
      properties: { method: isAnonymous ? 'guest' : email ? 'email_or_social' : 'phone' },
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
    const { calendarSyncEnabled, calendarAccessToken, name, frogName, birthday } = body;

    const updates: any = {};
    if (typeof calendarSyncEnabled === 'boolean') {
      updates.calendarSyncEnabled = calendarSyncEnabled;
    }
    if (calendarAccessToken !== undefined) {
      updates.calendarAccessToken = calendarAccessToken;
    }
    if (typeof name === 'string') {
      const trimmed = name.trim().slice(0, 40);
      if (trimmed) updates.name = trimmed;
    }
    if (typeof frogName === 'string') {
      const trimmed = frogName.trim().slice(0, 24);
      if (trimmed) updates.frogName = trimmed;
    }
    if (typeof birthday === 'string') {
      const trimmed = birthday.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || /^\d{2}-\d{2}$/.test(trimmed)) {
        updates.birthday = trimmed;
      }
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

export async function DELETE(req: NextRequest) {
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

    const linkedAnonymousIds = await AnalyticsEventModel.distinct('anonymousId', {
      userId: uid,
      anonymousId: { $exists: true },
    });

    await Promise.all([
      TaskModel.deleteMany({ userId: uid }),
      QuestModel.deleteMany({ userId: uid }),
      ReferralModel.deleteMany({ inviterId: uid }),
      ReferralModel.updateMany({ claimedByUserId: uid }, { $set: { claimedByUserId: null } }),
      AnalyticsEventModel.deleteMany({
        $or: [
          { userId: uid },
          ...(linkedAnonymousIds.length ? [{ anonymousId: { $in: linkedAnonymousIds } }] : []),
        ],
      }),
      FlyPurchaseModel.deleteMany({ userId: uid }),
    ]);

    await UserModel.deleteOne({ _id: uid });

    try {
      await getAdminAuth().deleteUser(uid);
    } catch (err) {
      console.warn('Failed to delete firebase auth user', err);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting user account:', error);
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Failed to delete account' }
        : {
            error: 'Failed to delete account',
            details: error instanceof Error ? error.message : 'Unknown delete error',
          },
      { status: 500 },
    );
  }
}
