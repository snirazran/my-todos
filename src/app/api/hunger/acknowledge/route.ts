import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    await connectMongo();

    await UserModel.updateOne(
      { _id: userId },
      { $set: { 'wardrobe.stolenFlies': 0 } },
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
