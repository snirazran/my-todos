import { NextRequest, NextResponse } from 'next/server';
import { syncPremiumFromRevenueCat } from '@/lib/revenuecat';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import type { AnalyticsEventName, AnalyticsPlatform } from '@/lib/analytics/events';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import FlyPurchaseModel from '@/lib/models/FlyPurchase';
import { getFlyPackForProduct } from '@/lib/flyPacks';
import mongoose from 'mongoose';

function revenueCatEventName(event: any): AnalyticsEventName | null {
  if (Number(event?.price) < 0) return 'subscription_refunded';
  switch (event?.type) {
    case 'INITIAL_PURCHASE': return 'subscription_started';
    case 'RENEWAL': return 'subscription_renewed';
    case 'CANCELLATION': return 'subscription_cancelled';
    case 'EXPIRATION': return 'subscription_expired';
    case 'BILLING_ISSUE': return 'subscription_billing_issue';
    case 'PRODUCT_CHANGE': return 'subscription_product_changed';
    case 'NON_RENEWING_PURCHASE': return 'purchase_completed';
    default: return null;
  }
}

function revenueCatPlatform(store: unknown): AnalyticsPlatform {
  if (store === 'APP_STORE' || store === 'MAC_APP_STORE') return 'ios';
  if (store === 'PLAY_STORE' || store === 'AMAZON') return 'android';
  if (store === 'PADDLE' || store === 'RC_BILLING' || store === 'STRIPE') return 'web';
  return 'unknown';
}

async function grantFlyPackPurchase(userId: string, event: any) {
  if (event?.type !== 'NON_RENEWING_PURCHASE') return null;
  const pack = getFlyPackForProduct(String(event?.product_id ?? ''));
  if (!pack || typeof event?.id !== 'string') return null;

  await connectMongo();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const existing = await FlyPurchaseModel.exists({ eventId: event.id }).session(session);
      if (existing) return;
      const grant = await UserModel.updateOne(
        { _id: userId },
        { $inc: { 'wardrobe.flies': pack.amount } },
        { session },
      );
      if (grant.modifiedCount !== 1) throw new Error('Fly-pack user not found');
      await FlyPurchaseModel.create(
        [{
          eventId: event.id,
          transactionId: typeof event?.transaction_id === 'string' ? event.transaction_id : undefined,
          userId,
          packId: pack.id,
          productId: String(event.product_id),
          flies: pack.amount,
          revenueUsd: Number.isFinite(Number(event?.price)) ? Number(event.price) : undefined,
          store: typeof event?.store === 'string' ? event.store : undefined,
          environment: typeof event?.environment === 'string' ? event.environment : undefined,
          purchasedAt: Number.isFinite(Number(event?.purchased_at_ms))
            ? new Date(Number(event.purchased_at_ms))
            : new Date(),
          grantedAt: new Date(),
        }],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return pack;
}

export async function POST(req: NextRequest) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) {
    console.error('REVENUECAT_WEBHOOK_AUTH is not set');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader !== expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let event: any;
  try {
    const body = await req.json();
    event = body?.event;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const appUserId: string | undefined = event?.app_user_id;
  const candidates = [
    appUserId,
    ...(Array.isArray(event?.aliases) ? event.aliases : []),
  ].filter(
    (id): id is string =>
      typeof id === 'string' && id.length > 0 && !id.startsWith('$RCAnonymousID:'),
  );
  const userId = candidates[0];
  if (!userId) {
    return NextResponse.json({ ok: true, skipped: 'anonymous user' });
  }

  try {
    await syncPremiumFromRevenueCat(userId);
    const flyPack = await grantFlyPackPurchase(userId, event);
    const name = flyPack ? 'fly_pack_purchase_completed' : revenueCatEventName(event);
    if (name) {
      const price = Number(event?.price);
      const tax = Number(event?.tax_percentage);
      const commission = Number(event?.commission_percentage);
      const proceeds = Number.isFinite(price)
        ? price * (1 - (Number.isFinite(tax) ? tax : 0)) * (1 - (Number.isFinite(commission) ? commission : 0))
        : undefined;
      await recordAnalyticsEvent({
        userId,
        name,
        source: 'revenuecat',
        platform: revenueCatPlatform(event?.store),
        externalId: typeof event?.id === 'string' ? `revenuecat:${event.id}:${name}` : undefined,
        occurredAt: Number.isFinite(Number(event?.event_timestamp_ms))
          ? new Date(Number(event.event_timestamp_ms))
          : new Date(),
        properties: {
          store: event?.store,
          environment: event?.environment,
          product_id: event?.product_id,
          period_type: event?.period_type,
          revenue_usd: Number.isFinite(price) ? price : undefined,
          proceeds_usd: proceeds,
          currency: event?.currency,
          country: event?.country_code,
          reason: event?.cancel_reason ?? event?.expiration_reason,
          is_trial_conversion: event?.is_trial_conversion,
          renewal_number: event?.renewal_number,
          pack_id: flyPack?.id,
          fly_amount: flyPack?.amount,
          price_usd: Number.isFinite(price) ? price : undefined,
        },
      });
      if (flyPack) {
        await recordAnalyticsEvent({
          userId,
          name: 'fly_earned',
          source: 'revenuecat',
          platform: revenueCatPlatform(event?.store),
          externalId: `revenuecat:${event.id}:fly_earned`,
          occurredAt: Number.isFinite(Number(event?.event_timestamp_ms))
            ? new Date(Number(event.event_timestamp_ms))
            : new Date(),
          properties: {
            source: 'real_money_pack',
            fly_amount: flyPack.amount,
            is_premium: false,
            pack_id: flyPack.id,
            environment: event?.environment,
          },
        });
      }
    }
  } catch (error) {
    console.error('RevenueCat webhook sync failed:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
