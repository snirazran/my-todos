import mongoose from 'mongoose';
import { NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import LeapWeekModel from '@/lib/models/LeapWeek';

export async function POST() {
  try {
    const userId = await requireAdminUserId();
    await connectMongo();
    const [deleted] = await Promise.all([
      LeapWeekModel.deleteMany({ userId }),
      mongoose.connection.db?.collection('pacts').deleteMany({ userId }),
      UserModel.updateOne(
        { _id: userId },
        { $unset: { 'quests.leap': 1, 'quests.pactStreak': 1 } },
      ),
    ]);
    return NextResponse.json({ ok: true, weeksDeleted: deleted.deletedCount ?? 0 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not reset Leap' },
      { status: 400 },
    );
  }
}
