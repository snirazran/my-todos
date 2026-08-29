import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import BackgroundModel from '@/lib/models/Background';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { notifyUserChanged } from '@/lib/taskSync';
import { bumpQuestMetric } from '@/lib/quests/metrics';
import { isTradeOnlyRarity } from '@/lib/skins/catalog';
import type { ItemDef, WardrobeSlot } from '@/lib/skins/catalog';
import { isAvailableAt } from '@/lib/skins/availability';
import {
  ROTATION_INTERVAL_MS,
  isRotationInterval,
  type RotationInterval,
} from '@/lib/skins/styleShuffle';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

/** At most one try-on offer per day, and only on some shuffles. */
const TRY_ON_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const TRY_ON_CHANCE = 0.35;

type LeanUser = UserDoc & { _id: string };

const SHUFFLE_SLOTS: WardrobeSlot[] = ['skin', 'hat', 'body', 'hand_item'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Never hand back what's already on. A uniform pick over a 2-item wardrobe
 * silently no-ops half the time, so the button reads as broken.
 */
function pickDifferent<T extends { id: string }>(
  arr: T[],
  currentId: string | null | undefined,
): T {
  const pool =
    currentId && arr.length > 1
      ? arr.filter((entry) => entry.id !== currentId)
      : arr;
  return pick(pool.length ? pool : arr);
}

function lockedSlotsOf(user: Pick<UserDoc, 'styleShuffle'> | null): WardrobeSlot[] {
  const raw = user?.styleShuffle?.lockedSlots;
  if (!Array.isArray(raw)) return [];
  return raw.filter((slot): slot is WardrobeSlot =>
    SHUFFLE_SLOTS.includes(slot as WardrobeSlot),
  );
}

/**
 * Whether a shuffle could actually change anything: some slot must own an item
 * that isn't already equipped. With one skin and nothing else, it can't.
 */
function shuffleEligibility(user: LeanUser, catalog: ItemDef[]) {
  const inventory = user.wardrobe?.inventory ?? {};
  const equipped = user.wardrobe?.equipped ?? {};
  const owned = catalog.filter((item) => (inventory[item.id] ?? 0) > 0);
  const slots = SHUFFLE_SLOTS.filter((slot) =>
    owned.some(
      (item) => item.slot === slot && item.id !== (equipped[slot] ?? null),
    ),
  );
  const bgInventory = user.wardrobe?.backgrounds?.inventory ?? {};
  const bgOwned = Object.entries(bgInventory)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([id]) => id);
  const bgEquipped = user.wardrobe?.backgrounds?.equipped ?? null;
  const backgroundEligible = bgOwned.some((id) => id !== bgEquipped);
  return {
    eligible: slots.length > 0 || backgroundEligible,
    shuffleableSlots: slots,
    ownedCount: owned.length,
  };
}

function intervalOf(user: Pick<UserDoc, 'styleShuffle'> | null): RotationInterval {
  const v = user?.styleShuffle?.interval;
  return isRotationInterval(v) ? v : 'disabled';
}

/**
 * Occasionally hand the shuffle something the player does NOT own, so the
 * feature that keeps their frog fresh also shows them what they're missing.
 * The pick is advisory only — nothing is equipped or charged server-side; the
 * client previews it locally and offers to buy.
 */
