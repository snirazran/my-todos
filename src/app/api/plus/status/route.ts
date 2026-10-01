export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import {
  refreshPlusSnapshot,
  type PlusSubscriptionSnapshot,
} from '@/lib/revenuecat';

type LeanUser = {
  premiumUntil?: Date | null;
  plusSubscription?: PlusSubscriptionSnapshot | null;
};

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await refreshPlusSnapshot(userId);
  } catch (err) {
    console.error('Plus status refresh failed:', err);
  }

  await connectMongo();
  const user = await UserModel.findById(userId)
    .select('premiumUntil plusSubscription')
    .lean<LeanUser | null>();
  const premiumUntil = user?.premiumUntil ? new Date(user.premiumUntil) : null;
  const snapshot = user?.plusSubscription ?? null;
  const storeUntil = snapshot?.expiresAt ? new Date(snapshot.expiresAt) : null;
  const isPremium =
    (!!premiumUntil && premiumUntil > new Date()) ||
    (!!storeUntil && storeUntil > new Date());
  const fromStore =
    !!snapshot &&
    snapshot.store !== 'promotional' &&
    !!snapshot.expiresAt &&
    new Date(snapshot.expiresAt).getTime() > Date.now();

  return NextResponse.json(
    {
      isPremium,
      premiumUntil: premiumUntil?.toISOString() ?? null,
      source: !isPremium ? null : fromStore ? 'subscription' : 'gift',
      subscription: fromStore && snapshot
        ? {
            plan: snapshot.plan,
            store: snapshot.store,
            periodType: snapshot.periodType,
            expiresAt: snapshot.expiresAt,
            startedAt: snapshot.startedAt,
            willRenew: snapshot.willRenew,
            billingIssue: snapshot.billingIssue,
            managementUrl: snapshot.managementUrl,
            productId: snapshot.productId,
          }
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
