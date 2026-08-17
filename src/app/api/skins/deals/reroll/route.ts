import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { isPremiumActive, shopDay } from '@/lib/skins/dailyDeal';
import { loadShopRotation } from '@/lib/skins/shopRotationServer';
import { ensureShopSalesConfig } from '@/lib/models/ShopSalesConfig';
import { rerollsAllowed } from '@/lib/skins/shopSales';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { timezone?: unknown; viaAd?: unknown } = {};
    try {
      body = await req.json();
    } catch {}
    const timezone =
      typeof body.timezone === 'string' && body.timezone ? body.timezone : 'UTC';
    const viaAd = body.viaAd === true;

    await connectMongo();
    const user = (await UserModel.findById(userId)
      .select('premiumUntil wardrobe')
      .lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    const isPlus = isPremiumActive(user.premiumUntil);
    const config = await ensureShopSalesConfig();
    const allowed = rerollsAllowed(config, isPlus);
    if (allowed <= 0) {
      return json({ error: 'Rerolls are a Plus perk', rerollsLeft: 0 }, 403);
    }
    // Plus pays with the membership, everyone else pays with a rewarded ad.
    if (!isPlus && !viaAd) {
      return json({ error: 'Watch a short ad to reroll', rerollsLeft: 0 }, 403);
    }

    const { dayKey } = shopDay(new Date(), timezone, config);
    const stored = user.wardrobe?.dealReroll ?? null;
    const used =
      stored && stored.date === dayKey
        ? Math.max(0, Math.min(allowed, stored.count))
        : 0;
    if (used >= allowed)
      return json({ error: 'No rerolls left today', rerollsLeft: 0 }, 429);

    const next = used + 1;
    // Atomic on (date, count) so double-taps and parallel tabs can't burn two
    // rerolls or skip one — a stale count simply loses the race.
    const claimed = await UserModel.findOneAndUpdate(
      {
        _id: userId,
        $or: [
          { 'wardrobe.dealReroll': { $exists: false } },
          { 'wardrobe.dealReroll': null },
          { 'wardrobe.dealReroll.date': { $ne: dayKey } },
          { 'wardrobe.dealReroll.count': used },
        ],
      },
      { $set: { 'wardrobe.dealReroll': { date: dayKey, count: next } } },
      { projection: { _id: 1 } },
    ).lean();
    if (!claimed) return json({ error: 'Try again' }, 409);

    const catalog = await getFullCatalog();
    const rotation = await loadShopRotation({
      catalog,
      wardrobe: user.wardrobe,
      timezone,
      isPlus,
      config,
      rerollOverride: next,
    });

    await recordAnalyticsEvent({
      userId,
      name: 'daily_deals_rerolled',
      properties: {
        reroll_index: next,
        deals: rotation.deals.length,
        discounts: rotation.deals.filter((deal) => deal.onSale).length,
        via_ad: !isPlus,
      },
    });

    return json({
      ok: true,
      dailyDeals: rotation.deals,
      rerollsLeft: Math.max(0, allowed - next),
      rerollsAllowed: allowed,
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
