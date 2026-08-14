import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getPactView } from '@/lib/pact/engine';

/**
 * Marks last week's outcome as seen. Kept server-side rather than in local
 * storage because the moment it reports — a streak broken, a shield spent —
 * must be shown exactly once per user, not once per device.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const timezone = body.timezone || 'UTC';

    await connectMongo();
    await UserModel.updateOne(
      { _id: userId },
      { $set: { 'quests.pactStreak.pendingResult': null } },
    );

    const view = await getPactView({ userId, timezone });
    return NextResponse.json({ ok: true, view });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not dismiss result',
      },
      { status: 400 },
    );
  }
}
