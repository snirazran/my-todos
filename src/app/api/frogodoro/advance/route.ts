export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { advanceUserTimer } from '@/lib/frogodoroTimerProcessor';

export async function POST() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectMongo();
  const timer = await advanceUserTimer(userId);
  const user = await UserModel.findById(userId, { frogodoroSeq: 1 }).lean();
  const seq = (user as { frogodoroSeq?: number } | null)?.frogodoroSeq ?? 0;
  return NextResponse.json({ timer, serverNow: Date.now(), seq });
}
