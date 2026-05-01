export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import UserModel from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';

export async function POST() {
  let uid: string;
  try {
    uid = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();
    await UserModel.updateOne({ _id: uid }, { $set: { onboardingCompleted: true } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save onboarding' }, { status: 500 });
  }
}
