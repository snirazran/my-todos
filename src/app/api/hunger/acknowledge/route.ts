import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Types } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = new Types.ObjectId(session.user.id);
  await connectMongo();

  await UserModel.updateOne(
    { _id: userId },
    { $set: { 'wardrobe.stolenFlies': 0 } }
  );

  return NextResponse.json({ ok: true });
}
