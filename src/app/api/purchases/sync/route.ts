import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { syncPremiumFromRevenueCat } from '@/lib/revenuecat';

export async function POST() {
  try {
    const userId = await requireUserId();
    const premiumUntil = await syncPremiumFromRevenueCat(userId);
    return NextResponse.json({
      premiumUntil,
      isPremium: !!premiumUntil && premiumUntil > new Date(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.startsWith('Unauthenticated')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error('Premium sync failed:', error);
    return NextResponse.json({ error: 'Premium sync failed' }, { status: 500 });
  }
}
