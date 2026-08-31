import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import CatalogItemModel from '@/lib/models/CatalogItem';
import BackgroundModel from '@/lib/models/Background';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import AdminGrantModel, {
  GRANT_KINDS,
  type AdminGrantDoc,
  type GrantKind,
} from '@/lib/models/AdminGrant';
import { logFlyGrant, recordFlySpend } from '@/lib/economy/ledger';
import { economyDayKey, storedEconomyTimezone } from '@/lib/economy/guards';

export const GRANT_LIMITS: Record<GrantKind, { min: number; max: number }> = {
  flies: { min: 1, max: 1_000_000 },
  premium: { min: 1, max: 3650 },
  item: { min: 1, max: 99 },
  background: { min: 1, max: 99 },
};

export const REASON_MIN = 3;
export const REASON_MAX = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

export class GrantError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type GrantAdmin = { uid: string; email: string };

export type GrantInput = {
  requestId: string;
  userId: string;
  kind: GrantKind;
  amount: number;
  itemId?: string;
  reason: string;
};

type TargetUser = {
  _id: unknown;
  name?: string;
  email?: string;
  premiumUntil?: Date;
  wardrobe?: {
    flies?: number;
    inventory?: Record<string, number>;
    equipped?: Record<string, string | null>;
    inventoryHistory?: Record<string, string>;
    unseenItems?: string[];
    backgrounds?: {
      equipped?: string | null;
      inventory?: Record<string, number>;
    };
  };
};

async function loadTarget(userId: string): Promise<TargetUser> {
  const user = await UserModel.findById(userId)
    .select('name email premiumUntil wardrobe')
    .lean<TargetUser | null>();
  if (!user) throw new GrantError('User not found', 404);
  return user;
}

async function resolveCatalogEntry(kind: GrantKind, itemId?: string) {
  const id = (itemId ?? '').trim();
  if (!id) throw new GrantError('Pick an item first');
  if (!/^[\w-]+$/.test(id)) throw new GrantError('Bad item id');

  if (kind === 'background') {
    const doc = await BackgroundModel.findOne({ id })
      .select('id name')
      .lean<{ id: string; name: string } | null>();
    if (!doc) throw new GrantError(`No background with id "${id}"`, 404);
    return { id: doc.id, name: doc.name };
  }

  let doc = await CatalogItemModel.findOne({ id })
    .select('id name')
    .lean<{ id: string; name: string } | null>();
  if (!doc) {
    await getFullCatalog();
    doc = await CatalogItemModel.findOne({ id })
      .select('id name')
      .lean<{ id: string; name: string } | null>();
  }
  if (!doc) throw new GrantError(`No catalog item with id "${id}"`, 404);
  return { id: doc.id, name: doc.name };
}

function validate(input: GrantInput) {
  if (!GRANT_KINDS.includes(input.kind)) {
    throw new GrantError('Unknown grant type');
  }
  if (!input.requestId || input.requestId.length > 100) {
    throw new GrantError('Missing request id');
  }
  if (!input.userId) throw new GrantError('Pick a player first');

  const reason = (input.reason ?? '').trim();
  if (reason.length < REASON_MIN) {
    throw new GrantError('Every grant needs a reason');
  }
  if (reason.length > REASON_MAX) {
    throw new GrantError(`Keep the reason under ${REASON_MAX} characters`);
  }

  const limits = GRANT_LIMITS[input.kind];
  const amount = Math.floor(Number(input.amount));
  if (!Number.isFinite(amount) || amount < limits.min || amount > limits.max) {
    throw new GrantError(
      `Amount must be between ${limits.min} and ${limits.max.toLocaleString()}`,
    );
  }

  return { reason, amount };
}

async function grantFlies(
  userId: string,
  amount: number,
  grantId: string,
  meta: Record<string, unknown>,
) {
  const updated = await UserModel.findByIdAndUpdate(
    userId,
    { $inc: { 'wardrobe.flies': amount } },
    { new: true },
  )
    .select('wardrobe.flies')
    .lean<{ wardrobe?: { flies?: number } } | null>();

  const balanceAfter = updated?.wardrobe?.flies ?? 0;
  const tz = await storedEconomyTimezone(userId);
  await logFlyGrant({
    userId,
    source: 'admin',
    occurrenceKey: `grant:${grantId}`,
    dayKey: economyDayKey(tz),
    amount,
    balanceAfter,
    meta,
  });
  return { flies: balanceAfter };
}

