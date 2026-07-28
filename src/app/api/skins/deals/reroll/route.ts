import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import {
  DAILY_DEAL_REROLLS,
  getDailyDeals,
  isPremiumActive,
  rerollsUsed,
  type DealReroll,
} from '@/lib/skins/dailyDeal';
import { getZonedToday } from '@/lib/utils';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { timezone?: unknown } = {};
    try {
      body = await req.json();
    } catch {}
    const timezone =
      typeof body.timezone === 'string' && body.timezone ? body.timezone : 'UTC';

    await connectMongo();
    const user = (await UserModel.findById(userId)
      .select('premiumUntil wardrobe.dealReroll')
      .lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);
    if (!isPremiumActive(user.premiumUntil))
      return json({ error: 'Rerolls are a Plus perk' }, 403);

    const today = getZonedToday(timezone);
    const used = rerollsUsed(
      user.wardrobe?.dealReroll as DealReroll | undefined,
      today,
    );
    if (used >= DAILY_DEAL_REROLLS)
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
          { 'wardrobe.dealReroll.date': { $ne: today } },
          { 'wardrobe.dealReroll.count': used },
        ],
      },
      { $set: { 'wardrobe.dealReroll': { date: today, count: next } } },
      { projection: { _id: 1 } },
    ).lean();
    if (!claimed) return json({ error: 'Try again' }, 409);

    const catalog = await getFullCatalog();
    const dailyDeals = getDailyDeals(catalog, new Date(), timezone, next);

    await recordAnalyticsEvent({
      userId,
      name: 'daily_deals_rerolled',
      properties: { reroll_index: next, deals: dailyDeals.length },
    });

    return json({
      ok: true,
      dailyDeals,
      rerollsLeft: DAILY_DEAL_REROLLS - next,
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
