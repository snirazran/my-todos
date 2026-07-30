import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import CampaignModel from '@/lib/models/Campaign';
import CampaignUserStateModel from '@/lib/models/CampaignUserState';
import { buildAudience } from '@/lib/campaigns/audience';
import { evaluateCampaign, toCampaignPayload } from '@/lib/campaigns/eligibility';

export const dynamic = 'force-dynamic';

/** Everything this user is allowed to see right now. The client then decides
 *  which one (if any) a given moment deserves. */
export async function GET(req: NextRequest) {
  try {
    const decoded = await requireAuth();
    const userId = decoded.uid;
    const platform =
      req.nextUrl.searchParams.get('platform') ??
      req.headers.get('x-frogress-platform');

    await connectMongo();
    const [campaigns, states, audience] = await Promise.all([
      CampaignModel.find({ status: { $in: ['live', 'test'] } })
        .sort({ createdAt: 1 })
        .lean(),
      CampaignUserStateModel.find({ userId }).lean(),
      buildAudience(userId, platform),
    ]);

    const stateById = new Map(states.map((s) => [s.campaignId, s]));
    const now = new Date();
    const eligible = campaigns
      .filter(
        (campaign) =>
          evaluateCampaign(campaign, audience, stateById.get(campaign.id), now).eligible,
      )
      .map(toCampaignPayload);

    return NextResponse.json({ campaigns: eligible });
  } catch {
    return NextResponse.json({ campaigns: [] });
  }
}