async function grantPremium(userId: string, days: number, current?: Date) {
  const now = new Date();
  const base = current && new Date(current) > now ? new Date(current) : now;
  const premiumUntil = new Date(base.getTime() + days * DAY_MS);
  await UserModel.findByIdAndUpdate(userId, { $set: { premiumUntil } });
  return { premiumUntil };
}

async function grantItem(
  user: TargetUser,
  userId: string,
  itemId: string,
  quantity: number,
) {
  const owned = user.wardrobe?.inventory?.[itemId] ?? 0;
  const unseen = user.wardrobe?.unseenItems ?? [];
  const set: Record<string, unknown> = {};
  if (!unseen.includes(itemId)) {
    set['wardrobe.unseenItems'] = [...unseen, itemId];
  }
  if (!user.wardrobe?.inventoryHistory?.[itemId]) {
    set[`wardrobe.inventoryHistory.${itemId}`] = new Date().toISOString();
  }
  await UserModel.findByIdAndUpdate(userId, {
    $inc: { [`wardrobe.inventory.${itemId}`]: quantity },
    ...(Object.keys(set).length ? { $set: set } : {}),
  });
  return { owned: owned + quantity };
}

async function grantBackground(
  user: TargetUser,
  userId: string,
  itemId: string,
  quantity: number,
) {
  const owned = user.wardrobe?.backgrounds?.inventory?.[itemId] ?? 0;
  await UserModel.findByIdAndUpdate(userId, {
    $inc: { [`wardrobe.backgrounds.inventory.${itemId}`]: quantity },
  });
  return { owned: owned + quantity };
}

/**
 * Apply one grant and write it to the audit log. Idempotent on requestId: a
 * retry of the same submission returns the original row instead of paying twice.
 */
