import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();
    const user = await UserModel.findById(session.user.id).select('createdAt premiumUntil').lean();
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date();
    const isPremium = user.premiumUntil ? new Date(user.premiumUntil) > now : false;

    return NextResponse.json({
      createdAt: user.createdAt.toISOString(),
      premiumUntil: user.premiumUntil,
      isPremium,
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
