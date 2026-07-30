import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import User from '@/lib/models/User';
import CampaignModel from '@/lib/models/Campaign';
import CampaignUserStateModel from '@/lib/models/CampaignUserState';
import { buildAudience } from '@/lib/campaigns/audience';
import { evaluateCampaign } from '@/lib/campaigns/eligibility';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/**
 * "Would this actually show, and if not, why?" — run every campaign against a
 * real account so a targeting mistake is caught in the editor instead of in
 * three weeks of silent zero impressions.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const params = req.nextUrl.searchParams;
    const email = params.get('email')?.trim().toLowerCase();
    const platform = params.get('platform') || 'web';

    await connectMongo();
    const user = email
      ? await User.findOne({ email }).select('_id email').lean()
      : await User.findById(admin.uid).select('_id email').lean();
    if (!user) return json({ error: 'No user found for that email' }, 404);

    const userId = String(user._id);
    const [campaigns, states, audience] = await Promise.all([
      CampaignModel.find({}).sort({ createdAt: -1 }).lean(),
      CampaignUserStateModel.find({ userId }).lean(),
      buildAudience(userId, platform),
    ]);

    const stateById = new Map(states.map((s) => [s.campaignId, s]));
    const results = campaigns.map((campaign) => {
      const verdict = evaluateCampaign(campaign, audience, stateById.get(campaign.id));
      const state = stateById.get(campaign.id);
      return {
        id: campaign.id,
        name: campaign.name,
        eligible: verdict.eligible,
        reason: verdict.reason,
        impressions: state?.impressions ?? 0,
        dismissals: state?.dismissals ?? 0,
        converted: !!state?.converted,
      };
    });

    return json({ audience: { ...audience, email: user.email ?? null }, results });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
