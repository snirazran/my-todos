export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import AdRewardVerificationModel from '@/lib/models/AdRewardVerification';
import { verifyAdmobCallback } from '@/lib/rewards/admobSsv';

export async function GET(req: NextRequest) {
  const queryStart = req.url.indexOf('?');
  const rawQuery = queryStart >= 0 ? req.url.slice(queryStart + 1) : '';

  let params: URLSearchParams | null;
  try {
    params = await verifyAdmobCallback(rawQuery);
  } catch (err) {
    console.error('[admob-ssv] verification error', err);
    return NextResponse.json({ error: 'Verification unavailable' }, { status: 500 });
  }
  if (!params) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  const transactionId = params.get('transaction_id');
  const userId = params.get('user_id');
  if (!transactionId || !userId) {
    return NextResponse.json({ ok: true });
  }

  try {
    await connectMongo();
    await AdRewardVerificationModel.create({
      transactionId,
      userId,
      adUnit: params.get('ad_unit') ?? '',
      customData: params.get('custom_data') ?? undefined,
      rewardAmount: Number(params.get('reward_amount')) || undefined,
      verifiedAt: new Date(),
    });
  } catch (err) {
    if ((err as { code?: number })?.code !== 11000) {
      console.error('[admob-ssv] store failed', err);
      return NextResponse.json({ error: 'Store failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
