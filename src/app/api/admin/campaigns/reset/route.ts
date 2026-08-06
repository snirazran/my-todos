import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import User from '@/lib/models/User';
import CampaignUserStateModel from '@/lib/models/CampaignUserState';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/**
 * Clears one account's history with a campaign so it can be seen again.
 * Without it a campaign is testable exactly once per admin, which is how
 * targeting bugs reach production.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      campaignId?: string;
      email?: string;
    };
    const campaignId = body.campaignId?.trim();
    if (!campaignId) return json({ error: 'Missing campaign id' }, 400);

    await connectMongo();
    const email = body.email?.trim().toLowerCase();
    const user = email
      ? await User.findOne({ email }).select('_id').lean()
      : await User.findById(admin.uid).select('_id').lean();
    if (!user) return json({ error: 'No user found for that email' }, 404);

    const result = await CampaignUserStateModel.deleteOne({
      userId: String(user._id),
      campaignId,
    });
    return json({ ok: true, cleared: result.deletedCount ?? 0 });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
