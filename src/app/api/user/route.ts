import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function GET(req: NextRequest) {
  try {
    const { uid } = await requireAuth();
    await connectMongo();
    // findById with string ID works fine with _id:String schema
    const user = await UserModel.findById(uid)
      .select('createdAt premiumUntil')
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
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    // If auth fails, requireAuth throws. We catch it here.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { uid, email, name } = await requireAuth();
    await connectMongo();

    // Check if user exists
    const existingUser = await UserModel.findById(uid).lean();

    if (existingUser) {
      // User exists, maybe update email/name?
      return NextResponse.json({ ok: true, user: existingUser });
    }

    // Create new user
    console.log(`Creating new user for ${email} (${uid})`);
    const now = new Date();

    const newUser = await UserModel.create({
      _id: uid, // Use Firebase UID as _id
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
