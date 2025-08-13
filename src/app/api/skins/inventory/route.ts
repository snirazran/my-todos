// app/api/skins/inventory/route.ts
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import type { UserDoc, UserSkins } from '@/lib/types/UserDoc';
import { CATALOG, byId } from '@/lib/skins/catalog';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

/** Ensure user.skins exists. Default is *no skin equipped* and empty inventory. */
async function ensureSkins(email: string) {
  const db = (await clientPromise).db('todoTracker');
  const users = db.collection<UserDoc>('users');
  const user = await users.findOne({ email });
  if (!user) return null;

  const current: UserSkins = user.skins ?? {
    equippedId: null, // default: none
    inventory: {}, // default: empty
    flies: 0,
  };

  // If equippedId points to a skin not owned anymore, reset to none
  let equippedId = current.equippedId;
  if (
    equippedId &&
    (!current.inventory[equippedId] || current.inventory[equippedId] <= 0)
  ) {
    equippedId = null;
  }

  const next: UserSkins = { ...current, equippedId };

  // Only write if we have no skins yet or something changed
  if (
    !user.skins ||
    user.skins.equippedId !== next.equippedId ||
    JSON.stringify(user.skins.inventory) !== JSON.stringify(next.inventory)
  ) {
    await users.updateOne({ _id: user._id }, { $set: { skins: next } });
  }

  return next;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return json({ error: 'Unauthorized' }, 401);

  const skins = await ensureSkins(session.user.email);
  if (!skins) return json({ error: 'User not found' }, 404);

  // keep returning catalog for client-side metadata (icon, rarity, etc.)
  return json({ skins, catalog: CATALOG });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return json({ error: 'Unauthorized' }, 401);

  let body: { skinId?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const skinId = body.skinId ?? null; // null => unequip

  const db = (await clientPromise).db('todoTracker');
  const users = db.collection<UserDoc>('users');
  const user = await users.findOne({ email: session.user.email });
  if (!user) return json({ error: 'User not found' }, 404);

  // Unequip
  if (skinId === null) {
    await users.updateOne(
      { _id: user._id },
      { $set: { 'skins.equippedId': null } }
    );
    return json({ ok: true });
  }

  // Equip (must be a real skin and owned)
  if (!byId[skinId]) return json({ error: 'Unknown skinId' }, 400);
  const inv = user.skins?.inventory ?? {};
  if (!inv[skinId] || inv[skinId] <= 0)
    return json({ error: 'You do not own this skin' }, 403);

  await users.updateOne(
    { _id: user._id },
    { $set: { 'skins.equippedId': skinId } }
  );
  return json({ ok: true });
}
