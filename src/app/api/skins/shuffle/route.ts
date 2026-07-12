import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import BackgroundModel from '@/lib/models/Background';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { notifyUserChanged } from '@/lib/taskSync';
import { bumpQuestMetric } from '@/lib/quests/metrics';
import type { WardrobeSlot } from '@/lib/skins/catalog';
import {
  ROTATION_INTERVAL_MS,
  isRotationInterval,
  type RotationInterval,
} from '@/lib/skins/styleShuffle';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function intervalOf(user: Pick<UserDoc, 'styleShuffle'> | null): RotationInterval {
  const v = user?.styleShuffle?.interval;
  return isRotationInterval(v) ? v : 'disabled';
}

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    const user = (await UserModel.findById(userId)
      .select('styleShuffle')
      .lean()) as LeanUser | null;
    return json({ interval: intervalOf(user) });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { interval?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const interval = body.interval;
    if (!isRotationInterval(interval))
      return json({ error: 'Unknown interval' }, 400);

    await connectMongo();
    await UserModel.updateOne(
      { _id: userId },
      { $set: { 'styleShuffle.interval': interval } },
    );
    return json({ ok: true, interval });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { auto?: boolean } = {};
    try {
      body = await req.json();
    } catch {}
    const auto = body?.auto === true;

    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    if (auto) {
      const ms = ROTATION_INTERVAL_MS[intervalOf(user)];
      if (ms <= 0) return json({ ok: true, shuffled: false });
      const now = new Date();
      const cutoff = new Date(now.getTime() - ms * 0.9);
      const claimed = await UserModel.findOneAndUpdate(
        {
          _id: userId,
          $or: [
            { 'styleShuffle.lastAutoAt': { $exists: false } },
            { 'styleShuffle.lastAutoAt': null },
            { 'styleShuffle.lastAutoAt': { $lte: cutoff } },
          ],
        },
        { $set: { 'styleShuffle.lastAutoAt': now } },
        { projection: { _id: 1 } },
      ).lean();
      if (!claimed) return json({ ok: true, shuffled: false });
    }

    const inventory = user.wardrobe?.inventory ?? {};
    const catalog = await getFullCatalog();
    const set: Record<string, unknown> = {};
    const slots: WardrobeSlot[] = ['skin', 'hat', 'body', 'hand_item'];
    let itemsShuffled = false;
    for (const slot of slots) {
      const owned = catalog.filter(
        (item) => item.slot === slot && (inventory[item.id] ?? 0) > 0,
      );
      if (owned.length === 0) continue;
      set[`wardrobe.equipped.${slot}`] = pick(owned).id;
      itemsShuffled = true;
    }

    const bgInventory = user.wardrobe?.backgrounds?.inventory ?? {};
    const ownedBgIds = Object.entries(bgInventory)
      .filter(([, count]) => (count ?? 0) > 0)
      .map(([id]) => id);
    let backgroundId: string | null = null;
    if (ownedBgIds.length > 0) {
      const visible = (await BackgroundModel.find({
        id: { $in: ownedBgIds },
        hidden: { $ne: true },
      })
        .select('id')
        .lean()) as { id: string }[];
      if (visible.length > 0) {
        backgroundId = pick(visible).id;
        set['wardrobe.backgrounds.equipped'] = backgroundId;
      }
    }

    if (Object.keys(set).length === 0)
      return json({ ok: true, shuffled: false });

    await UserModel.updateOne({ _id: userId }, { $set: set });

    if (itemsShuffled) {
      await notifyUserChanged(userId, { eventKind: 'wardrobe-equipped' });
      await bumpQuestMetric({ userId, metric: 'skin_equipped' });
    }
    if (backgroundId) {
      await notifyUserChanged(userId, {
        eventKind: 'background-equipped',
        backgroundId,
      });
    }

    return json({ ok: true, shuffled: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
