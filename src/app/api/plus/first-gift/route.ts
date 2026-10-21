export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { isPremiumActive } from '@/lib/skins/dailyDeal';

export async function POST() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectMongo();
  const user = await UserModel.findOneAndUpdate(
    { _id: userId, 'seenIntros.firstGiftPaywall': false },
    { $set: { 'seenIntros.firstGiftPaywall': true } },
    { projection: { premiumUntil: 1 } },
  ).lean<{ premiumUntil?: Date | null }>();

  return NextResponse.json(
    { show: !!user && !isPremiumActive(user.premiumUntil) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
