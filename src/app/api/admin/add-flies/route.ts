import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const amount = body.amount || 100000;

    await dbConnect();

    // Find user and add flies
    const user = await UserModel.findOne({ email: session.user.email });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentFlies = user.wardrobe?.flies || 0;
    const newFlies = currentFlies + amount;

    await UserModel.findOneAndUpdate(
      { email: session.user.email },
      { $set: { 'wardrobe.flies': newFlies } },
      { new: true }
    );

    return NextResponse.json({ 
      success: true, 
      message: `Added ${amount} flies successfully`,
      flies: newFlies
    });
  } catch (error) {
    console.error('Error adding flies:', error);
    return NextResponse.json(
      { error: 'Failed to add flies' },
      { status: 500 }
    );
  }
}
