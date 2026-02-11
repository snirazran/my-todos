import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { action, days } = await req.json();

    await connectMongo();

    // For "add", we extend from now or current expiry
    // For "remove", we unset or set to past

    let update = {};

    if (action === 'remove') {
      update = { $unset: { premiumUntil: '' } };
    } else if (action === 'add' && typeof days === 'number') {
      const user = await UserModel.findById(userId).select('premiumUntil');
      const now = new Date();
      let baseDate = now;

      // If already premium and future, extend from there?
      // User asked: "let me decide for how long to give... pay for 1 month... get 7 days free"
      // Usually extending is nice.
      if (user?.premiumUntil && new Date(user.premiumUntil) > now) {
        baseDate = new Date(user.premiumUntil);
      }

      const newExpiry = new Date(
        baseDate.getTime() + days * 24 * 60 * 60 * 1000,
      );
      update = { $set: { premiumUntil: newExpiry } };
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const updatedUser = await UserModel.findByIdAndUpdate(userId, update, {
      new: true,
    }).select('premiumUntil');

    const isPremium = updatedUser?.premiumUntil
      ? new Date(updatedUser.premiumUntil) > new Date()
      : false;

    return NextResponse.json({
      success: true,
      premiumUntil: updatedUser?.premiumUntil,
      isPremium,
    });
  } catch (error) {
    console.error('Error updating premium status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
