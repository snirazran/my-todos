import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function POST(request: Request) {
  try {
    const { uid } = await requireAuth();

    const body = await request.json();
    const amount = body.amount || 100000;

    await dbConnect();

    // Use findById since _id is now the string UID
    const user = await UserModel.findById(uid).select('wardrobe.flies');

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentAmount = user.wardrobe?.flies || 0;
    const newFlies = currentAmount + amount;

    await UserModel.findByIdAndUpdate(
      uid,
      { $set: { 'wardrobe.flies': newFlies } },
      { new: true },
    );

    return NextResponse.json({
      success: true,
      message: `Added ${amount} flies successfully`,
      flies: newFlies,
    });
  } catch (error) {
    console.error('Error adding flies:', error);
    return NextResponse.json({ error: 'Failed to add flies' }, { status: 500 });
  }
}
