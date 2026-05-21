import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import ReferralModel from '@/lib/models/Referral';

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    const claimedCount = await ReferralModel.countDocuments({
      inviterId: userId,
      claimedByUserId: { $ne: null },
    });
    const pendingCount = await ReferralModel.countDocuments({
      inviterId: userId,
      claimedByUserId: null,
    });
    return NextResponse.json({ claimedCount, pendingCount });
  } catch {
    return NextResponse.json({ claimedCount: 0, pendingCount: 0 });
  }
}
