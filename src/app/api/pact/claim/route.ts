export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { claimPactReward } from '@/lib/pact/rewards';
import { getPactView } from '@/lib/pact/engine';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

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
    const rewardSummary = await claimPactReward({ userId, timezone });
    await recordAnalyticsEvent({
      userId,
      name: 'pact_claimed',
      properties: {
        flies: rewardSummary.fliesGranted,
        streak_tier: rewardSummary.streakTierHit,
        mastery_tier: rewardSummary.masteryTierHit,
      },
    });
    const view = await getPactView({ userId, timezone });
    return NextResponse.json({ ok: true, rewardSummary, view });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not claim' },
      { status: 400 },
    );
  }
}
