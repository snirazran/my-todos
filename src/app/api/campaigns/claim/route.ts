import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import CampaignModel from '@/lib/models/Campaign';
import CampaignUserStateModel from '@/lib/models/CampaignUserState';
import UserModel from '@/lib/models/User';
import { buildAudience } from '@/lib/campaigns/audience';
import { evaluateCampaign } from '@/lib/campaigns/eligibility';
import { logFlyGrant } from '@/lib/economy/ledger';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import type { CampaignReward, CampaignRewardGrant } from '@/lib/campaigns/types';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const dayKey = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Reads the reward off the campaign the server itself loaded, never off the
 * request. The client says *which button* was pressed; what that button is
 * worth is not the client's to state.
 */
function rewardFor(
  campaign: { canvas?: { elements?: { id: string; action?: string; reward?: CampaignReward }[] }; cta?: { action?: string; reward?: CampaignReward } },
  elementId: string,
): CampaignReward | null {
  if (elementId) {
    const element = campaign.canvas?.elements?.find((item) => item.id === elementId);
    if (!element || element.action !== 'claim_reward') return null;
    return element.reward ?? null;
  }
  if (campaign.cta?.action !== 'claim_reward') return null;
  return campaign.cta.reward ?? null;
}

type GrantSummary = { kind: string; id?: string; amount: number };

/** Turns the campaign's grants into one Mongo update on the user document. */
function buildUserUpdate(grants: CampaignRewardGrant[], premiumUntil: Date | null) {
  const inc: Record<string, number> = {};
  const set: Record<string, unknown> = {};
  const addToSet: Record<string, unknown> = {};
  const summary: GrantSummary[] = [];
  let flies = 0;

  for (const grant of grants) {
    const amount = Math.floor(grant.amount);
    if (amount <= 0) continue;

    if (grant.kind === 'flies') {
      flies += amount;
      inc['wardrobe.flies'] = (inc['wardrobe.flies'] ?? 0) + amount;
      summary.push({ kind: 'flies', amount });
      continue;
    }

    if (grant.kind === 'plus_days') {
      // Days stack onto whatever is left, so a gift to an existing member
      // extends rather than truncates.
      const base =
        premiumUntil && premiumUntil > new Date() ? premiumUntil.getTime() : Date.now();
      premiumUntil = new Date(base + amount * 86_400_000);
      set.premiumUntil = premiumUntil;
      summary.push({ kind: 'plus_days', amount });
      continue;
    }

    const id = (grant.id ?? '').trim();
    if (!id || !/^[\w-]+$/.test(id)) continue;

    if (grant.kind === 'background') {
      inc[`wardrobe.backgrounds.inventory.${id}`] =
        (inc[`wardrobe.backgrounds.inventory.${id}`] ?? 0) + amount;
      summary.push({ kind: 'background', id, amount });
      continue;
    }

    inc[`wardrobe.inventory.${id}`] = (inc[`wardrobe.inventory.${id}`] ?? 0) + amount;
    addToSet['wardrobe.unseenItems'] = { $each: [id] };
    summary.push({ kind: 'item', id, amount });
  }

  return { inc, set, addToSet, summary, flies };
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

    const user = await UserModel.findById(userId).select('premiumUntil').lean();
    const { inc, set, addToSet, summary, flies } = buildUserUpdate(
      reward.grants,
      user?.premiumUntil ? new Date(user.premiumUntil) : null,
    );

    if (!summary.length) {
      await CampaignUserStateModel.updateOne(
        { userId, campaignId },
        { $unset: { [`claims.${claimKey}`]: '' } },
      );
      return json({ error: 'Nothing to grant' }, 400);
    }

    try {
      await UserModel.updateOne(
        { _id: userId },
        {
          ...(Object.keys(inc).length ? { $inc: inc } : {}),
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(addToSet).length ? { $addToSet: addToSet } : {}),
        },
      );
    } catch (error) {
      await CampaignUserStateModel.updateOne(
        { userId, campaignId },
        { $unset: { [`claims.${claimKey}`]: '' } },
      );
      throw error;
    }

    if (flies > 0) {
      void logFlyGrant({
        userId,
        source: 'campaign',
        occurrenceKey: `${campaignId}:${claimKey}`,
        dayKey: dayKey(now),
        amount: flies,
        meta: { campaignId, elementId: elementId || null },
      });
    }

    void recordAnalyticsEvent({
      name: 'campaign_reward_claimed',
      userId,
      properties: { campaignId, elementId: elementId || null, grants: summary },
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
