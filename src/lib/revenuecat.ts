import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

const RC_API_BASE = 'https://api.revenuecat.com/v1';
const PLUS_ENTITLEMENT_ID = 'plus';
const LIFETIME_DATE = new Date('9999-12-31T00:00:00Z');

export async function syncPremiumFromRevenueCat(
  appUserId: string,
): Promise<Date | null> {
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
  const entitlement = data?.subscriber?.entitlements?.[PLUS_ENTITLEMENT_ID];
  if (!entitlement) return null;

  const premiumUntil = entitlement.expires_date
    ? new Date(entitlement.expires_date)
    : LIFETIME_DATE;

  await connectMongo();
  await UserModel.updateOne(
    { _id: appUserId },
    { $set: { premiumUntil } },
  );
  return premiumUntil;
}
