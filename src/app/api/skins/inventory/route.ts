import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import { CATALOG, type ItemDef, type WardrobeSlot } from '@/lib/skins/catalog';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';
import { isAvailableAt, filterAvailable } from '@/lib/skins/availability';
import { getShopRotation, isPremiumActive } from '@/lib/skins/dailyDeal';
import { loadShopRotation } from '@/lib/skins/shopRotationServer';
import { loadWishlistState } from '@/lib/skins/wishlistServer';
import type { WishlistState } from '@/lib/skins/wishlist';
import { notifyUserChanged } from '@/lib/taskSync';
import { bumpQuestMetric } from '@/lib/quests/metrics';
import type { UserWardrobe } from '@/lib/types/UserDoc';
import { MAX_HUNGER_MS } from '@/lib/hungerLogic';
import { getZonedToday } from '@/lib/utils';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, {
    status: init,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });

type LeanUser = UserDoc & { _id: string };

function wishlistPayload(state: WishlistState) {
  return {
    wishlist: state.goal,
    wishlistItems: state.items,
    wishlistSlots: state.slots,
  };
}

/**
 * A pinned item becoming affordable is a state, not an action, so it is read
 * off whatever request happens to notice first. The externalId keeps it to one
 * row per user and item however many reads see the same thing.
 */
async function recordWishlistReached(
  userId: string,
  state: WishlistState,
  balance: number,
  isPremium: boolean,
) {
  const ready = state.items.filter((entry) => !entry.owned && balance >= entry.price);
  if (!ready.length) return;
  await Promise.all(
    ready.map((entry) =>
      recordAnalyticsEvent({
        userId,
        name: 'wishlist_reached',
        externalId: `wishlist_reached:${userId}:${entry.itemId}:${entry.price}`,
        properties: {
          item_id: entry.itemId,
          price: entry.price,
          balance,
          list_size: state.items.length,
          is_premium: isPremium,
        },
      }),
    ),
  );
}

/**
 * Scheduled and expired items leave the shop, but anything the player already
 * owns or has equipped stays in the catalog so their wardrobe keeps working.
 */
function visibleCatalog(
  catalog: ItemDef[],
  wardrobe: UserWardrobe,
  now: Date,
): ItemDef[] {
  const kept = new Set<string>();
  for (const [id, count] of Object.entries(wardrobe.inventory ?? {})) {
    if ((count ?? 0) > 0) kept.add(id);
  }
  for (const id of Object.values(wardrobe.equipped ?? {})) {
    if (id) kept.add(id);
  }
  return catalog.filter((item) => isAvailableAt(item, now) || kept.has(item.id));
}

/** Ensure user.wardrobe exists; sanitize equipped vs inventory */
async function ensureWardrobe(uid: string) {
  await connectMongo();
  const user = (await UserModel.findById(uid).lean()) as LeanUser | null;
  if (!user) return null;

  const current: UserWardrobe = {
    equipped: {},
    inventory: {},
    flies: 0,
    ...(user.wardrobe ?? {}),
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
  const timezone =
    req.nextUrl.searchParams.get('timezone') ||
    req.headers.get('x-timezone') ||
    'UTC';

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
        plusIntroEligible: true,
        wardrobe: {
          equipped: {},
          inventory: {},
          flies: 0,
          hunger: MAX_HUNGER_MS,
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
    const premiumUser = (await UserModel.findById(userId)
      .select('premiumUntil')
      .lean()) as { premiumUntil?: Date | null } | null;
    const isPremium = isPremiumActive(premiumUser?.premiumUntil);
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
      const today = getZonedToday(timezone);
      const rotation = await loadShopRotation({
        catalog: fullCatalog,
        wardrobe,
        timezone,
        isPlus: isPremium,
      });
      const dailyDeals = rotation.deals;
      // The home shop rail renders straight off this summary, so the deal items
      // ride along with the equipped ones — no second catalog request. Owned
      // ids come too: the catalog is DB-driven, so anything added after the
      // static seed has no client-side definition, and a consumer reading
      // `inventory` off this payload would silently skip those items.
      const summaryIds = new Set(equippedIds);
      for (const deal of dailyDeals) summaryIds.add(deal.itemId);
      for (const [id, count] of Object.entries(wardrobe.inventory ?? {})) {
        if ((count ?? 0) > 0) summaryIds.add(id);
      }

      return json({
        wardrobe: {
          equipped: wardrobe.equipped ?? {},
          inventory: wardrobe.inventory ?? {},
          unseenItems: unseenIds,
          flies: wardrobe.flies ?? 0,
          hunger: wardrobe.hunger,
          lastHungerUpdate: wardrobe.lastHungerUpdate,
          focusFlyDaily:
            wardrobe.focusFlyDaily?.date === today
              ? wardrobe.focusFlyDaily
              : { date: today, focusSeconds: 0, earned: 0 },
        },
        ...wishlistPayload(
          await (async () => {
            const state = await loadWishlistState(wardrobe, fullCatalog, isPremium);
            await recordWishlistReached(userId, state, wardrobe.flies ?? 0, isPremium);
            return state;
          })(),
        ),
        catalog: fullCatalog.filter((item) => summaryIds.has(item.id)),
        isPremium,
        dailyDeals,
        dealRerollsLeft: rotation.rerollsLeft,
        dealRerollsAllowed: rotation.rerollsAllowed,
        unseenCount: unseenIds.filter((id) => !containerIds.has(id)).length,
        unseenContainerCount: unseenIds.filter((id) => containerIds.has(id))
          .length,
      });
    }
    const now = new Date();
    const rotation = await loadShopRotation({
      catalog: fullCatalog,
      wardrobe,
      timezone,
      isPlus: isPremium,
      now,
    });
    return json({
      wardrobe,
      ...wishlistPayload(
        await (async () => {
          const state = await loadWishlistState(wardrobe, fullCatalog, isPremium);
          await recordWishlistReached(userId, state, wardrobe.flies ?? 0, isPremium);
          return state;
        })(),
      ),
      catalog: visibleCatalog(fullCatalog, wardrobe, now),
      dailyDeals: rotation.deals,
      dealRerollsLeft: rotation.rerollsLeft,
      dealRerollsAllowed: rotation.rerollsAllowed,
      isPremium,
    });
  } catch {
    // Guest Mode or Unauthorized
    let guestCatalog;
    try { guestCatalog = await getFullCatalog(); } catch { guestCatalog = CATALOG; }
    guestCatalog = filterAvailable([...guestCatalog]);
    return json({
      wardrobe: {
        equipped: {},
        inventory: {},
        flies: 5, // Match intro scene
        unseenItems: [],
      },
      wishlist: null,
      wishlistItems: [],
      catalog: guestCatalog,
      dailyDeals: getShopRotation({ catalog: [...guestCatalog], timezone }),
      isPremium: false,
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
      const previousId = wardrobe.equipped?.[slot] ?? null;
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { [`wardrobe.equipped.${slot}`]: null } },
      );
      await notifyUserChanged(userId, {
        eventKind: 'wardrobe-equipped',
        slot,
        itemId: null,
      });
      await recordAnalyticsEvent({
        userId,
        name: 'item_equipped',
        properties: {
          action: 'unequip',
          slot,
          item_id: previousId ?? 'none',
          rarity: 'unknown',
        },
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
    await bumpQuestMetric({ userId, metric: 'skin_equipped' });
    await recordAnalyticsEvent({
      userId,
      name: 'item_equipped',
      properties: {
        action: 'equip',
        slot,
        item_id: itemId,
        rarity: def.rarity ?? 'unknown',
      },
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
