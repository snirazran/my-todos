import { NextResponse } from 'next/server';
import { requireAdmin as requireAuth } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function POST() {
  try {
    const { uid } = await requireAuth();
    await connectMongo();

    await UserModel.updateOne(
      { _id: uid },
      { $set: { 'missedReview.lastShownDate': '' } },
    );

    return NextResponse.json({
      success: true,
      message: 'Missed review popup reset',
    });
  } catch (error) {
    console.error('Reset missed review error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
