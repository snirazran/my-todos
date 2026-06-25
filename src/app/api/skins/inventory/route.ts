import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { CATALOG, type WardrobeSlot } from '@/lib/skins/catalog';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';
import { notifyUserChanged } from '@/lib/taskSync';
import type { UserWardrobe } from '@/lib/types/UserDoc';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

/** Ensure user.wardrobe exists; sanitize equipped vs inventory */
async function ensureWardrobe(uid: string) {
  await connectMongo();
  const user = (await UserModel.findById(uid).lean()) as LeanUser | null;
  if (!user) return null;

  const current: UserWardrobe = user.wardrobe ?? {
    equipped: {},
    inventory: {},
    flies: 0,
  };

  // If equipped item is not owned anymore, null it
  const nextEquipped: UserWardrobe['equipped'] = { ...current.equipped };
  for (const slot of ['skin', 'hat', 'body', 'hand_item'] as WardrobeSlot[]) {
    const id = nextEquipped[slot];
    if (id && (!current.inventory[id] || current.inventory[id] <= 0)) {
      nextEquipped[slot] = null;
    }
  }
  const next: UserWardrobe = {
    ...current,
    equipped: nextEquipped,
    unseenItems: current.unseenItems ?? [],
  };

  if (
    !user.wardrobe ||
    JSON.stringify(user.wardrobe) !== JSON.stringify(next)
  ) {
    await UserModel.updateOne({ _id: user._id }, { $set: { wardrobe: next } });
  }

  return next;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const isSummary =
      new URL(req.url).searchParams.get('view') === 'summary' ||
      new URL(req.url).searchParams.get('summary') === '1';

    // Auto-create user if missing (fallback for existing sessions)
    // We can reuse the logic from POST /api/user or just call ensureWardrobe which updates it
    // But ensureWardrobe returns null if user is missing.
    // Let's first check if user exists, if not create basic one.

    const userExists = await UserModel.exists({ _id: userId });
    if (!userExists) {
      // Create basic user record if it doesn't exist
      const now = new Date();
      await UserModel.create({
        _id: userId,
        email: '', // We don't have email here easily without requireAuth(), but that is fine
        name: 'Anonymous Frog',
        createdAt: now,
        wardrobe: {
          equipped: {},
          inventory: {},
          flies: 0,
          hunger: 86400000,
          lastHungerUpdate: now,
          stolenFlies: 0,
        },
        statistics: {
          daily: {
            date: '',
            dailyTasksCount: 0,
            dailyMilestoneGifts: 0,
            completedTaskIds: [],
            taskCountAtLastGift: 0,
          },
        },
      });
    }

    const wardrobe = await ensureWardrobe(userId);
    if (!wardrobe) return json({ error: 'User not found' }, 404);
    const fullCatalog = await getFullCatalog();
    if (isSummary) {
      const unseenIds = wardrobe.unseenItems ?? [];
      const containerIds = new Set(
        fullCatalog
          .filter((item) => item.slot === 'container')
          .map((item) => item.id),
      );
      const equippedIds = new Set(
        Object.values(wardrobe.equipped ?? {}).filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        ),
      );

      return json({
        wardrobe: {
          equipped: wardrobe.equipped ?? {},
          inventory: {},
          unseenItems: unseenIds,
          flies: wardrobe.flies ?? 0,
        },
        catalog: fullCatalog.filter((item) => equippedIds.has(item.id)),
        unseenCount: unseenIds.filter((id) => !containerIds.has(id)).length,
        unseenContainerCount: unseenIds.filter((id) => containerIds.has(id))
          .length,
      });
    }
    return json({ wardrobe, catalog: fullCatalog });
  } catch {
    // Guest Mode or Unauthorized
    let guestCatalog;
    try { guestCatalog = await getFullCatalog(); } catch { guestCatalog = CATALOG; }
    return json({
      wardrobe: {
        equipped: {},
        inventory: {},
        flies: 5, // Match intro scene
        unseenItems: [],
      },
      catalog: guestCatalog,
    });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { slot?: WardrobeSlot; itemId?: string | null };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const slot = body.slot;
    const itemId = body.itemId ?? null; // null => unequip

    if (!slot || !['skin', 'hat', 'body', 'hand_item'].includes(slot))
      return json({ error: 'Unknown slot' }, 400);

    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };

    // Unequip for this slot
    if (itemId === null) {
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { [`wardrobe.equipped.${slot}`]: null } },
      );
      await notifyUserChanged(userId, {
        eventKind: 'wardrobe-equipped',
        slot,
        itemId: null,
      });
      return json({ ok: true });
    }

    // Equip: must exist in catalog, match the slot, and be owned
    const fullCatalog = await getFullCatalog();
    const fullById = buildById(fullCatalog);
    const def = fullById[itemId];
    if (!def) return json({ error: 'Unknown itemId' }, 400);
    if (def.slot !== slot)
      return json({ error: 'Item does not match slot' }, 400);

    if ((wardrobe.inventory[itemId] ?? 0) <= 0)
      return json({ error: 'You do not own this item' }, 403);

    await UserModel.updateOne(
      { _id: user._id },
      { $set: { [`wardrobe.equipped.${slot}`]: itemId } },
    );
    await notifyUserChanged(userId, {
      eventKind: 'wardrobe-equipped',
      slot,
      itemId,
    });
    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { action?: string; itemId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    await connectMongo();

    if (body.action === 'markOneSeen' && body.itemId) {
      await UserModel.updateOne(
        { _id: userId },
        { $pull: { 'wardrobe.unseenItems': body.itemId } },
      );
      return json({ ok: true });
    }

    if (body.action === 'markSeen') {
      await UserModel.updateOne(
        { _id: userId },
        { $set: { 'wardrobe.unseenItems': [] } },
      );
      return json({ ok: true });
    }

    if (body.action === 'markContainersSeen') {
      // Get all container IDs from CATALOG
      const containerIds = CATALOG.filter((i) => i.slot === 'container').map(
        (i) => i.id,
      );
      await UserModel.updateOne(
        { _id: userId },
        { $pull: { 'wardrobe.unseenItems': { $in: containerIds } } },
      );
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { itemId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const itemId = body.itemId;
    const fullCat = await getFullCatalog();
    const fullLookup = buildById(fullCat);
    if (!itemId || !fullLookup[itemId]) return json({ error: 'Unknown itemId' }, 400);

    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    // Initialize wardrobe if missing, or update
    if (!user.wardrobe) {
      const init: UserWardrobe = {
        equipped: {},
        inventory: { [itemId]: 1 },
        inventoryHistory: { [itemId]: new Date().toISOString() },
        unseenItems: [itemId],
        flies: 0,
      };
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { wardrobe: init } },
      );
    } else {
      const update: any = {
        $inc: { [`wardrobe.inventory.${itemId}`]: 1 },
        $addToSet: { 'wardrobe.unseenItems': itemId },
      };

      // Only set history if not already present
      if (!user.wardrobe.inventoryHistory?.[itemId]) {
        update.$set = { [`wardrobe.inventoryHistory.${itemId}`]: new Date().toISOString() };
      }

      await UserModel.updateOne({ _id: user._id }, update);
    }

    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