function pickTryOn(user: LeanUser, catalog: ItemDef[]) {
  const last = user.styleShuffle?.lastTryOnAt;
  if (last && Date.now() - new Date(last).getTime() < TRY_ON_COOLDOWN_MS) {
    return null;
  }
  if (Math.random() > TRY_ON_CHANCE) return null;

  const inventory = user.wardrobe?.inventory ?? {};
  const balance = user.wardrobe?.flies ?? 0;
  const slots: WardrobeSlot[] = ['skin', 'hat', 'body', 'hand_item'];
  const unowned = catalog.filter(
    (item) =>
      slots.includes(item.slot) &&
      (inventory[item.id] ?? 0) <= 0 &&
      (item.priceFlies ?? 0) > 0 &&
      !isTradeOnlyRarity(item.rarity) &&
      isAvailableAt(item),
  );
  if (unowned.length === 0) return null;

  // Prefer something they could plausibly buy soon — a legendary teased at 40
  // flies reads as a taunt, not a try-on.
  const reachable = unowned.filter(
    (item) => (item.priceFlies ?? 0) <= Math.max(200, balance * 2),
  );
  const item = pick(reachable.length ? reachable : unowned);
  return {
    itemId: item.id,
    name: item.name,
    slot: item.slot,
    rarity: item.rarity,
    riveIndex: item.riveIndex,
    price: item.priceFlies ?? 0,
    canAfford: balance >= (item.priceFlies ?? 0),
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ interval: 'disabled', eligible: false });
    const catalog = await getFullCatalog();
    const { eligible, shuffleableSlots, ownedCount } = shuffleEligibility(
      user,
      catalog,
    );
    return json({
      interval: intervalOf(user),
      lockedSlots: lockedSlotsOf(user),
      eligible,
      shuffleableSlots,
      ownedCount,
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { interval?: unknown; lockedSlots?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const update: Record<string, unknown> = {};

    if (body.interval !== undefined) {
      if (!isRotationInterval(body.interval))
        return json({ error: 'Unknown interval' }, 400);
      update['styleShuffle.interval'] = body.interval;
    }

    if (body.lockedSlots !== undefined) {
      if (!Array.isArray(body.lockedSlots))
        return json({ error: 'lockedSlots must be an array' }, 400);
      const cleaned = Array.from(
        new Set(
          body.lockedSlots.filter((slot): slot is WardrobeSlot =>
            SHUFFLE_SLOTS.includes(slot as WardrobeSlot),
          ),
        ),
      );
      update['styleShuffle.lockedSlots'] = cleaned;
    }

    if (Object.keys(update).length === 0)
      return json({ error: 'Nothing to update' }, 400);

    await connectMongo();
    await UserModel.updateOne({ _id: userId }, { $set: update });
    return json({ ok: true, ...update });
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
    const equipped = user.wardrobe?.equipped ?? {};
    const catalog = await getFullCatalog();
    const locked = new Set(lockedSlotsOf(user));
    const set: Record<string, unknown> = {};
    let itemsShuffled = false;
    for (const slot of SHUFFLE_SLOTS) {
      if (locked.has(slot)) continue;
      const owned = catalog.filter(
        (item) => item.slot === slot && (inventory[item.id] ?? 0) > 0,
      );
      if (owned.length === 0) continue;
      const next = pickDifferent(owned, equipped[slot] ?? null);
      if (next.id === (equipped[slot] ?? null)) continue;
      set[`wardrobe.equipped.${slot}`] = next.id;
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
        const current = user.wardrobe?.backgrounds?.equipped ?? null;
        const next = pickDifferent(visible, current);
        if (next.id !== current) {
          backgroundId = next.id;
          set['wardrobe.backgrounds.equipped'] = backgroundId;
        }
      }
    }

    if (Object.keys(set).length === 0)
      return json({ ok: true, shuffled: false });

    const tryOn = pickTryOn(user, catalog);
    if (tryOn) set['styleShuffle.lastTryOnAt'] = new Date();

    await UserModel.updateOne({ _id: userId }, { $set: set });

    if (itemsShuffled) {
      await notifyUserChanged(userId, { eventKind: 'wardrobe-equipped' });
    }
    if (backgroundId) {
      await notifyUserChanged(userId, {
        eventKind: 'background-equipped',
        backgroundId,
      });
    }
    if (itemsShuffled || backgroundId) {
      await bumpQuestMetric({ userId, metric: 'skin_equipped' });
    }

    return json({ ok: true, shuffled: true, tryOn });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
