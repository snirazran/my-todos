import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import type { UserDoc, UserSkins } from '@/lib/types/UserDoc';
import { CATALOG, byId } from '@/lib/skins/catalog';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

/** Ensure user.skins exists and contains all catalog ids (with 0 if missing). */
async function ensureSkins(email: string) {
  const db = (await clientPromise).db('todoTracker');
  const users = db.collection<UserDoc>('users');
  const user = await users.findOne({ email });
  if (!user) return null;

  const current: UserSkins = user.skins ?? {
    equippedId: 'skin0_common',
    inventory: { skin0_common: 1 },
    flies: 0,
  };

  // Fill any missing catalog ids with 0
  const inv = { ...current.inventory };
  for (const s of CATALOG) {
    if (inv[s.id] == null) inv[s.id] = 0;
  }

  // If equippedId points to a skin the user doesn't own at least 1 copy of,
  // fallback to first owned or common.
  let equippedId = current.equippedId;
  if (!inv[equippedId] || inv[equippedId] <= 0) {
    const firstOwned = Object.entries(inv).find(([, n]) => (n ?? 0) > 0)?.[0];
    equippedId = firstOwned ?? 'skin0_common';
  }

  const next: UserSkins = { ...current, inventory: inv, equippedId };

  if (
    !user.skins ||
    user.skins.equippedId !== next.equippedId ||
    JSON.stringify(user.skins.inventory) !== JSON.stringify(inv)
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

  // Also return catalog so client can map riveIndex etc.
  return json({ skins, catalog: CATALOG });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return json({ error: 'Unauthorized' }, 401);

  let body: { skinId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const skinId = body.skinId;
  if (!skinId || !byId[skinId]) return json({ error: 'Unknown skinId' }, 400);

  const db = (await clientPromise).db('todoTracker');
  const users = db.collection<UserDoc>('users');

  // Only allow equip if user owns ≥ 1
  const user = await users.findOne({ email: session.user.email });
  if (!user) return json({ error: 'User not found' }, 404);
  const inv = user.skins?.inventory ?? {};
  if (!inv[skinId] || inv[skinId] <= 0) {
    return json({ error: 'You do not own this skin' }, 403);
  }

  await users.updateOne(
    { _id: user._id },
    { $set: { 'skins.equippedId': skinId } }
  );

  return json({ ok: true });
}
