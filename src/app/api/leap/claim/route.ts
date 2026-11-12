export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { claimLeapChestForUser } from '@/lib/leap/view';

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    await connectMongo();
    const result = await claimLeapChestForUser({ userId, timezone });
    if (!result) {
      return NextResponse.json({ error: 'Leap is off' }, { status: 400 });
    }
    if (!result.claim.free && !result.claim.plus) {
      return NextResponse.json(
        { error: 'No gift to open yet', view: result.view },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, claim: result.claim, view: result.view });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not open the gift' },
      { status: 500 },
    );
  }
}
