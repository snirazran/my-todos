import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function POST() {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();
    const now = new Date();
    const claimed = await UserModel.findOneAndUpdate(
      {
        _id: uid,
        plusIntroEligible: true,
        $and: [
          {
            $or: [
              { plusIntroShownAt: { $exists: false } },
              { plusIntroShownAt: null },
            ],
          },
          {
            $or: [
              { premiumUntil: { $exists: false } },
              { premiumUntil: null },
              { premiumUntil: { $lte: now } },
            ],
          },
        ],
      },
      { $set: { plusIntroShownAt: now } },
      { projection: { _id: 1 }, new: false },
    ).lean();

    return NextResponse.json({ ok: true, show: !!claimed });
  } catch (error) {
    console.error('Failed to claim Plus intro:', error);
    return NextResponse.json(
      { error: 'Failed to claim Plus intro' },
      { status: 500 },
    );
  }
}
