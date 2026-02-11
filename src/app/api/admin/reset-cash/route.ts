import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function POST() {
  try {
    const userId = await requireUserId();
    await dbConnect();

    // Find user and reset flies to 0
    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          'wardrobe.flies': 0,
          'wardrobe.stolenFlies': 0,
        },
      },
      { new: true },
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Cash reset successfully',
      flies: 0,
    });
  } catch (error) {
    console.error('Error resetting cash:', error);
    return NextResponse.json(
      { error: 'Failed to reset cash' },
      { status: 500 },
    );
  }
}
