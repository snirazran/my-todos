import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import BackgroundModel from '@/lib/models/Background';
import UserModel, { type UserDoc } from '@/lib/models/User';
import {
  DEFAULT_BACKGROUND_ID,
  ensureDefaultBackground,
} from '@/lib/backgrounds/defaults';
import { notifyUserChanged } from '@/lib/taskSync';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { id?: string; amount?: number };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const id = body.id;
    if (!id) return json({ error: 'Missing background id' }, 400);
    if (id === DEFAULT_BACKGROUND_ID) {
      return json({ error: 'Cannot sell the default background' }, 400);
    }

    const amount =
      typeof body.amount === 'number' && body.amount > 0
        ? Math.floor(body.amount)
        : 1;

    await connectMongo();
    await ensureDefaultBackground();
    const bg = await BackgroundModel.findOne({ id }).lean();
    if (!bg) return json({ error: 'Unknown background' }, 400);

    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    const currentCount = user.wardrobe?.backgrounds?.inventory?.[id] ?? 0;
    if (currentCount < amount) {
      return json({ error: 'Not enough backgrounds' }, 400);
    }

    const singleRefund = Math.floor((bg.priceFlies ?? 0) / 2);
    const totalRefund = singleRefund * amount;

    const update: Record<string, unknown> = {
      $inc: {
        [`wardrobe.backgrounds.inventory.${id}`]: -amount,
        'wardrobe.flies': totalRefund,
      },
    };

    const wasEquipped = user.wardrobe?.backgrounds?.equipped === id;
    const sellingAll = currentCount - amount <= 0;
    if (wasEquipped && sellingAll) {
      update.$set = { 'wardrobe.backgrounds.equipped': DEFAULT_BACKGROUND_ID };
    }

    const result = await UserModel.updateOne(
      {
        _id: user._id,
        [`wardrobe.backgrounds.inventory.${id}`]: { $gte: amount },
      },
      update,
    );

    if (result.modifiedCount === 0) {
      return json({ error: 'Failed to sell background' }, 400);
    }

    if (wasEquipped && sellingAll) {
      await notifyUserChanged(userId, {
        eventKind: 'background-equipped',
        backgroundId: DEFAULT_BACKGROUND_ID,
      });
    }

    const isPremium = !!user.premiumUntil && new Date(user.premiumUntil) > new Date();
    await recordAnalyticsEvent({
      userId,
      name: 'skin_sold',
      properties: { rarity: bg.rarity, slot: 'background', item_count: amount, flies_received: totalRefund, is_premium: isPremium },
    });
    if (totalRefund > 0) {
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: { source: 'background_sale', fly_amount: totalRefund, is_premium: isPremium },
      });
    }

    return json({
      ok: true,
      refund: totalRefund,
      soldAmount: amount,
      equipped: wasEquipped && sellingAll ? DEFAULT_BACKGROUND_ID : undefined,
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
