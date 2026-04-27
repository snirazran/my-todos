import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import mongoose from 'mongoose';

export async function POST() {
  try {
    const userId = await requireUserId();
    await connectMongo();

    const user = await UserModel.findById(userId).select('_id').lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await mongoose.connection.db!.collection('users').updateOne(
      { _id: user._id },
      { $unset: { aiSuggestionCache: 1, aiSuggestionRefreshes: 1 } },
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to reset' }, { status: 500 });
  }
}