export async function applyGrant(
  input: GrantInput,
  admin: GrantAdmin,
): Promise<{ grant: AdminGrantDoc; duplicate: boolean }> {
  const { reason, amount } = validate(input);
  await connectMongo();

  const user = await loadTarget(input.userId);
  const entry =
    input.kind === 'item' || input.kind === 'background'
      ? await resolveCatalogEntry(input.kind, input.itemId)
      : null;

  const before =
    input.kind === 'flies'
      ? { flies: user.wardrobe?.flies ?? 0 }
      : input.kind === 'premium'
        ? { premiumUntil: user.premiumUntil ?? null }
        : input.kind === 'item'
          ? { owned: user.wardrobe?.inventory?.[entry!.id] ?? 0 }
          : { owned: user.wardrobe?.backgrounds?.inventory?.[entry!.id] ?? 0 };

  let grant: AdminGrantDoc;
  try {
    grant = (await AdminGrantModel.create({
      requestId: input.requestId,
      adminId: admin.uid,
      adminEmail: admin.email,
      userId: input.userId,
      userName: user.name,
      userEmail: user.email,
      kind: input.kind,
      amount,
      itemId: entry?.id,
      itemName: entry?.name,
      reason,
      status: 'applied',
      before,
    })) as unknown as AdminGrantDoc;
  } catch (error: any) {
    if (error?.code === 11000) {
      const existing = await AdminGrantModel.findOne({
        requestId: input.requestId,
      }).lean<AdminGrantDoc | null>();
      if (existing) return { grant: existing, duplicate: true };
    }
    throw error;
  }

  const grantId = String(grant._id);
  try {
    let after: Record<string, unknown>;
    if (input.kind === 'flies') {
      after = await grantFlies(input.userId, amount, grantId, {
        adminId: admin.uid,
        reason,
      });
    } else if (input.kind === 'premium') {
      after = await grantPremium(input.userId, amount, user.premiumUntil);
    } else if (input.kind === 'item') {
      after = await grantItem(user, input.userId, entry!.id, amount);
    } else {
      after = await grantBackground(user, input.userId, entry!.id, amount);
    }

    const saved = await AdminGrantModel.findByIdAndUpdate(
      grant._id,
      { $set: { after } },
      { new: true },
    ).lean<AdminGrantDoc | null>();
    return { grant: saved ?? grant, duplicate: false };
  } catch (error) {
    await AdminGrantModel.findByIdAndUpdate(grant._id, {
      $set: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    throw error;
  }
}

async function revertFlies(userId: string, amount: number, grantId: string) {
  const user = await UserModel.findById(userId)
    .select('wardrobe.flies')
    .lean<{ wardrobe?: { flies?: number } } | null>();
  const balance = user?.wardrobe?.flies ?? 0;
  const taken = Math.min(amount, balance);
  if (taken > 0) {
    await UserModel.findByIdAndUpdate(userId, {
      $inc: { 'wardrobe.flies': -taken },
    });
    const tz = await storedEconomyTimezone(userId);
    await recordFlySpend({
      userId,
      source: 'admin',
      occurrenceKey: `revert:${grantId}`,
      dayKey: economyDayKey(tz),
      amount: taken,
      balanceAfter: balance - taken,
      meta: { revertOf: grantId },
    });
  }
  return { taken, shortfall: amount - taken, flies: balance - taken };
}

async function revertPremium(userId: string, days: number) {
  const user = await UserModel.findById(userId)
    .select('premiumUntil')
    .lean<{ premiumUntil?: Date } | null>();
  if (!user?.premiumUntil) return { premiumUntil: null };
  const now = new Date();
  const next = new Date(new Date(user.premiumUntil).getTime() - days * DAY_MS);
  if (next <= now) {
    await UserModel.findByIdAndUpdate(userId, { $unset: { premiumUntil: '' } });
    return { premiumUntil: null };
  }
  await UserModel.findByIdAndUpdate(userId, { $set: { premiumUntil: next } });
  return { premiumUntil: next };
}

async function revertOwned(
  userId: string,
  kind: 'item' | 'background',
  itemId: string,
  quantity: number,
) {
  const user = await loadTarget(userId);
  const path =
    kind === 'item'
      ? `wardrobe.inventory.${itemId}`
      : `wardrobe.backgrounds.inventory.${itemId}`;
  const owned =
    kind === 'item'
      ? (user.wardrobe?.inventory?.[itemId] ?? 0)
      : (user.wardrobe?.backgrounds?.inventory?.[itemId] ?? 0);
  const taken = Math.min(quantity, owned);
  const remaining = owned - taken;

  const set: Record<string, unknown> = {};
  const unset: Record<string, string> = {};

  if (remaining > 0) {
    set[path] = remaining;
  } else {
    unset[path] = '';
    if (kind === 'background') {
      if (user.wardrobe?.backgrounds?.equipped === itemId) {
        set['wardrobe.backgrounds.equipped'] = null;
      }
    } else {
      const equipped = user.wardrobe?.equipped ?? {};
      const slot = Object.keys(equipped).find((key) => equipped[key] === itemId);
      if (slot) set[`wardrobe.equipped.${slot}`] = null;
    }
  }

  await UserModel.findByIdAndUpdate(userId, {
    ...(Object.keys(set).length ? { $set: set } : {}),
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  });
  return { taken, shortfall: quantity - taken, owned: remaining };
}

/** Undo an applied grant with the inverse mutation, never below zero. */
export async function revertGrant(
  grantId: string,
  admin: GrantAdmin,
): Promise<AdminGrantDoc> {
  await connectMongo();
  const grant =
    await AdminGrantModel.findById(grantId).lean<AdminGrantDoc | null>();
  if (!grant) throw new GrantError('Grant not found', 404);
  if (grant.status === 'reverted') throw new GrantError('Already reverted');
  if (grant.status === 'failed') {
    throw new GrantError('That grant never applied');
  }

  let revertResult: Record<string, unknown>;
  if (grant.kind === 'flies') {
    revertResult = await revertFlies(grant.userId, grant.amount, grantId);
  } else if (grant.kind === 'premium') {
    revertResult = await revertPremium(grant.userId, grant.amount);
  } else {
    revertResult = await revertOwned(
      grant.userId,
      grant.kind,
      grant.itemId!,
      grant.amount,
    );
  }

  const saved = await AdminGrantModel.findByIdAndUpdate(
    grantId,
    {
      $set: {
        status: 'reverted',
        revertedAt: new Date(),
        revertedBy: admin.uid,
        revertedByEmail: admin.email,
        revertResult,
      },
    },
    { new: true },
  ).lean<AdminGrantDoc | null>();

  return saved ?? grant;
}

export async function listGrants(options: {
  userId?: string;
  limit?: number;
}): Promise<AdminGrantDoc[]> {
  await connectMongo();
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const filter = options.userId ? { userId: options.userId } : {};
  return AdminGrantModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<AdminGrantDoc[]>();
}
