import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { claimMilestoneStep } from '@/lib/quests/milestonesServer';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const trackId = typeof body?.trackId === 'string' ? body.trackId.trim() : '';
    if (!trackId) {
      return NextResponse.json({ error: 'Missing milestone' }, { status: 400 });
    }

    const timezone =
      typeof body?.timezone === 'string' && body.timezone ? body.timezone : 'UTC';
    const result = await claimMilestoneStep({ userId, trackId, timezone });
    const { summary } = result;

    await recordAnalyticsEvent({
      userId,
      name: 'milestone_claimed',
      properties: {
        milestone_id: result.track.id,
        objective_metric: result.track.metric,
        quest_tier: result.level,
        objective_target: result.step.target,
        fly_amount: summary.fliesGranted,
        item_count: summary.grantedItemIds.length + summary.grantedBackgroundIds.length,
        is_premium: result.isPremium,
      },
    });
    if (summary.fliesGranted > 0) {
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'milestone',
          fly_amount: summary.fliesGranted,
          is_premium: result.isPremium,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      rewardSummary: summary,
      next: result.nextRow,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Claim failed' },
      { status: 400 },
    );
  }
}
