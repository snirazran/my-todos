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
  LOOK_SLOTS,
  isSavedLook,
  type SavedLook,
} from '@/lib/skins/looks';
import {
  ROTATION_INTERVAL_MS,
  isLocalDayKey,
  isRotationInterval,
  isShuffleLock,
  isShuffleSource,
  type RotationInterval,
  type ShuffleLock,
  type ShuffleSource,
} from '@/lib/skins/styleShuffle';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

/** At most one try-on offer per day, and only on some shuffles. */
const TRY_ON_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const TRY_ON_CHANCE = 0.35;

type LeanUser = UserDoc & { _id: string };

const SHUFFLE_SLOTS: Exclude<ShuffleLock, 'background'>[] = [
  'skin',
  'hat',
  'body',
  'hand_item',
];

type EquippedMap = Partial<Record<WardrobeSlot, string | null>>;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted<T>(arr: T[], weightOf: (entry: T) => number): T {
  const weights = arr.map((entry) => Math.max(0.0001, weightOf(entry)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < arr.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

/**
 * Never hand back what's already on. A uniform pick over a 2-item wardrobe
 * silently no-ops half the time, so the button reads as broken.
 */
function pickDifferent<T extends { id: string }>(
  arr: T[],
  currentId: string | null | undefined,
  weightOf: (entry: T) => number = () => 1,
): T {
  const pool =
    currentId && arr.length > 1
      ? arr.filter((entry) => entry.id !== currentId)
      : arr;
  return pickWeighted(pool.length ? pool : arr, weightOf);
}

function lockedSlotsOf(
  user: Pick<UserDoc, 'styleShuffle'> | null,
): ShuffleLock[] {
  const raw = user?.styleShuffle?.lockedSlots;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isShuffleLock);
}

function sourceOf(user: Pick<UserDoc, 'styleShuffle'> | null): ShuffleSource {
  const v = user?.styleShuffle?.source;
  return isShuffleSource(v) ? v : 'wardrobe';
}

function equipWeight(user: LeanUser) {
  const counts = user.styleShuffle?.equipCounts ?? {};
  return (entry: { id: string }) => 1 + Math.log2(1 + (counts[entry.id] ?? 0));
}

async function visibleOwnedBackgrounds(user: LeanUser) {
  const bgInventory = user.wardrobe?.backgrounds?.inventory ?? {};
  const ownedBgIds = Object.entries(bgInventory)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([id]) => id);
  if (ownedBgIds.length === 0) return [];
  return (await BackgroundModel.find({
    id: { $in: ownedBgIds },
    hidden: { $ne: true },
  })
    .select('id name')
    .lean()) as { id: string; name?: string }[];
}

function usableLooks(user: LeanUser): SavedLook[] {
  const raw = user.wardrobe?.looks;
  if (!Array.isArray(raw)) return [];
  const inventory = user.wardrobe?.inventory ?? {};
  return raw.filter(isSavedLook).filter((look) =>
    LOOK_SLOTS.every((slot) => {
      const id = look.equipped?.[slot];
      return !id || (inventory[id] ?? 0) > 0;
    }),
  );
}

/**
 * Whether a shuffle could actually change anything: some slot must own an item
 * that isn't already equipped. With one skin and nothing else, it can't.
 */
function shuffleEligibility(
  user: LeanUser,
  catalog: ItemDef[],
  backgrounds: { id: string; name?: string }[],
) {
  const inventory = user.wardrobe?.inventory ?? {};
  const equipped = user.wardrobe?.equipped ?? {};
  const owned = catalog.filter((item) => (inventory[item.id] ?? 0) > 0);
  const slots: ShuffleLock[] = SHUFFLE_SLOTS.filter((slot) =>
    owned.some(
      (item) => item.slot === slot && item.id !== (equipped[slot] ?? null),
    ),
  );
  const bgEquipped = user.wardrobe?.backgrounds?.equipped ?? null;
  if (backgrounds.some((bg) => bg.id !== bgEquipped)) slots.push('background');

  const byId = new Map(catalog.map((item) => [item.id, item]));
  const pieces = [
    ...SHUFFLE_SLOTS.map((slot) => {
      const id = equipped[slot] ?? null;
      return {
        slot: slot as ShuffleLock,
        name: id ? (byId.get(id)?.name ?? null) : null,
        options: owned.filter((item) => item.slot === slot).length,
      };
    }),
    {
      slot: 'background' as ShuffleLock,
      name: bgEquipped
        ? (backgrounds.find((bg) => bg.id === bgEquipped)?.name ?? null)
        : null,
      options: backgrounds.length,
    },
  ];

  return {
    eligible: slots.length > 0,
    shuffleableSlots: slots,
    ownedCount: owned.length,
    pieces,
  };
}

function intervalOf(user: Pick<UserDoc, 'styleShuffle'> | null): RotationInterval {
  const v = user?.styleShuffle?.interval;
  return isRotationInterval(v) ? v : 'disabled';
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
    const backgrounds = await visibleOwnedBackgrounds(user);
    const { eligible, shuffleableSlots, ownedCount, pieces } =
      shuffleEligibility(user, catalog, backgrounds);
    return json({
      interval: intervalOf(user),
      lockedSlots: lockedSlotsOf(user),
      source: sourceOf(user),
      eligible,
      shuffleableSlots,
      ownedCount,
      pieces,
      looksCount: usableLooks(user).length,
      canUndo: !!user.styleShuffle?.previous,
      lastAutoAt: toIso(user.styleShuffle?.lastAutoAt),
    });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: {
      interval?: unknown;
      lockedSlots?: unknown;
      source?: unknown;
      localDay?: unknown;
    };
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
      update['styleShuffle.lastAutoAt'] = new Date();
      if (isLocalDayKey(body.localDay))
        update['styleShuffle.lastAutoDay'] = body.localDay;
    }

    if (body.lockedSlots !== undefined) {
      if (!Array.isArray(body.lockedSlots))
        return json({ error: 'lockedSlots must be an array' }, 400);
      update['styleShuffle.lockedSlots'] = Array.from(
        new Set(body.lockedSlots.filter(isShuffleLock)),
      );
    }

    if (body.source !== undefined) {
      if (!isShuffleSource(body.source))
        return json({ error: 'Unknown source' }, 400);
      update['styleShuffle.source'] = body.source;
    }

    if (Object.keys(update).length === 0)
      return json({ error: 'Nothing to update' }, 400);

    await connectMongo();
    await UserModel.updateOne({ _id: userId }, { $set: update });
    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

async function claimAutoShuffle(
  userId: string,
  user: LeanUser,
  localDay: string | null,
) {
  const interval = intervalOf(user);
  const ms = ROTATION_INTERVAL_MS[interval];
  if (ms <= 0) return false;
  const now = new Date();
  const set: Record<string, unknown> = { 'styleShuffle.lastAutoAt': now };
  let filter: Record<string, unknown>;
  if (interval === '1d' && localDay) {
    filter = { 'styleShuffle.lastAutoDay': { $ne: localDay } };
    set['styleShuffle.lastAutoDay'] = localDay;
  } else {
    const cutoff = new Date(now.getTime() - ms * 0.9);
    filter = {
      $or: [
        { 'styleShuffle.lastAutoAt': { $exists: false } },
        { 'styleShuffle.lastAutoAt': null },
        { 'styleShuffle.lastAutoAt': { $lte: cutoff } },
      ],
    };
  }
  const claimed = await UserModel.findOneAndUpdate(
    { _id: userId, ...filter },
    { $set: set },
    { projection: { _id: 1 } },
  ).lean();
  return !!claimed;
}

async function announceChange(
  userId: string,
  itemsChanged: boolean,
  backgroundId: string | null,
) {
  if (itemsChanged) {
    await notifyUserChanged(userId, { eventKind: 'wardrobe-equipped' });
  }
  if (backgroundId) {
    await notifyUserChanged(userId, {
      eventKind: 'background-equipped',
      backgroundId,
    });
  }
}

async function undoShuffle(userId: string, user: LeanUser) {
  const previous = user.styleShuffle?.previous;
  if (!previous) return json({ ok: true, shuffled: false, canUndo: false });

  const inventory = user.wardrobe?.inventory ?? {};
  const equipped = user.wardrobe?.equipped ?? {};
  const set: Record<string, unknown> = { 'styleShuffle.previous': null };
  let itemsChanged = false;
  for (const slot of SHUFFLE_SLOTS) {
    const id = previous.equipped?.[slot] ?? null;
    if (id && (inventory[id] ?? 0) <= 0) continue;
    if (id === (equipped[slot] ?? null)) continue;
    set[`wardrobe.equipped.${slot}`] = id;
    itemsChanged = true;
  }

  let backgroundId: string | null = null;
  const prevBg = previous.backgroundId ?? null;
  const currentBg = user.wardrobe?.backgrounds?.equipped ?? null;
  if (
    prevBg &&
    prevBg !== currentBg &&
    (user.wardrobe?.backgrounds?.inventory?.[prevBg] ?? 0) > 0
  ) {
    backgroundId = prevBg;
    set['wardrobe.backgrounds.equipped'] = prevBg;
  }

  await UserModel.updateOne({ _id: userId }, { $set: set });
  await announceChange(userId, itemsChanged, backgroundId);
  return json({
    ok: true,
    shuffled: itemsChanged || !!backgroundId,
    undone: true,
    canUndo: false,
  });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { auto?: unknown; undo?: unknown; localDay?: unknown } = {};
    try {
      body = await req.json();
    } catch {}
    const auto = body?.auto === true;
    const localDay = isLocalDayKey(body?.localDay) ? body.localDay : null;

    await connectMongo();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    if (!user) return json({ error: 'User not found' }, 404);

    if (body?.undo === true) return undoShuffle(userId, user);

    if (auto && !(await claimAutoShuffle(userId, user, localDay)))
      return json({ ok: true, shuffled: false });

    const inventory = user.wardrobe?.inventory ?? {};
    const equipped: EquippedMap = user.wardrobe?.equipped ?? {};
    const currentBg = user.wardrobe?.backgrounds?.equipped ?? null;
    const catalog = await getFullCatalog();
    const locked = new Set(lockedSlotsOf(user));
    const weightOf = equipWeight(user);
    const backgrounds = await visibleOwnedBackgrounds(user);
    const set: Record<string, unknown> = {};
    let itemsShuffled = false;
    let backgroundId: string | null = null;

    const lookCandidates =
      sourceOf(user) === 'looks'
        ? usableLooks(user).filter(
            (look) =>
              SHUFFLE_SLOTS.some(
                (slot) =>
                  !locked.has(slot) &&
                  (look.equipped?.[slot] ?? null) !== (equipped[slot] ?? null),
              ) ||
              (!locked.has('background') &&
                !!look.backgroundId &&
                look.backgroundId !== currentBg &&
                backgrounds.some((bg) => bg.id === look.backgroundId)),
          )
        : [];

    if (lookCandidates.length > 0) {
      const look = pick(lookCandidates);
      for (const slot of SHUFFLE_SLOTS) {
        if (locked.has(slot)) continue;
        const id = look.equipped?.[slot] ?? null;
        if (id === (equipped[slot] ?? null)) continue;
        set[`wardrobe.equipped.${slot}`] = id;
        itemsShuffled = true;
      }
      if (
        !locked.has('background') &&
        look.backgroundId &&
        look.backgroundId !== currentBg &&
        backgrounds.some((bg) => bg.id === look.backgroundId)
      ) {
        backgroundId = look.backgroundId;
        set['wardrobe.backgrounds.equipped'] = backgroundId;
      }
    } else {
      for (const slot of SHUFFLE_SLOTS) {
        if (locked.has(slot)) continue;
        const owned = catalog.filter(
          (item) => item.slot === slot && (inventory[item.id] ?? 0) > 0,
        );
        if (owned.length === 0) continue;
        const next = pickDifferent(owned, equipped[slot] ?? null, weightOf);
        if (next.id === (equipped[slot] ?? null)) continue;
        set[`wardrobe.equipped.${slot}`] = next.id;
        itemsShuffled = true;
      }
      if (!locked.has('background') && backgrounds.length > 0) {
        const next = pickDifferent(backgrounds, currentBg, weightOf);
        if (next.id !== currentBg) {
          backgroundId = next.id;
          set['wardrobe.backgrounds.equipped'] = backgroundId;
        }
      }
    }

    if (Object.keys(set).length === 0)
      return json({ ok: true, shuffled: false });

    set['styleShuffle.previous'] = {
      equipped: Object.fromEntries(
        SHUFFLE_SLOTS.map((slot) => [slot, equipped[slot] ?? null]),
      ),
      backgroundId: currentBg,
      at: new Date(),
    };

    const tryOn = pickTryOn(user, catalog);
    if (tryOn) set['styleShuffle.lastTryOnAt'] = new Date();

    await UserModel.updateOne({ _id: userId }, { $set: set });

    await announceChange(userId, itemsShuffled, backgroundId);
    await bumpQuestMetric({ userId, metric: 'skin_equipped' });

    return json({ ok: true, shuffled: true, auto, tryOn, canUndo: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
