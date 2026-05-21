import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import BackgroundModel from '@/lib/models/Background';
import UserModel, { type UserDoc } from '@/lib/models/User';
import {
  DEFAULT_BACKGROUND_ID,
  ensureDefaultBackground,
} from '@/lib/backgrounds/defaults';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { id?: string | null };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const rawId = body.id ?? null;

    await connectMongo();
    await ensureDefaultBackground();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    // null means "revert to default"
    const targetId = rawId ?? DEFAULT_BACKGROUND_ID;

    const bg = await BackgroundModel.findOne({ id: targetId, hidden: { $ne: true } }).lean();
    if (!bg) return json({ error: 'Unknown background' }, 400);

    const ownedCount = user.wardrobe?.backgrounds?.inventory?.[targetId] ?? 0;
    if (ownedCount <= 0 && targetId !== DEFAULT_BACKGROUND_ID) {
      return json({ error: 'You do not own this background' }, 403);
    }

    const update: Record<string, unknown> = {
      'wardrobe.backgrounds.equipped': targetId,
    };
    // Make sure default ownership is recorded if we're snapping to it
    if (targetId === DEFAULT_BACKGROUND_ID && ownedCount <= 0) {
      update[`wardrobe.backgrounds.inventory.${DEFAULT_BACKGROUND_ID}`] = 1;
    }

    await UserModel.updateOne({ _id: user._id }, { $set: update });
    return json({ ok: true, equipped: targetId });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
