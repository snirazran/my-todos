import { NextRequest, NextResponse } from 'next/server';
import { syncPremiumFromRevenueCat } from '@/lib/revenuecat';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import type { AnalyticsEventName, AnalyticsPlatform } from '@/lib/analytics/events';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import FlyPurchaseModel from '@/lib/models/FlyPurchase';
import { FLY_PACKS, getFlyPackForProduct } from '@/lib/flyPacks';
import StoreProductModel, {
  storeProductGrants,
  type StoreProductDoc,
} from '@/lib/models/StoreProduct';
import { packagesForStoreProduct } from '@/lib/revenuecatCatalog';
import { packageRef } from '@/lib/campaigns/productRef';
import { applyGrants } from '@/lib/campaigns/grants';
import type { CampaignRewardGrant } from '@/lib/campaigns/types';
import { sendAdConversion } from '@/lib/adpixels/server';
import { applyRevenueCatAttributes } from '@/lib/attribution/server';

function revenueCatEventName(event: any): AnalyticsEventName | null {
  if (Number(event?.price) < 0) return 'subscription_refunded';
  switch (event?.type) {
    case 'INITIAL_PURCHASE': return 'subscription_started';
    case 'RENEWAL': return 'subscription_renewed';
    case 'CANCELLATION': return 'subscription_cancelled';
    case 'UNCANCELLATION': return 'subscription_uncancelled';
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

type ResolvedPurchase = {
  id: string;
  kind: 'pack' | 'bundle';
  subscription: boolean;
  grants: CampaignRewardGrant[];
  flies: number;
};

const fliesIn = (grants: CampaignRewardGrant[]) =>
  grants.reduce((sum, grant) => (grant.kind === 'flies' ? sum + Math.floor(grant.amount) : sum), 0);

function packPurchase(pack: { id: string; amount: number }): ResolvedPurchase {
  return {
    id: pack.id,
    kind: 'pack',
    subscription: false,
    grants: [{ kind: 'flies', amount: pack.amount }],
    flies: pack.amount,
  };
}

function bundlePurchase(product: StoreProductDoc): ResolvedPurchase | null {
  const grants = storeProductGrants(product);
  if (!grants.length) return null;
  return {
    id: product.productId,
    kind: 'bundle',
    subscription: product.kind === 'subscription',
    grants,
    flies: fliesIn(grants),
  };
}

function pickRegistered(candidates: StoreProductDoc[], presentedOffering: string | null) {
  if (presentedOffering) {
    const exact = candidates.find((item) => item.offeringId === presentedOffering);
    if (exact) return exact;
  }
  const legacy = candidates.find((item) => !item.offeringId);
  if (legacy) return legacy;
  return !presentedOffering && candidates.length === 1 ? candidates[0] : null;
}

async function resolvePurchase(
  storeProductId: string,
  presentedOffering: string | null,
): Promise<ResolvedPurchase | null> {
  if (!storeProductId) return null;
  const pack = getFlyPackForProduct(storeProductId);
  if (pack) return packPurchase(pack);

  await connectMongo();
  const direct = await StoreProductModel.find({
    $or: [{ productId: storeProductId }, { storeIds: storeProductId }],
  }).lean<StoreProductDoc[]>();
  const registered = pickRegistered(direct, presentedOffering);
  if (registered) return bundlePurchase(registered);
  if (direct.length) return null;

  const packages = await packagesForStoreProduct(storeProductId);
  if (!packages.length) return null;
  const viaPack = FLY_PACKS.find((item) => packages.some((pkg) => pkg.packageId === item.packageId));
  if (viaPack) return packPurchase(viaPack);

  const linked = await StoreProductModel.find({
    productId: { $in: packages.map((pkg) => packageRef(pkg.offeringId, pkg.packageId)) },
  }).lean<StoreProductDoc[]>();
  const match = pickRegistered(linked, presentedOffering);
  return match ? bundlePurchase(match) : null;
}

function grantMoment(event: any, purchase: ResolvedPurchase): string | null {
  if (!purchase.subscription) {
    return event?.type === 'NON_RENEWING_PURCHASE' && typeof event?.id === 'string'
      ? event.id
      : null;
  }
  const original = typeof event?.original_transaction_id === 'string'
    ? event.original_transaction_id
    : null;
  if (!original) return null;
  const firstPaid =
    (event?.type === 'INITIAL_PURCHASE' && event?.period_type !== 'TRIAL') ||
    (event?.type === 'RENEWAL' && event?.is_trial_conversion === true);
  return firstPaid ? `bundle:${purchase.id}:${original}` : null;
}

async function grantStorePurchase(userId: string, event: any): Promise<ResolvedPurchase | null> {
  const storeProductId = String(event?.product_id ?? '');
  const presented =
    typeof event?.presented_offering_id === 'string' && event.presented_offering_id
      ? event.presented_offering_id
      : null;
  const purchase = await resolvePurchase(storeProductId, presented);
  if (!purchase) return null;
  const eventId = grantMoment(event, purchase);
  if (!eventId) return null;

  await connectMongo();
  try {
    await FlyPurchaseModel.create({
      eventId,
      transactionId: typeof event?.transaction_id === 'string' ? event.transaction_id : undefined,
      userId,
      packId: purchase.id,
      productId: storeProductId,
      flies: purchase.flies,
      kind: purchase.kind,
      grants: purchase.kind === 'bundle' ? purchase.grants : undefined,
      revenueUsd: Number.isFinite(Number(event?.price)) ? Number(event.price) : undefined,
      store: typeof event?.store === 'string' ? event.store : undefined,
      environment: typeof event?.environment === 'string' ? event.environment : undefined,
      purchasedAt: Number.isFinite(Number(event?.purchased_at_ms))
        ? new Date(Number(event.purchased_at_ms))
        : new Date(),
      grantedAt: new Date(),
    });
  } catch (error: any) {
    if (error?.code === 11000) return purchase;
    throw error;
  }

  try {
    await applyGrants(userId, purchase.grants, {
      source: 'purchase',
      occurrenceKey: `revenuecat:${eventId}`,
      dayKey: new Date().toISOString().slice(0, 10),
      meta: { productId: storeProductId, packId: purchase.id, kind: purchase.kind },
    });
  } catch (error) {
    await FlyPurchaseModel.deleteOne({ eventId });
    throw error;
  }

  return purchase;
}

const WEB_STORES = new Set(['RC_BILLING', 'STRIPE', 'PADDLE']);

async function reportAdConversion(userId: string, event: any, flyPackId?: string) {
  if (typeof event?.id !== 'string') return;

  const isTrial =
    event?.type === 'INITIAL_PURCHASE' && event?.period_type === 'TRIAL';
  const isMoney =
    event?.type === 'INITIAL_PURCHASE' ||
    event?.type === 'RENEWAL' ||
    event?.type === 'NON_RENEWING_PURCHASE';
  if (!isMoney) return;

  const isSandbox = event?.environment === 'SANDBOX';
  const price = Number(event?.price);
  if (!isSandbox && !isTrial && !(Number.isFinite(price) && price > 0)) return;

  await connectMongo();
  const user = await UserModel.findById(userId).select('email adIdentity').lean();
  if (!user) return;

  const isWebStore = WEB_STORES.has(String(event?.store));

  await sendAdConversion({
    metaEvent: isWebStore ? (isTrial ? 'StartTrial' : 'Purchase') : undefined,
    tiktokEvent: isTrial ? 'Subscribe' : 'Purchase',
    eventId: `${event.id}:${isTrial ? 'trial' : 'purchase'}`,
    eventTime: Number.isFinite(Number(event?.event_timestamp_ms))
      ? new Date(Number(event.event_timestamp_ms))
      : new Date(),
    userId,
    email: user.email,
    identity: user.adIdentity,
    actionSource: isWebStore ? 'website' : 'other',
    test: isSandbox,
    value: isTrial ? undefined : price,
    currency: 'USD',
    contentId: flyPackId ?? (typeof event?.product_id === 'string' ? event.product_id : undefined),
  });
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
    const delivered = await grantStorePurchase(userId, event);
    const name = delivered?.kind === 'pack' ? 'fly_pack_purchase_completed' : revenueCatEventName(event);
    if (name) {
      const price = Number(event?.price);
      const tax = Number(event?.tax_percentage);
      const commission = Number(event?.commission_percentage);
      const proceeds = Number.isFinite(price)
        ? price * (1 - (Number.isFinite(tax) ? tax : 0)) * (1 - (Number.isFinite(commission) ? commission : 0))
        : undefined;
      const paywallPlacement = event?.subscriber_attributes?.paywall_placement?.value;
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
          pack_id: delivered?.id,
          fly_amount: delivered?.flies,
          price_usd: Number.isFinite(price) ? price : undefined,
          placement:
            name === 'subscription_started' && typeof paywallPlacement === 'string'
              ? paywallPlacement
              : undefined,
        },
      });
      if (delivered?.flies) {
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
            fly_amount: delivered.flies,
            is_premium: false,
            pack_id: delivered.id,
            environment: event?.environment,
          },
        });
      }
    }
    await applyRevenueCatAttributes(userId, event?.subscriber_attributes).catch((error) => {
      console.error('RevenueCat attribution apply failed:', error);
    });
    await reportAdConversion(userId, event, delivered?.id).catch((error) => {
      console.error('Ad conversion report failed:', error);
    });
  } catch (error) {
    console.error('RevenueCat webhook sync failed:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
