import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import type { UserDoc, UserWardrobe } from '@/lib/types/UserDoc';
import { CATALOG, byId, type WardrobeSlot } from '@/lib/skins/catalog';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

/** Ensure user.wardrobe exists; sanitize equipped vs inventory */
async function ensureWardrobe(email: string) {
  const db = (await clientPromise).db('todoTracker');
  const users = db.collection<UserDoc>('users');
  const user = await users.findOne({ email });
  if (!user) return null;

  const current: UserWardrobe = user.wardrobe ?? {
    equipped: {},
    inventory: {},
    flies: 0,
  };

  // If equipped item is not owned anymore, null it
  const nextEquipped: UserWardrobe['equipped'] = { ...current.equipped };
  for (const slot of ['skin', 'hat', 'scarf', 'hand_item'] as WardrobeSlot[]) {
    const id = nextEquipped[slot];
    if (id && (!current.inventory[id] || current.inventory[id] <= 0)) {
      nextEquipped[slot] = null;
    }
  }
  const next: UserWardrobe = { ...current, equipped: nextEquipped };

  if (
    !user.wardrobe ||
    JSON.stringify(user.wardrobe) !== JSON.stringify(next)
  ) {
    await users.updateOne({ _id: user._id }, { $set: { wardrobe: next } });
  }

  return next;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return json({ error: 'Unauthorized' }, 401);

  const wardrobe = await ensureWardrobe(session.user.email);
  if (!wardrobe) return json({ error: 'User not found' }, 404);

  return json({ wardrobe, catalog: CATALOG });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return json({ error: 'Unauthorized' }, 401);

  let body: { slot?: WardrobeSlot; itemId?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const slot = body.slot;
  const itemId = body.itemId ?? null; // null => unequip

  if (!slot || !['skin', 'hat', 'scarf', 'hand_item'].includes(slot))
    return json({ error: 'Unknown slot' }, 400);

  const db = (await clientPromise).db('todoTracker');
  const users = db.collection<UserDoc>('users');
  const user = await users.findOne({ email: session.user.email });
  if (!user) return json({ error: 'User not found' }, 404);

  const wardrobe = user.wardrobe ?? { equipped: {}, inventory: {}, flies: 0 };

  // Unequip for this slot
  if (itemId === null) {
    await users.updateOne(
      { _id: user._id },
      { $set: { [`wardrobe.equipped.${slot}`]: null } }
    );
    return json({ ok: true });
  }

  // Equip: must exist in catalog, match the slot, and be owned
  const def = byId[itemId];
  if (!def) return json({ error: 'Unknown itemId' }, 400);
  if (def.slot !== slot)
    return json({ error: 'Item does not match slot' }, 400);

  if ((wardrobe.inventory[itemId] ?? 0) <= 0)
    return json({ error: 'You do not own this item' }, 403);

  await users.updateOne(
    { _id: user._id },
    { $set: { [`wardrobe.equipped.${slot}`]: itemId } }
  );
  return json({ ok: true });
}
