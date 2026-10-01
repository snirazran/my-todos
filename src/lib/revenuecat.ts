import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

const RC_API_BASE = 'https://api.revenuecat.com/v1';
const PLUS_ENTITLEMENT_ID = 'plus';
const LIFETIME_DATE = new Date('9999-12-31T00:00:00Z');

export type PlusStore =
  | 'app_store'
  | 'play_store'
  | 'web'
  | 'promotional'
  | 'unknown';

export type PlusSubscriptionSnapshot = {
  productId: string | null;
  plan: 'yearly' | 'monthly' | null;
  store: PlusStore;
  periodType: 'trial' | 'intro' | 'normal';
  expiresAt: string | null;
  startedAt: string | null;
  willRenew: boolean;
  billingIssue: boolean;
  managementUrl: string | null;
  sandbox: boolean;
  syncedAt: string;
  trialReminderFor?: string | null;
};

function normalizeStore(raw: unknown): PlusStore {
  const store = String(raw ?? '').toLowerCase();
  if (store === 'app_store' || store === 'mac_app_store') return 'app_store';
  if (store === 'play_store') return 'play_store';
  if (store === 'promotional') return 'promotional';
  if (store === 'stripe' || store === 'rc_billing' || store === 'paddle') {
    return 'web';
  }
  return 'unknown';
}

function planFor(productId: string | null): PlusSubscriptionSnapshot['plan'] {
  if (!productId) return null;
  const id = productId.toLowerCase();
  if (id.includes('year') || id.includes('annual')) return 'yearly';
  if (id.includes('month')) return 'monthly';
  return null;
}

function snapshotFrom(subscriber: any): PlusSubscriptionSnapshot | null {
  const entitlement = subscriber?.entitlements?.[PLUS_ENTITLEMENT_ID];
  if (!entitlement) return null;
  const productId =
    typeof entitlement.product_identifier === 'string'
      ? entitlement.product_identifier
      : null;
  const subscription = productId
    ? subscriber?.subscriptions?.[productId] ?? null
    : null;
  const periodType = String(subscription?.period_type ?? 'normal');
  const expiresAt = subscription?.expires_date ?? entitlement.expires_date ?? null;
  const store = normalizeStore(subscription?.store);
  return {
    productId,
    plan: planFor(productId),
    store,
    periodType:
      periodType === 'trial' ? 'trial' : periodType === 'intro' ? 'intro' : 'normal',
    expiresAt,
    startedAt: subscription?.original_purchase_date ?? entitlement.purchase_date ?? null,
    willRenew:
      !!expiresAt &&
      store !== 'promotional' &&
      !subscription?.unsubscribe_detected_at,
    billingIssue: !!subscription?.billing_issues_detected_at,
    managementUrl:
      typeof subscriber?.management_url === 'string'
        ? subscriber.management_url
        : null,
    sandbox: !!subscription?.is_sandbox,
    syncedAt: new Date().toISOString(),
  };
}

export async function fetchPlusSubscription(
  appUserId: string,
): Promise<{ premiumUntil: Date | null; snapshot: PlusSubscriptionSnapshot | null }> {
  const secretKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secretKey) throw new Error('REVENUECAT_SECRET_API_KEY is not set');

  const res = await fetch(
    `${RC_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
    {
      headers: { Authorization: `Bearer ${secretKey}` },
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    throw new Error(`RevenueCat subscriber fetch failed (${res.status})`);
  }
  const data = await res.json();
  const subscriber = data?.subscriber;
  const entitlement = subscriber?.entitlements?.[PLUS_ENTITLEMENT_ID];
  if (!entitlement) return { premiumUntil: null, snapshot: null };

  return {
    premiumUntil: entitlement.expires_date
      ? new Date(entitlement.expires_date)
      : LIFETIME_DATE,
    snapshot: snapshotFrom(subscriber),
  };
}

export async function refreshPlusSnapshot(appUserId: string) {
  const { snapshot } = await fetchPlusSubscription(appUserId);
  if (!snapshot) return null;
  await connectMongo();
  const existing = await UserModel.findById(appUserId)
    .select('plusSubscription')
    .lean<{ plusSubscription?: PlusSubscriptionSnapshot } | null>();
  const next = {
    ...snapshot,
    trialReminderFor: existing?.plusSubscription?.trialReminderFor ?? null,
  };
  await UserModel.updateOne(
    { _id: appUserId },
    { $set: { plusSubscription: next } },
  );
  return next;
}

export async function syncPremiumFromRevenueCat(
  appUserId: string,
): Promise<Date | null> {
  const { premiumUntil, snapshot } = await fetchPlusSubscription(appUserId);
  if (!premiumUntil || !snapshot) return null;

  await connectMongo();
  const existing = await UserModel.findById(appUserId)
    .select('plusSubscription')
    .lean<{ plusSubscription?: PlusSubscriptionSnapshot } | null>();
  const trialReminderFor =
    existing?.plusSubscription?.trialReminderFor ?? null;

  await UserModel.updateOne(
    { _id: appUserId },
    {
      $set: {
        premiumUntil,
        plusSubscription: { ...snapshot, trialReminderFor },
      },
    },
  );
  return premiumUntil;
}
