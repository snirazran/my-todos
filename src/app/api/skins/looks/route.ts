import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import BackgroundModel from '@/lib/models/Background';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';
import { notifyUserChanged } from '@/lib/taskSync';
import { bumpQuestMetric } from '@/lib/quests/metrics';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { isPremiumActive } from '@/lib/skins/dailyDeal';
import {
  LOOK_SLOTS,
  SAVED_LOOKS_PLUS,
  maxSavedLooks,
  autoNameLook,
  isEmptyLook,
  isSavedLook,
  looksMatch,
  toLookView,
  type SavedLook,
} from '@/lib/skins/looks';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

function storedLooks(user: LeanUser | null): SavedLook[] {
  const raw = user?.wardrobe?.looks;
  return Array.isArray(raw) ? raw.filter(isSavedLook) : [];
}

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    const catalog = await getFullCatalog();
    const byId = buildById(catalog);
    const inventory = user?.wardrobe?.inventory ?? {};
    const isPremium = isPremiumActive(user?.premiumUntil);
    return json({
      looks: storedLooks(user).map((look) => toLookView(look, byId, inventory)),
      max: maxSavedLooks(isPremium),
      isPremium,
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

/** Save whatever the frog is wearing right now. */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { name?: unknown } = {};
    try {
      body = await req.json();
    } catch {}

    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    const equipped = user.wardrobe?.equipped ?? {};
    const backgroundId = user.wardrobe?.backgrounds?.equipped ?? null;
    if (isEmptyLook(equipped, backgroundId))
      return json({ error: 'Nothing to save — your frog is bare' }, 400);

    const looks = storedLooks(user);
    const duplicate = looks.find((look) =>
      looksMatch(look.equipped, equipped, look.backgroundId, backgroundId),
    );
    if (duplicate)
      return json({ error: 'You already saved this look', look: duplicate }, 409);

    const isPremium = isPremiumActive(user.premiumUntil);
    const max = maxSavedLooks(isPremium);
    if (looks.length >= max)
      return json(
        {
          // A lapsed subscriber keeps every look they saved; they just can't
          // add more until they're back under the free cap.
          error: isPremium
            ? `You can keep ${max} looks — delete one first`
            : `Free keeps ${max} looks — delete one, or unlock ${SAVED_LOOKS_PLUS} with Plus`,
          atCap: true,
          canUpgrade: !isPremium,
        },
        409,
      );

    const catalog = await getFullCatalog();
    const byId = buildById(catalog);
    const name =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim().slice(0, 24)
        : autoNameLook(
            equipped,
            byId,
            looks.map((look) => look.name),
          );

    const look: SavedLook = {
      id: randomUUID(),
      name,
      equipped: Object.fromEntries(
        LOOK_SLOTS.map((slot) => [slot, equipped[slot] ?? null]),
      ),
      backgroundId,
      createdAt: new Date().toISOString(),
    };

    await UserModel.updateOne(
      { _id: userId },
      { $push: { 'wardrobe.looks': look } },
    );
    await recordAnalyticsEvent({
      userId,
      name: 'look_saved',
      properties: { total: looks.length + 1 },
    });

    return json({
      ok: true,
      look: toLookView(look, byId, user.wardrobe?.inventory ?? {}),
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

/** Wear a saved look. */
export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { lookId?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const lookId = typeof body.lookId === 'string' ? body.lookId : '';
    if (!lookId) return json({ error: 'Missing lookId' }, 400);

    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    const look = storedLooks(user).find((entry) => entry.id === lookId);
    if (!look) return json({ error: 'Look not found' }, 404);

    // Re-check ownership: a piece may have been sold or traded since saving.
    // Those slots come back empty rather than failing the whole apply.
    const inventory = user.wardrobe?.inventory ?? {};
    const set: Record<string, unknown> = {};
    for (const slot of LOOK_SLOTS) {
      const id = look.equipped[slot] ?? null;
      set[`wardrobe.equipped.${slot}`] =
        id && (inventory[id] ?? 0) > 0 ? id : null;
    }

    let backgroundId: string | null = null;
    if (look.backgroundId) {
      const owned =
        (user.wardrobe?.backgrounds?.inventory?.[look.backgroundId] ?? 0) > 0;
      const visible = owned
        ? await BackgroundModel.exists({
            id: look.backgroundId,
            hidden: { $ne: true },
          })
        : null;
      if (visible) {
        backgroundId = look.backgroundId;
        set['wardrobe.backgrounds.equipped'] = backgroundId;
      }
    }

    await UserModel.updateOne({ _id: userId }, { $set: set });
    await notifyUserChanged(userId, { eventKind: 'wardrobe-equipped' });
    await bumpQuestMetric({ userId, metric: 'skin_equipped' });
    if (backgroundId) {
      await notifyUserChanged(userId, {
        eventKind: 'background-equipped',
        backgroundId,
      });
    }
    await recordAnalyticsEvent({ userId, name: 'look_applied' });

    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { lookId?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const lookId = typeof body.lookId === 'string' ? body.lookId : '';
    if (!lookId) return json({ error: 'Missing lookId' }, 400);

    await connectMongo();
    await UserModel.updateOne(
      { _id: userId },
      { $pull: { 'wardrobe.looks': { id: lookId } } },
    );
    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
