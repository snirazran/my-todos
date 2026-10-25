import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import CampaignModel from '@/lib/models/Campaign';
import CampaignUserStateModel from '@/lib/models/CampaignUserState';
import { buildAudience } from '@/lib/campaigns/audience';
import { evaluateCampaign, toCampaignPayload } from '@/lib/campaigns/eligibility';
import { campaignProductRefs } from '@/lib/campaigns/tokens';
import StoreProductModel from '@/lib/models/StoreProduct';
import type { CampaignProductInfo } from '@/lib/campaigns/types';

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
      .map((campaign) => toCampaignPayload(campaign, stateById.get(campaign.id)));

    const refsByCampaign = eligible.map((campaign) => campaignProductRefs(campaign).charged);
    const allRefs = refsByCampaign.reduce<string[]>(
      (all, refs) => all.concat(refs.filter((ref) => !all.includes(ref))),
      [],
    );
    if (allRefs.length) {
      const discounted = await StoreProductModel.find({
        productId: { $in: allRefs },
        $or: [{ appleOfferId: { $nin: ['', null] } }, { googleOfferId: { $nin: ['', null] } }],
      })
        .select('productId appleOfferId googleOfferId')
        .lean<{ productId: string; appleOfferId?: string; googleOfferId?: string }[]>();
      eligible.forEach((campaign, index) => {
        const products: Record<string, CampaignProductInfo> = {};
        discounted
          .filter((product) => refsByCampaign[index].includes(product.productId))
          .forEach((product) => {
            products[product.productId] = {
              appleOfferId: product.appleOfferId || undefined,
              googleOfferId: product.googleOfferId || undefined,
            };
          });
        if (Object.keys(products).length) campaign.products = products;
      });
    }

    return NextResponse.json({
      campaigns: eligible,
      viewer: { frogName: audience.frogName, flies: audience.balance },
    });
  } catch {
    return NextResponse.json({ campaigns: [], viewer: null });
  }
}
