import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import CampaignModel from '@/lib/models/Campaign';
import CampaignUserStateModel from '@/lib/models/CampaignUserState';
import { buildAudience } from '@/lib/campaigns/audience';
import { evaluateCampaign } from '@/lib/campaigns/eligibility';
import { applyGrants, type GrantSummary } from '@/lib/campaigns/grants';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { riveButtonElementId, type CampaignReward } from '@/lib/campaigns/types';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const dayKey = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Reads the reward off the campaign the server itself loaded, never off the
 * request. The client says *which button* was pressed; what that button is
 * worth is not the client's to state.
 */
type RewardCampaign = {
  canvas?: { elements?: { id: string; action?: string; reward?: CampaignReward }[] };
  cta?: { action?: string; reward?: CampaignReward };
  rive?: { buttons?: { signal: string; action?: string; reward?: CampaignReward }[] };
};

function rewardFor(campaign: RewardCampaign, elementId: string): CampaignReward | null {
  if (elementId.startsWith('rive-')) {
    const button = campaign.rive?.buttons?.find(
      (item) => riveButtonElementId(item.signal) === elementId,
    );
    if (!button) return null;
    if (button.action === 'claim_reward') return button.reward ?? null;
    if (button.action === 'cta' && campaign.cta?.action === 'claim_reward') {
      return campaign.cta.reward ?? null;
    }
    return null;
  }
  if (elementId) {
    const element = campaign.canvas?.elements?.find((item) => item.id === elementId);
    if (!element || element.action !== 'claim_reward') return null;
    return element.reward ?? null;
  }
  if (campaign.cta?.action !== 'claim_reward') return null;
  return campaign.cta.reward ?? null;
}

/**
 * Hands a user what a campaign button promised.
 *
 * Mongo here is a standalone server with no transactions, so the claim record
 * is the lock: it is written with a filter that fails if the key already
 * exists, and only a write that actually landed goes on to grant anything. A
 * grant that then fails rolls the key back so the user can try again, which is
 * the safe direction to fail in — a retryable miss beats a silent double-grant.
 */
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    const decoded = await requireAuth();
    userId = decoded.uid;
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      campaignId?: string;
      elementId?: string;
    };
    const campaignId = (body.campaignId ?? '').trim().slice(0, 64);
    const elementId = (body.elementId ?? '').trim().slice(0, 40);
    if (!campaignId) return json({ error: 'Missing campaign' }, 400);
    if (elementId && !/^[\w-]+$/.test(elementId)) {
      return json({ error: 'Bad element' }, 400);
    }

    await connectMongo();
    const campaign = await CampaignModel.findOne({ id: campaignId }).lean();
    if (!campaign) return json({ error: 'Campaign not found' }, 404);

    // A paused or expired campaign must not still be handing out rewards to
    // someone holding a stale payload from earlier in their session.
    const [state, audience] = await Promise.all([
      CampaignUserStateModel.findOne({ userId, campaignId }).lean(),
      buildAudience(userId, req.headers.get('x-frogress-platform')),
    ]);
    const now = new Date();
    // Frequency caps are deliberately not part of this check: the reward's own
    // claim limit governs it, and an impression cap reached after the popup was
    // shown must not strand a user holding an unclaimed button.
    const verdict = evaluateCampaign(campaign, audience, undefined, now);
    if (!verdict.eligible) return json({ error: verdict.reason }, 403);

    const reward = rewardFor(campaign, elementId);
    if (!reward || !reward.grants.length) {
      return json({ error: 'That button does not grant anything' }, 400);
    }

    const claimKey = `${elementId || 'cta'}${reward.limit === 'daily' ? `_${dayKey(now)}` : ''}`;
    if (state?.claims?.[claimKey]) {
      return json({ ok: true, alreadyClaimed: true, granted: [] });
    }

    const claimed = await CampaignUserStateModel.updateOne(
      { userId, campaignId, [`claims.${claimKey}`]: { $exists: false } },
      {
        $set: { [`claims.${claimKey}`]: now },
        $setOnInsert: { userId, campaignId },
      },
      { upsert: true },
    ).catch((error: { code?: number }) => {
      // A duplicate key means another request inserted the row first, which is
      // the concurrent-claim case and must not grant twice.
      if (error?.code === 11000) return null;
      throw error;
    });

    if (!claimed || (claimed.modifiedCount === 0 && claimed.upsertedCount === 0)) {
      return json({ ok: true, alreadyClaimed: true, granted: [] });
    }

    const releaseClaim = () =>
      CampaignUserStateModel.updateOne(
        { userId, campaignId },
        { $unset: { [`claims.${claimKey}`]: '' } },
      );

    let summary: GrantSummary[];
    try {
      ({ summary } = await applyGrants(userId, reward.grants, {
        source: 'campaign',
        occurrenceKey: `${campaignId}:${claimKey}`,
        dayKey: dayKey(now),
        meta: { campaignId, elementId: elementId || null },
      }));
    } catch (error) {
      await releaseClaim();
      throw error;
    }

    if (!summary.length) {
      await releaseClaim();
      return json({ error: 'Nothing to grant' }, 400);
    }

    void recordAnalyticsEvent({
      name: 'campaign_reward_claimed',
      userId,
      properties: { campaign_id: campaignId, element_id: elementId || null },
    });

    return json({
      ok: true,
      granted: summary,
      message: reward.successText || '',
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Claim failed' },
      500,
    );
  }
}
