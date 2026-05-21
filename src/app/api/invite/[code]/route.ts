import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import ReferralModel from '@/lib/models/Referral';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';
import UserModel from '@/lib/models/User';

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } },
) {
  try {
    await connectMongo();
    const referral = await ReferralModel.findOne({ code: params.code }).lean();
    if (!referral) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    const catalog = await getFullCatalog();
    const byId = buildById(catalog);
    const item = byId[referral.giftItemId] ?? null;

    const inviter = await UserModel.findById(referral.inviterId)
      .select('name frogName')
      .lean();

    return NextResponse.json({
      code: referral.code,
      claimed: !!referral.claimedByUserId,
      gift: item,
      inviter: inviter
        ? { name: inviter.name ?? null, frogName: inviter.frogName ?? null }
        : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}
