import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { performCheckIn } from '@/lib/streak/loginStreak';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';

    await connectMongo();
    const result = await performCheckIn({ userId, timezone });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Streak check-in failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Check-in failed' },
      { status: 400 },
    );
  }
}
