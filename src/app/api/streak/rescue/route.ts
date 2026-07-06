import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { performRescue } from '@/lib/streak/loginStreak';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    const rescueId = String(body.rescueId ?? '');
    if (!rescueId) {
      return NextResponse.json({ error: 'Missing rescueId' }, { status: 400 });
    }

    await connectMongo();
    const result = await performRescue({ userId, timezone, rescueId });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Streak rescue failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Rescue failed' },
      { status: 400 },
    );
  }
}
