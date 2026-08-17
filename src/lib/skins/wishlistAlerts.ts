import UserModel from '@/lib/models/User';
import connectMongo from '@/lib/mongoose';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import { isPremiumActive, shopDay } from '@/lib/skins/dailyDeal';
import { loadShopRotation } from '@/lib/skins/shopRotationServer';
import { ensureShopSalesConfig } from '@/lib/models/ShopSalesConfig';
import { sendWardrobePush } from '@/lib/skins/push';
import { readWishlistPins } from '@/lib/skins/wishlist';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

/**
 * Local hours the alert may fire in. A deal dies at local midnight, so waiting
 * for a scheduled "best slot" would routinely miss the window entirely — but
 * nobody wants to be woken up over a hat.
 */
const EARLIEST_HOUR = 9;
const LATEST_HOUR = 21;

/** Below this there isn't enough of the day left to act on it. */
const MIN_HOURS_LEFT = 2;

/**
 * Days before the same pin may be pushed about again. The reserved slot puts a
 * pinned item on the shelf every single day, and every slot is discounted, so
 * without this the alert would fire daily about one hat until the player either
 * bought it or turned notifications off.
 */
const MIN_DAYS_BETWEEN_ALERTS = 6;

/** Whole days between two `YYYY-MM-DD` keys. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

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
  premiumUntil?: Date | null;
  wardrobe?: {
    inventory?: Record<string, number> | null;
    wishlist?: unknown;
    wishlistItems?: unknown;
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
      $or: [
        { 'wardrobe.wishlist': { $ne: null, $exists: true } },
        { 'wardrobe.wishlistItems.0': { $exists: true } },
      ],
      'notificationPrefs.enabled': { $ne: false },
      'notificationPrefs.fcmTokens.0': { $exists: true },
    },
    {
      premiumUntil: 1,
      'wardrobe.inventory': 1,
      'wardrobe.wishlist': 1,
      'wardrobe.wishlistItems': 1,
      'wardrobe.dealReroll': 1,
      'notificationPrefs.timezone': 1,
      'notificationPrefs.enabled': 1,
    },
  ).lean()) as unknown as Candidate[];

  if (users.length === 0) return { scanned: 0, sent: 0, notifiedUserIds };

  const catalog = await getCachedCatalog();
  const byId = buildById(catalog);
  const config = await ensureShopSalesConfig();
  let sent = 0;

  for (const user of users) {
    const tz = user.notificationPrefs?.timezone || 'UTC';
    const hour = hourIn(tz);
    if (hour < EARLIEST_HOUR || hour > LATEST_HOUR) continue;

    const today = shopDay(new Date(), tz, config).dayKey;
    const { deals } = await loadShopRotation({
      catalog,
      wardrobe: user.wardrobe,
      timezone: tz,
      isPlus: isPremiumActive(user.premiumUntil),
      config,
    });
    if (deals.length === 0) continue;

    // Several pins can be on the shelf at once; the alert is still one item,
    // never a digest — the point is that the player chose this exact thing.
    const pins = readWishlistPins(user.wardrobe);
    const hit = pins
      .filter((pin) => pin.kind === 'item')
      .map((pin) => ({
        pin,
        deal: deals.find((entry) => entry.itemId === pin.itemId),
      }))
      .find(
        ({ pin, deal }) =>
          !!deal?.onSale &&
          daysBetween(pin.notifiedDealKey?.split(':')[0] ?? '', today) >=
            MIN_DAYS_BETWEEN_ALERTS &&
          (new Date(deal.endsAt).getTime() - Date.now()) / 3_600_000 >=
            MIN_HOURS_LEFT &&
          !!byId[pin.itemId],
      );
    if (!hit?.deal) continue;

    const { pin, deal } = hit;
    const dealKey = `${today}:${pin.itemId}`;
    const item = byId[pin.itemId];

    // Claim before sending: a crashed send is better than a duplicate, and
    // the conditional write stops two overlapping cron runs double-firing.
    const claimed = Array.isArray(user.wardrobe?.wishlistItems)
      ? await UserModel.findOneAndUpdate(
          {
            _id: user._id,
            'wardrobe.wishlistItems': {
              $elemMatch: {
                itemId: pin.itemId,
                notifiedDealKey: { $ne: dealKey },
              },
            },
          },
          {
            $set: {
              'wardrobe.wishlistItems.$[entry].notifiedDealKey': dealKey,
            },
          },
          {
            projection: { _id: 1 },
            arrayFilters: [{ 'entry.itemId': pin.itemId }],
          },
        ).lean()
      : await UserModel.findOneAndUpdate(
          {
            _id: user._id,
            'wardrobe.wishlist.notifiedDealKey': { $ne: dealKey },
          },
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
