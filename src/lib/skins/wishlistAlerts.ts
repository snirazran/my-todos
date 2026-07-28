import UserModel from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import { getDailyDeals, rerollsUsed } from '@/lib/skins/dailyDeal';
import { sendWardrobePush } from '@/lib/skins/push';
import { isWishlistPin } from '@/lib/skins/wishlist';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { getZonedToday } from '@/lib/utils';

/**
 * Local hours the alert may fire in. A deal dies at local midnight, so waiting
 * for a scheduled "best slot" would routinely miss the window entirely — but
 * nobody wants to be woken up over a hat.
 */
const EARLIEST_HOUR = 9;
const LATEST_HOUR = 21;

/** Below this there isn't enough of the day left to act on it. */
const MIN_HOURS_LEFT = 2;

function hourIn(tz: string): number {
  try {
    return parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        hour12: false,
      }).format(new Date()),
      10,
    );
  } catch {
    return new Date().getUTCHours();
  }
}

type Candidate = {
  _id: string;
  wardrobe?: {
    wishlist?: unknown;
    dealReroll?: { date: string; count: number } | null;
  };
  notificationPrefs?: { timezone?: string; enabled?: boolean };
};

/**
 * Notify anyone whose pinned item landed on today's shelf.
 *
 * Deliberately one item per push and never batched: the player already chose
 * this thing, which is what makes the alert worth sending at all, and a
 * digest of several would dilute exactly that.
 */
export async function runWishlistDealAlerts(): Promise<{
  scanned: number;
  sent: number;
  /** Users alerted this run — the caller skips them so nobody gets two pushes. */
  notifiedUserIds: Set<string>;
}> {
  await connectMongo();
  const notifiedUserIds = new Set<string>();

  const users = (await UserModel.find(
    {
      'wardrobe.wishlist': { $ne: null, $exists: true },
      'notificationPrefs.enabled': { $ne: false },
      'notificationPrefs.fcmTokens.0': { $exists: true },
    },
    {
      'wardrobe.wishlist': 1,
      'wardrobe.dealReroll': 1,
      'notificationPrefs.timezone': 1,
      'notificationPrefs.enabled': 1,
    },
  ).lean()) as unknown as Candidate[];

  if (users.length === 0) return { scanned: 0, sent: 0, notifiedUserIds };

  const catalog = await getCachedCatalog();
  const byId = buildById(catalog);
  let sent = 0;

  for (const user of users) {
    const pin = user.wardrobe?.wishlist;
    if (!isWishlistPin(pin)) continue;
    // Backgrounds never appear on the shelf — getDailyDeals draws from the
    // item catalog only.
    if (pin.kind !== 'item') continue;

    const tz = user.notificationPrefs?.timezone || 'UTC';
    const hour = hourIn(tz);
    if (hour < EARLIEST_HOUR || hour > LATEST_HOUR) continue;

    const today = getZonedToday(tz);
    const dealKey = `${today}:${pin.itemId}`;
    if (pin.notifiedDealKey === dealKey) continue;

    const deals = getDailyDeals(
      catalog,
      new Date(),
      tz,
      rerollsUsed(user.wardrobe?.dealReroll ?? undefined, today),
    );
    const deal = deals.find((entry) => entry.itemId === pin.itemId);
    if (!deal) continue;

    const hoursLeft =
      (new Date(deal.endsAt).getTime() - Date.now()) / 3_600_000;
    if (hoursLeft < MIN_HOURS_LEFT) continue;

    const item = byId[pin.itemId];
    if (!item) continue;

    // Claim before sending: a crashed send is better than a duplicate, and
    // the conditional write stops two overlapping cron runs double-firing.
    const claimed = await UserModel.findOneAndUpdate(
      { _id: user._id, 'wardrobe.wishlist.notifiedDealKey': { $ne: dealKey } },
      { $set: { 'wardrobe.wishlist.notifiedDealKey': dealKey } },
      { projection: { _id: 1 } },
    ).lean();
    if (!claimed) continue;

    const ok = await sendWardrobePush(user._id, {
      title: `${item.name} is ${deal.discountPercent}% off today`,
      body: `The one you're saving for — ${deal.dealPrice.toLocaleString()} flies instead of ${deal.priceFlies.toLocaleString()}.`,
      type: 'wishlist_deal',
      path: `/wardrobe?tab=shop&item=${encodeURIComponent(pin.itemId)}&kind=item`,
    });

    if (ok) {
      sent += 1;
      notifiedUserIds.add(user._id);
      // Share the reminder cron's throttle clock so the routine nudge won't
      // land on top of this within its minimum gap.
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { 'notificationPrefs.lastNotifiedAt': new Date() } },
      );
      await recordAnalyticsEvent({
        userId: user._id,
        name: 'wishlist_deal_notified',
        properties: {
          item_id: pin.itemId,
          discount: deal.discountPercent,
          deal_price: deal.dealPrice,
        },
      });
    }
  }

  return { scanned: users.length, sent, notifiedUserIds };
}
